import { randomUUID } from 'node:crypto';
import type { ActivityRepository } from '../database/repositories/activities.repository.js';
import type { DeletionRepository } from '../database/repositories/deletion.repository.js';
import { AppError, SetChangedError } from '../domain/errors.js';
import type { ActivityFacts, ProtectionPolicy } from '../protection/engine.js';
import { evaluateProtection } from '../protection/engine.js';
import { assertLiveAutomationAvailable } from '../safety/live-automation.js';
import type { CompiledDateFilter } from '../scanner/filters.js';
import { canTransition } from './state-machine.js';
import type { ActivityRecord, ActivityStatus, ActivityTypeFilter } from '../types/activity.js';
import { authorizeDeletion, confirmationPhrase } from './confirmation.js';
import { interpretObservation, type DeletionObservation } from './deletion-verifier.js';

const EXECUTABLE_TYPES = new Set(['post', 'comment']);

export interface ActivityDeleter {
  kind: 'simulated' | 'unavailable' | 'live';
  deleteActivity(
    activity: ActivityRecord,
    context: { signal: AbortSignal },
  ): Promise<DeletionObservation>;
  close?(): Promise<void>;
}

export class UnavailableFacebookDeleter implements ActivityDeleter {
  readonly kind = 'unavailable' as const;

  async deleteActivity(): Promise<DeletionObservation> {
    throw new AppError('Live Facebook deletion is not available in this build.', 2);
  }
}

export interface DeletionSummary {
  dryRun: boolean;
  phrase: string;
  eligibleIds: string[];
  withheldIds: string[];
  deletedIds: string[];
  failedIds: string[];
  skippedIds: string[];
  reviewIds: string[];
  jobId: string | null;
  description: string;
  stoppedBecause: string | null;
}

export interface DeletionEngineDeps {
  activities: ActivityRepository;
  jobs: DeletionRepository;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface DeletionRequest {
  mode: 'live' | 'simulated';
  execute: boolean;
  phrase: string | null;
  filter: CompiledDateFilter;
  filters: Record<string, unknown>;
  type: ActivityTypeFilter;
  policy: ProtectionPolicy;
  limit: number | null;
  delays: { minMs: number; maxMs: number };
  maxConsecutiveFailures: number;
  loadFacts: (activity: ActivityRecord) => ActivityFacts;
  deleter: ActivityDeleter;
  signal?: AbortSignal;
  beforeEachDelete?: (activity: ActivityRecord) => void;
  onProgress?: (event: DeletionProgress) => void;
}

export interface DeletionProgress {
  index: number;
  total: number;
  phase: 'opening' | 'done';
  outcome?: 'deleted' | 'failed' | 'requires_review' | 'skipped';
  elapsedMs: number;
  remainingMs: number | null;
}

function typeIncluded(
  filter: ActivityTypeFilter,
  activityType: ActivityRecord['activityType'],
): boolean {
  return filter === 'all' || filter === activityType;
}

function byAge(left: ActivityRecord, right: ActivityRecord): number {
  const leftKey = left.occurredText ?? '9999';
  const rightKey = right.occurredText ?? '9999';
  if (leftKey === rightKey) {
    return left.id.localeCompare(right.id);
  }
  return leftKey < rightKey ? -1 : 1;
}

async function pause(
  minMs: number,
  maxMs: number,
  random: () => number,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  if (minMs === 0 && maxMs === 0) {
    return;
  }
  const span = Math.max(0, maxMs - minMs);
  await sleep(minMs + Math.floor(random() * (span + 1)));
}

export function recoverInFlightDeletions(
  activities: ActivityRepository,
  now: Date,
): { reviewed: string[]; requeued: string[] } {
  const reviewed: string[] = [];
  const requeued: string[] = [];
  for (const activity of activities.listByStatuses(['deleting', 'pending'])) {
    if (activity.status === 'deleting') {
      activities.transition(activity.id, 'requires_review', now, {
        lastError:
          'Deletion was interrupted. The outcome is uncertain, so it will not be retried automatically.',
      });
      reviewed.push(activity.id);
    } else {
      activities.transition(activity.id, 'eligible', now, { lastError: null });
      requeued.push(activity.id);
    }
  }
  return { reviewed, requeued };
}

export class DeletionEngine {
  private readonly controller = new AbortController();

  constructor(private readonly deps: DeletionEngineDeps) {}

  requestStop(): void {
    this.controller.abort();
  }

  async run(request: DeletionRequest): Promise<DeletionSummary> {
    const now = this.deps.now ?? (() => new Date());
    const sleep =
      this.deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const random = this.deps.random ?? Math.random;
    const signal = request.signal ?? this.controller.signal;
    recoverInFlightDeletions(this.deps.activities, now());

    const evaluated = this.deps.activities
      .list()
      .filter(
        (activity) =>
          activity.status !== 'deleted' &&
          activity.status !== 'deleting' &&
          activity.status !== 'requires_review',
      )
      .filter((activity) => typeIncluded(request.type, activity.activityType))
      .filter(
        (activity) =>
          evaluateProtection(request.loadFacts(activity), request.policy).outcome === 'eligible',
      )
      .sort(byAge);
    const withheldIds = evaluated
      .filter((activity) => !EXECUTABLE_TYPES.has(activity.activityType))
      .map((activity) => activity.id);
    const eligibleIds = evaluated
      .filter((activity) => EXECUTABLE_TYPES.has(activity.activityType))
      .slice(0, request.limit ?? undefined)
      .map((activity) => activity.id);
    const phrase = confirmationPhrase(eligibleIds);
    const authorization = authorizeDeletion({
      execute: request.execute,
      phrase: request.phrase,
      ids: eligibleIds,
    });
    const description = request.filter.description;

    if (authorization.dryRun) {
      const job = this.deps.jobs.create({
        id: randomUUID(),
        dryRun: true,
        filters: request.filters,
        limitCount: request.limit,
        eligibleCount: eligibleIds.length,
        confirmationPhrase: phrase,
        now: now(),
      });
      this.deps.jobs.finish(job.id, {
        status: 'completed',
        deletedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        errorMessage: null,
        now: now(),
      });
      return {
        dryRun: true,
        phrase,
        eligibleIds,
        withheldIds,
        deletedIds: [],
        failedIds: [],
        skippedIds: [],
        reviewIds: [],
        jobId: job.id,
        description,
        stoppedBecause: null,
      };
    }

    if (
      request.deleter.kind === 'unavailable' ||
      (request.mode === 'live' && process.env.VITEST === 'true')
    ) {
      assertLiveAutomationAvailable('delete activities');
    }

    const job = this.deps.jobs.create({
      id: randomUUID(),
      dryRun: false,
      filters: request.filters,
      limitCount: request.limit,
      eligibleCount: eligibleIds.length,
      confirmationPhrase: phrase,
      now: now(),
    });

    try {
      this.deps.activities.inTransaction(() => {
        for (const id of eligibleIds) {
          const current = this.deps.activities.requireById(id);
          const decision = evaluateProtection(request.loadFacts(current), request.policy);
          if (
            decision.outcome !== 'eligible' ||
            current.status === 'deleted' ||
            current.status === 'deleting'
          ) {
            throw new SetChangedError();
          }
          if (current.status !== 'eligible') {
            if (!canTransition(current.status, 'eligible')) {
              throw new SetChangedError();
            }
            this.deps.activities.transition(id, 'eligible', now());
          }
          this.deps.activities.transition(id, 'pending', now());
        }
      });
    } catch (error) {
      this.deps.jobs.finish(job.id, {
        status: 'cancelled',
        deletedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        errorMessage: error instanceof Error ? error.message : 'cancelled',
        now: now(),
      });
      throw error;
    }

    try {
      const deletedIds: string[] = [];
      const failedIds: string[] = [];
      const skippedIds: string[] = [];
      const reviewIds: string[] = [];
      let consecutiveFailures = 0;
      let stoppedBecause: string | null = null;
      let jobStatus: 'completed' | 'interrupted' | 'failed' = 'completed';
      const startedMs = now().getTime();
      let finished = 0;
      const total = eligibleIds.length;
      const report = (
        phase: DeletionProgress['phase'],
        outcome?: DeletionProgress['outcome'],
      ): void => {
        if (phase === 'done') {
          finished += 1;
        }
        const elapsedMs = Math.max(0, now().getTime() - startedMs);
        const remainingMs =
          finished > 0 ? Math.round((elapsedMs / finished) * (total - finished)) : null;
        request.onProgress?.({
          index: phase === 'opening' ? finished + 1 : finished,
          total,
          phase,
          ...(outcome ? { outcome } : {}),
          elapsedMs,
          remainingMs,
        });
      };

      for (const id of eligibleIds) {
        if (signal.aborted) {
          stoppedBecause = 'interrupted';
          jobStatus = 'interrupted';
          break;
        }
        const queued = this.deps.activities.requireById(id);
        if (queued.status !== 'pending') {
          report('done', 'skipped');
          continue;
        }
        await pause(request.delays.minMs, request.delays.maxMs, random, sleep);
        if (signal.aborted) {
          stoppedBecause = 'interrupted';
          jobStatus = 'interrupted';
          break;
        }
        request.beforeEachDelete?.(queued);
        const decision = evaluateProtection(
          request.loadFacts(this.deps.activities.requireById(id)),
          request.policy,
        );
        if (decision.outcome !== 'eligible') {
          const nextStatus: ActivityStatus =
            decision.outcome === 'requires_review' ? 'requires_review' : 'skipped';
          this.deps.activities.transition(id, nextStatus, now(), {
            lastError: 'Protection recheck removed this activity from the deletion set.',
          });
          this.deps.jobs.addAttempt({
            id: randomUUID(),
            jobId: job.id,
            activityId: id,
            outcome: nextStatus === 'requires_review' ? 'requires_review' : 'skipped',
            verified: false,
            errorMessage: 'Removed by protection recheck.',
            now: now(),
          });
          (nextStatus === 'requires_review' ? reviewIds : skippedIds).push(id);
          report('done', nextStatus === 'requires_review' ? 'requires_review' : 'skipped');
          continue;
        }

        report('opening');
        this.deps.activities.transition(id, 'deleting', now());
        let observation: DeletionObservation;
        try {
          observation = await request.deleter.deleteActivity(this.deps.activities.requireById(id), {
            signal,
          });
        } catch {
          observation = {
            outcome: 'uncertain',
            detail: 'The deletion action threw before a verified result.',
          };
        }
        const verified = interpretObservation(observation);
        if (verified.status === 'deleted') {
          this.deps.activities.transition(id, 'deleted', now(), {
            deletedAt: now().toISOString(),
            lastError: null,
            incrementAttempt: true,
          });
          deletedIds.push(id);
          consecutiveFailures = 0;
        } else if (verified.status === 'failed') {
          this.deps.activities.transition(id, 'failed', now(), {
            lastError: observation.detail,
            incrementAttempt: true,
          });
          failedIds.push(id);
          consecutiveFailures += 1;
        } else {
          this.deps.activities.transition(id, 'requires_review', now(), {
            lastError: observation.detail,
            incrementAttempt: true,
          });
          reviewIds.push(id);
          if (verified.stopRun) {
            stoppedBecause =
              observation.outcome === 'blocked_by_facebook'
                ? 'facebook_restriction'
                : 'uncertain_outcome';
            jobStatus = 'interrupted';
          }
        }
        report(
          'done',
          verified.status === 'deleted'
            ? 'deleted'
            : verified.status === 'failed'
              ? 'failed'
              : 'requires_review',
        );
        this.deps.jobs.addAttempt({
          id: randomUUID(),
          jobId: job.id,
          activityId: id,
          outcome:
            verified.status === 'deleted'
              ? 'deleted'
              : verified.status === 'failed'
                ? 'failed'
                : 'requires_review',
          verified: verified.verified,
          errorMessage: verified.status === 'deleted' ? null : observation.detail,
          now: now(),
        });
        if (verified.stopRun || consecutiveFailures >= request.maxConsecutiveFailures) {
          if (!verified.stopRun) {
            stoppedBecause = 'repeated_failures';
            jobStatus = 'interrupted';
          }
          break;
        }
      }

      for (const id of eligibleIds) {
        const current = this.deps.activities.getById(id);
        if (current?.status === 'pending') {
          this.deps.activities.transition(id, 'eligible', now());
        }
      }
      this.deps.jobs.finish(job.id, {
        status: jobStatus,
        deletedCount: deletedIds.length,
        failedCount: failedIds.length,
        skippedCount: skippedIds.length,
        reviewCount: reviewIds.length,
        errorMessage: stoppedBecause,
        now: now(),
      });
      return {
        dryRun: false,
        phrase,
        eligibleIds,
        withheldIds,
        deletedIds,
        failedIds,
        skippedIds,
        reviewIds,
        jobId: job.id,
        description,
        stoppedBecause,
      };
    } finally {
      await request.deleter.close?.();
    }
  }
}
