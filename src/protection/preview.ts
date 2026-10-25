import type { ProtectionDecision } from './engine.js';

export type PreviewGroup =
  'safe_candidates' | 'protected' | 'potential_family_memories' | 'needs_review' | 'skipped';

const MEDIA_REASON = new Set(['media_potential_family', 'media_unclassified', 'media_rule']);

export function previewGroup(decision: ProtectionDecision): PreviewGroup {
  if (decision.outcome === 'eligible') {
    return 'safe_candidates';
  }
  if (decision.outcome === 'never_delete') {
    return 'protected';
  }
  if (decision.outcome === 'requires_review') {
    const codes = decision.reasons.map((entry) => entry.code);
    if (codes.length > 0 && codes.every((code) => MEDIA_REASON.has(code))) {
      return 'potential_family_memories';
    }
    return 'needs_review';
  }
  return 'skipped';
}
