import type { ActivityType } from '../types/activity.js';

interface ClassificationRule {
  type: Exclude<ActivityType, 'unknown' | 'other'>;
  patterns: RegExp[];
}

const RULES: readonly ClassificationRule[] = [
  {
    type: 'comment',
    patterns: [/\bcommented\b/iu, /\bcomentou\b/iu, /\bcomentário\b/iu, /\bcomentario\b/iu],
  },
  {
    type: 'reaction',
    patterns: [/\breacted\b/iu, /\bliked\b/iu, /\breagiu\b/iu, /\bcurtiu\b/iu, /\bgostou\b/iu],
  },
  {
    type: 'media',
    patterns: [
      /\badded (?:a |an )?(?:new )?(?:photo|video)\b/iu,
      /\badicionou (?:uma foto|um vídeo|um video)\b/iu,
      /\buploaded (?:a |an )?(?:photo|video)\b/iu,
    ],
  },
  {
    type: 'post',
    patterns: [
      /\bposted\b/iu,
      /\bpublicou\b/iu,
      /\bshared a post\b/iu,
      /\bcompartilhou uma publicação\b/iu,
    ],
  },
];

export function classifyActivityLabel(label: string | null | undefined): ActivityType {
  if (!label || !label.trim()) {
    return 'unknown';
  }
  const matches = new Set<ActivityType>();
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(label))) {
      matches.add(rule.type);
    }
  }
  if (matches.size !== 1) {
    return 'unknown';
  }
  return [...matches][0] ?? 'unknown';
}
