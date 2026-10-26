import { randomUUID } from 'node:crypto';
import type { ActivityRepository } from '../database/repositories/activities.repository.js';
import type { ProtectionRepository } from '../database/repositories/protection.repository.js';
import { canTransition, statusForDecision } from '../deletion/state-machine.js';
import type { ActivityRecord } from '../types/activity.js';
import type { CompiledDateFilter } from '../scanner/filters.js';
import { ProtectionOverrideError } from '../domain/errors.js';
import { AppError } from '../domain/errors.js';
import { evaluateProtection, type ProtectionDecision, type ProtectionPolicy } from './engine.js';
import { factsFromActivity } from './facts.js';

export interface ProtectionStores {
  activities: ActivityRepository;
  protection: ProtectionRepository;
  now?: () => Date;
}

export function loadDecision(
  stores: ProtectionStores,
  activity: ActivityRecord,
  filter: CompiledDateFilter,
  policy: ProtectionPolicy,
): ProtectionDecision {
  const review = stores.protection.latestReview(activity.id);
  return evaluateProtection(
    factsFromActivity(activity, filter, {
      explicitlyProtected: stores.protection.isExplicitlyProtected(activity.id),
      manualDecision: review?.decision ?? null,
    }),
    policy,
  );
}

export function rememberDecision(
  stores: ProtectionStores,
  activity: ActivityRecord,
  decision: ProtectionDecision,
  options: { updateStatus: boolean },
): ActivityRecord {
  const now = stores.now?.() ?? new Date();
  stores.protection.replaceMatches(
    activity.id,
    decision.reasons.map((entry) => ({
      id: randomUUID(),
      ruleId: entry.ruleId,
      action: entry.action,
      reasonCode: entry.code,
      detail: entry.detail,
    })),
    now,
  );
  if (!options.updateStatus) {
    return activity;
  }
  const next = statusForDecision(decision);
  const review = stores.protection.latestReview(activity.id);
  const explicit = stores.protection.isExplicitlyProtected(activity.id);
  const manual = review?.decision ?? null;
  const released =
    activity.status !== 'requires_review' ||
    manual === 'approve_deletion' ||
    manual === 'skip' ||
    manual === 'protect';
  const inFlight =
    activity.status === 'deleted' ||
    activity.status === 'deleting' ||
    activity.status === 'pending';
  const mayUpdate =
    released && !inFlight && (!review || decision.outcome === 'never_delete' || !explicit);
  if (mayUpdate && activity.status !== next && canTransition(activity.status, next)) {
    const metadata = {
      ...activity.metadata,
      skipReason: decision.outcome === 'eligible' ? null : decision.outcome,
    };
    return stores.activities.transition(activity.id, next, now, { metadata });
  }
  return stores.activities.requireById(activity.id);
}

export function applyManualReview(
  stores: ProtectionStores,
  input: {
    activityId: string;
    decision: 'protect' | 'approve_deletion' | 'skip';
    note: string | null;
    filter: CompiledDateFilter;
    policy: ProtectionPolicy;
  },
): { activity: ActivityRecord; decision: ProtectionDecision } {
  const now = stores.now?.() ?? new Date();
  const activity = stores.activities.requireById(input.activityId);
  if (activity.status === 'deleted' || activity.status === 'deleting') {
    throw new AppError(
      'This activity is already deleted or a deletion is in progress. Facebook deletion may be irreversible.',
    );
  }
  const explicit = stores.protection.isExplicitlyProtected(activity.id);
  if (input.decision === 'approve_deletion') {
    const blocked = evaluateProtection(
      factsFromActivity(activity, input.filter, {
        explicitlyProtected: explicit,
        manualDecision: null,
      }),
      input.policy,
    );
    if (blocked.outcome === 'never_delete' || blocked.outcome === 'not_owned') {
      throw new ProtectionOverrideError(activity.id);
    }
    const prospective = evaluateProtection(
      factsFromActivity(activity, input.filter, {
        explicitlyProtected: explicit,
        manualDecision: 'approve_deletion',
      }),
      input.policy,
    );
    if (prospective.outcome !== 'eligible') {
      throw new AppError(
        prospective.reasons.map((reason) => reason.detail).join(' ') ||
          'Approval was not accepted.',
      );
    }
  }
  stores.protection.addReview({
    id: randomUUID(),
    activityId: activity.id,
    decision: input.decision,
    note: input.note,
    now,
  });
  if (input.decision === 'protect') {
    stores.protection.protectActivity({
      activityId: activity.id,
      reason: input.note ?? 'Marked protected during review.',
      ruleId: null,
      source: 'manual',
      now,
    });
  }
  const updated = stores.activities.requireById(activity.id);
  const decision = loadDecision(stores, updated, input.filter, input.policy);
  const saved = rememberDecision(stores, updated, decision, { updateStatus: true });
  return { activity: saved, decision };
}
