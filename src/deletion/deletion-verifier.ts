export type DeletionObservation =
  | { outcome: 'deleted'; detail: string }
  | { outcome: 'not_deleted'; detail: string }
  | { outcome: 'uncertain'; detail: string }
  | { outcome: 'blocked_by_facebook'; detail: string };

export interface VerifiedDeletion {
  status: 'deleted' | 'failed' | 'requires_review';
  verified: boolean;
  stopRun: boolean;
}

export function interpretObservation(observation: DeletionObservation): VerifiedDeletion {
  if (observation.outcome === 'deleted') {
    if (!observation.detail.trim()) {
      return { status: 'requires_review', verified: false, stopRun: true };
    }
    return { status: 'deleted', verified: true, stopRun: false };
  }
  if (observation.outcome === 'not_deleted') {
    return { status: 'failed', verified: false, stopRun: false };
  }
  return { status: 'requires_review', verified: false, stopRun: true };
}
