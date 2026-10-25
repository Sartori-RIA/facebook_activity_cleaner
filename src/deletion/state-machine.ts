import { IllegalStateTransitionError } from '../domain/errors.js';
import type { ActivityStatus } from '../types/activity.js';
import type { ProtectionDecision } from '../protection/engine.js';

const TRANSITIONS: Record<ActivityStatus, readonly ActivityStatus[]> = {
  discovered: ['eligible', 'skipped', 'requires_review'],
  eligible: ['pending', 'skipped', 'requires_review', 'discovered'],
  skipped: ['eligible', 'requires_review', 'discovered'],
  pending: ['deleting', 'eligible', 'requires_review', 'skipped'],
  deleting: ['deleted', 'failed', 'requires_review'],
  deleted: [],
  failed: ['pending', 'requires_review', 'skipped', 'eligible'],
  requires_review: ['eligible', 'skipped', 'discovered'],
};

export function canTransition(from: ActivityStatus, to: ActivityStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ActivityStatus, to: ActivityStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalStateTransitionError(from, to);
  }
}

export function statusForDecision(decision: ProtectionDecision): ActivityStatus {
  switch (decision.outcome) {
    case 'eligible':
      return 'eligible';
    case 'requires_review':
      return 'requires_review';
    case 'never_delete':
    case 'not_owned':
    case 'out_of_scope':
    case 'user_skipped':
      return 'skipped';
    default: {
      const _exhaustive: never = decision.outcome;
      return _exhaustive;
    }
  }
}
