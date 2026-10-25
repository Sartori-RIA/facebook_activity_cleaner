import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IllegalStateTransitionError } from '../../src/domain/errors.js';
import { authorizeDeletion, confirmationPhrase } from '../../src/deletion/confirmation.js';
import {
  DeletionEngine,
  UnavailableFacebookDeleter,
  recoverInFlightDeletions,
  type ActivityDeleter,
} from '../../src/deletion/deletion-engine.js';
import { interpretObservation } from '../../src/deletion/deletion-verifier.js';
import { assertTransition } from '../../src/deletion/state-machine.js';
import { factsFromActivity } from '../../src/protection/facts.js';
import { applyManualReview } from '../../src/protection/refresh.js';
import { compileDateFilter } from '../../src/scanner/filters.js';
import { FACEBOOK_SELECTORS_VALIDATED } from '../../src/facebook/selectors/registry.js';
import { activityHandlers } from '../../src/facebook/handlers/index.js';
import { LIVE_FACEBOOK_AUTOMATION_ENABLED } from '../../src/safety/live-automation.js';
import { sanitizeLogMessage, sanitizeUnknown } from '../../src/logging/redact.js';
import { toCsv } from '../../src/export/serialize.js';
import { renderReviewHtml } from '../../src/review/report.js';
import { publicFacebookUrl } from '../../src/utils/facebook-url.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { emptyMetadata } from '../../src/types/activity.js';
import type { ActivityRecord } from '../../src/types/activity.js';
import type { DeletionObservation } from '../../src/deletion/deletion-verifier.js';
import { basePolicy, createStores, storeOwnedPost } from '../helpers.js';

const filter = compileDateFilter({ before: '2017-01-01' }, 'UTC');

function factsFor(stores: ReturnType<typeof createStores>, activity: ActivityRecord) {
  const review = stores.protection.latestReview(activity.id);
  return factsFromActivity(activity, filter, {
    explicitlyProtected: stores.protection.isExplicitlyProtected(activity.id),
    manualDecision: review?.decision ?? null,
  });
}

function engineFor(stores: ReturnType<typeof createStores>) {
  return new DeletionEngine({
    activities: stores.activities,
    jobs: stores.jobs,
    sleep: async () => undefined,
    random: () => 0,
  });
}

describe('state transitions', () => {
  it('rejects a deleted activity moving backwards', () => {
    expect(() => assertTransition('deleted', 'eligible')).toThrow(IllegalStateTransitionError);
    expect(() => assertTransition('deleting', 'eligible')).toThrow(IllegalStateTransitionError);
    expect(() => assertTransition('requires_review', 'pending')).toThrow(
      IllegalStateTransitionError,
    );
  });
});

describe('deletion safety', () => {
  it('dry-run does not call the deleter or change status', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities);
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity() {
        throw new Error('deleter should not be called');
      },
    };
    const summary = await engineFor(stores).run({
      mode: 'simulated',
      execute: false,
      phrase: null,
      filter,
      filters: { before: '2017-01-01' },
      type: 'all',
      policy: basePolicy(),
      limit: 25,
      delays: { minMs: 0, maxMs: 0 },
      maxConsecutiveFailures: 3,
      loadFacts: (item) => factsFor(stores, item),
      deleter,
    });
    expect(summary.dryRun).toBe(true);
    expect(summary.eligibleIds).toEqual([activity.id]);
    expect(stores.activities.requireById(activity.id).status).toBe('eligible');
    expect(stores.jobs.latest()?.dryRun).toBe(true);
    stores.close();
  });

  it('rejects the wrong confirmation phrase before changing anything', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities);
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity() {
        return { outcome: 'deleted', detail: 'gone' };
      },
    };
    await expect(
      engineFor(stores).run({
        mode: 'simulated',
        execute: true,
        phrase: 'DELETE 1 ACTIVITIES 00000000',
        filter,
        filters: { before: '2017-01-01' },
        type: 'post',
        policy: basePolicy(),
        limit: 25,
        delays: { minMs: 0, maxMs: 0 },
        maxConsecutiveFailures: 3,
        loadFacts: (item) => factsFor(stores, item),
        deleter,
      }),
    ).rejects.toThrow(/DELETE 1 ACTIVITIES/);
    expect(stores.activities.requireById(activity.id).status).toBe('eligible');
    stores.close();
  });

  it('refuses live deletion even with the correct phrase', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities);
    const ids = [activity.id];
    await expect(
      engineFor(stores).run({
        mode: 'live',
        execute: true,
        phrase: confirmationPhrase(ids),
        filter,
        filters: { before: '2017-01-01' },
        type: 'all',
        policy: basePolicy(),
        limit: 25,
        delays: { minMs: 0, maxMs: 0 },
        maxConsecutiveFailures: 3,
        loadFacts: (item) => factsFor(stores, item),
        deleter: new UnavailableFacebookDeleter(),
      }),
    ).rejects.toThrow(/not validated|Refusing to delete/);
    expect(stores.activities.requireById(activity.id).status).toBe('eligible');
    stores.close();
  });

  it('verifies a simulated deletion and will not call it twice', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities);
    const calls: string[] = [];
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity(item) {
        calls.push(item.id);
        return { outcome: 'deleted', detail: 'The fixture row was removed.' };
      },
    };
    const phrase = confirmationPhrase([activity.id]);
    const request = {
      mode: 'simulated' as const,
      execute: true,
      phrase,
      filter,
      filters: { before: '2017-01-01' },
      type: 'all' as const,
      policy: basePolicy(),
      limit: 25,
      delays: { minMs: 0, maxMs: 0 },
      maxConsecutiveFailures: 3,
      loadFacts: (item: ActivityRecord) => factsFor(stores, item),
      deleter,
    };
    const summary = await engineFor(stores).run(request);
    expect(summary.deletedIds).toEqual([activity.id]);
    expect(stores.activities.requireById(activity.id).status).toBe('deleted');
    expect(stores.activities.requireById(activity.id).deletedAt).toBeTruthy();
    const again = await engineFor(stores).run({ ...request, execute: false, phrase: null });
    expect(again.eligibleIds).toEqual([]);
    expect(calls).toEqual([activity.id]);
    stores.close();
  });

  it('rechecks protection immediately before deleting', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities, { textPreview: 'hello there' });
    let calls = 0;
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity() {
        calls += 1;
        return { outcome: 'deleted', detail: 'removed' };
      },
    };
    await engineFor(stores).run({
      mode: 'simulated',
      execute: true,
      phrase: confirmationPhrase([activity.id]),
      filter,
      filters: { before: '2017-01-01' },
      type: 'all',
      policy: basePolicy(),
      limit: 25,
      delays: { minMs: 0, maxMs: 0 },
      maxConsecutiveFailures: 3,
      loadFacts: (item) => factsFor(stores, item),
      deleter,
      beforeEachDelete() {
        stores.protection.protectActivity({
          activityId: activity.id,
          reason: 'Added during the run.',
          ruleId: null,
          source: 'manual',
          now: new Date(),
        });
      },
    });
    expect(calls).toBe(0);
    expect(stores.activities.requireById(activity.id).status).toBe('skipped');
    stores.close();
  });

  it('does not delete another person, an unknown date, or a family keyword', async () => {
    const stores = createStores();
    storeOwnedPost(stores.activities, {
      ownership: 'not_owned',
      textPreview: 'someone else',
      sourceUrl: 'https://www.facebook.com/fixture/posts/other',
    });
    storeOwnedPost(stores.activities, {
      occurredText: null,
      datePrecision: 'unknown',
      textPreview: 'undated',
      sourceUrl: 'https://www.facebook.com/fixture/posts/undated',
      status: 'requires_review',
    });
    storeOwnedPost(stores.activities, {
      textPreview: 'Natal com a família',
      sourceUrl: 'https://www.facebook.com/fixture/posts/family',
      status: 'skipped',
    });
    const calls: string[] = [];
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity(item) {
        calls.push(item.id);
        return { outcome: 'deleted', detail: 'removed' };
      },
    };
    const summary = await engineFor(stores).run({
      mode: 'simulated',
      execute: false,
      phrase: null,
      filter,
      filters: { before: '2017-01-01' },
      type: 'all',
      policy: basePolicy(),
      limit: 25,
      delays: { minMs: 0, maxMs: 0 },
      maxConsecutiveFailures: 3,
      loadFacts: (item) => factsFor(stores, item),
      deleter,
    });
    expect(summary.eligibleIds).toEqual([]);
    expect(calls).toEqual([]);
    stores.close();
  });

  it('treats an uncertain outcome as review and does not retry it', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities);
    let calls = 0;
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity(): Promise<DeletionObservation> {
        calls += 1;
        return { outcome: 'uncertain', detail: 'The dialog closed without a result.' };
      },
    };
    const first = await engineFor(stores).run({
      mode: 'simulated',
      execute: true,
      phrase: confirmationPhrase([activity.id]),
      filter,
      filters: { before: '2017-01-01' },
      type: 'all',
      policy: basePolicy(),
      limit: 25,
      delays: { minMs: 0, maxMs: 0 },
      maxConsecutiveFailures: 3,
      loadFacts: (item) => factsFor(stores, item),
      deleter,
    });
    expect(first.reviewIds).toEqual([activity.id]);
    expect(first.stoppedBecause).toBe('uncertain_outcome');
    expect(stores.activities.requireById(activity.id).status).toBe('requires_review');
    const second = await engineFor(stores).run({
      mode: 'simulated',
      execute: false,
      phrase: null,
      filter,
      filters: { before: '2017-01-01' },
      type: 'all',
      policy: basePolicy(),
      limit: 25,
      delays: { minMs: 0, maxMs: 0 },
      maxConsecutiveFailures: 3,
      loadFacts: (item) => factsFor(stores, item),
      deleter,
    });
    expect(second.eligibleIds).toEqual([]);
    expect(calls).toBe(1);
    stores.close();
  });

  it('retries a certain failure only on a later explicit run', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities);
    const responses: DeletionObservation[] = [
      { outcome: 'not_deleted', detail: 'The menu did not contain delete.' },
      { outcome: 'deleted', detail: 'The row disappeared.' },
    ];
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity() {
        return responses.shift() ?? { outcome: 'uncertain', detail: 'missing' };
      },
    };
    const run = (phrase: string | null, execute: boolean) =>
      engineFor(stores).run({
        mode: 'simulated',
        execute,
        phrase,
        filter,
        filters: { before: '2017-01-01' },
        type: 'all',
        policy: basePolicy(),
        limit: 25,
        delays: { minMs: 0, maxMs: 0 },
        maxConsecutiveFailures: 3,
        loadFacts: (item) => factsFor(stores, item),
        deleter,
      });
    await run(confirmationPhrase([activity.id]), true);
    expect(stores.activities.requireById(activity.id).status).toBe('failed');
    const phrase = confirmationPhrase([activity.id]);
    await run(phrase, true);
    expect(stores.activities.requireById(activity.id).status).toBe('deleted');
    stores.close();
  });

  it('stops after repeated certain failures and leaves the rest eligible', async () => {
    const stores = createStores();
    const ids = ['one', 'two', 'three', 'four'].map(
      (name, index) =>
        storeOwnedPost(stores.activities, {
          textPreview: `note ${name}`,
          sourceUrl: `https://www.facebook.com/fixture/posts/${index}`,
          occurredText: `2015-01-0${index + 1}`,
        }).id,
    );
    let calls = 0;
    const deleter: ActivityDeleter = {
      kind: 'simulated',
      async deleteActivity() {
        calls += 1;
        return { outcome: 'not_deleted', detail: 'visible failure' };
      },
    };
    const summary = await engineFor(stores).run({
      mode: 'simulated',
      execute: true,
      phrase: confirmationPhrase(ids),
      filter,
      filters: { before: '2017-01-01' },
      type: 'all',
      policy: basePolicy(),
      limit: 25,
      delays: { minMs: 0, maxMs: 0 },
      maxConsecutiveFailures: 3,
      loadFacts: (item) => factsFor(stores, item),
      deleter,
    });
    expect(summary.stoppedBecause).toBe('repeated_failures');
    expect(calls).toBe(3);
    expect(stores.activities.requireById(ids[3] ?? '').status).toBe('eligible');
    stores.close();
  });

  it('moves an interrupted deleting row to review and does not retry it', () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities, { status: 'deleting' });
    const recovered = recoverInFlightDeletions(stores.activities, new Date());
    expect(recovered.reviewed).toEqual([activity.id]);
    expect(stores.activities.requireById(activity.id).status).toBe('requires_review');
    stores.close();
  });

  it('does not claim deletion when the success signal is empty', () => {
    expect(interpretObservation({ outcome: 'deleted', detail: '   ' })).toEqual({
      status: 'requires_review',
      verified: false,
      stopRun: true,
    });
    expect(interpretObservation({ outcome: 'deleted', detail: 'row removed' }).verified).toBe(true);
    expect(
      interpretObservation({ outcome: 'blocked_by_facebook', detail: 'checkpoint' }).stopRun,
    ).toBe(true);
  });

  it('blocks approval of a protected activity', () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities, { textPreview: 'minha família' });
    expect(() =>
      applyManualReview(
        { activities: stores.activities, protection: stores.protection },
        {
          activityId: activity.id,
          decision: 'approve_deletion',
          note: null,
          filter,
          policy: basePolicy(),
        },
      ),
    ).toThrow(/explicitly protected/);
    expect(stores.protection.latestReview(activity.id)).toBeNull();
    stores.close();
  });
});

describe('local safety guards', () => {
  it('keeps live facebook automation disabled', () => {
    expect(LIVE_FACEBOOK_AUTOMATION_ENABLED).toBe(false);
    expect(FACEBOOK_SELECTORS_VALIDATED).toBe(false);
    expect(activityHandlers.every((handler) => handler.liveUiValidated === false)).toBe(true);
  });

  it('redacts cookies and passwords', () => {
    expect(sanitizeLogMessage('c_user=123; xs=abc; password=hunter2')).toBe(
      '[Redacted]; [Redacted]; [Redacted]',
    );
    expect(sanitizeUnknown({ cookie: 'c_user=1', note: 'xs=secret' })).toEqual({
      cookie: '[Redacted]',
      note: '[Redacted]',
    });
  });

  it('neutralizes spreadsheet formulas in csv export', () => {
    const csv = toCsv([
      {
        id: '1',
        type: 'post',
        status: 'eligible',
        date: '2015-06-01',
        precision: 'day',
        ownership: 'owned',
        text: '=cmd()',
        url: '',
        author: 'Alex',
        reasons: '',
      },
    ]);
    expect(csv).toContain("'=cmd()");
    expect(csv.startsWith('id,type,status')).toBe(true);
  });

  it('writes review html without remote images or unescaped markup', () => {
    const html = renderReviewHtml([
      {
        activity: storeOwnedPost(createStores().activities, {
          textPreview: '<img src="https://evil.test/a.jpg">',
        }),
        decision: { outcome: 'eligible', reasons: [] },
      },
    ]);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Remote images are omitted');
    expect(html).toContain('href="https://www.facebook.com/fixture/posts/');
    expect(html).not.toContain('<img src=');
  });

  it('keeps only a public facebook address as a view link', () => {
    expect(publicFacebookUrl('https://www.facebook.com/fixture/posts/1?fbclid=1#x')).toBe(
      'https://www.facebook.com/fixture/posts/1',
    );
    expect(publicFacebookUrl('https://www.facebook.com/a?c_user=1')).toBeNull();
    expect(publicFacebookUrl('https://example.com/post')).toBeNull();
    expect(publicFacebookUrl('http://www.facebook.com/a')).toBeNull();
  });

  it('does not call private facebook endpoints from the source', () => {
    const root = path.join(process.cwd(), 'src');
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          files.push(full);
        }
      }
    };
    walk(root);
    const banned = ['graph.facebook.com', 'api/graphql', 'document.cookie'];
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return banned.some((term) => source.includes(term));
    });
    expect(offenders).toEqual([]);
  });

  it('creates the browser profile outside the repo with restrictive permissions', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fb-cleaner-profile-'));
    const profile = new SessionManager(path.join(root, 'browser-profile')).ensureProfileDir();
    expect(profile.includes(`${path.sep}.git${path.sep}`)).toBe(false);
    expect(statSync(profile).mode & 0o777).toBe(0o700);
  });

  it('stores metadata needed for a protected parent author', () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities, {
      activityType: 'comment',
      metadata: { ...emptyMetadata(), parentAuthorName: 'Natanaiah' },
    });
    expect(activity.metadata.parentAuthorName).toBe('Natanaiah');
    stores.close();
  });
});

describe('confirmation phrase', () => {
  it('changes when the authorized ids change, even if the count stays the same', () => {
    expect(authorizeDeletion({ execute: false, phrase: null, ids: ['a'] }).dryRun).toBe(true);
    expect(confirmationPhrase(['a', 'b'])).not.toBe(confirmationPhrase(['b', 'c']));
    expect(confirmationPhrase(['b', 'a'])).toBe(confirmationPhrase(['a', 'b']));
  });
});
