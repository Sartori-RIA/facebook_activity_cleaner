import { createHash } from 'node:crypto';
import type { DatePrecision, ActivityType } from '../types/activity.js';
import { foldText, collapseWhitespace } from '../utils/text.js';
import { normalizeUrl } from '../utils/url.js';

export interface FingerprintInput {
  activityType: ActivityType;
  sourceUrl?: string | null;
  occurredText?: string | null;
  datePrecision: DatePrecision;
  textPreview?: string | null;
  authorProfileId?: string | null;
  authorProfileUrl?: string | null;
  authorName?: string | null;
}

export function fingerprintActivity(input: FingerprintInput): string {
  const canonical = {
    v: 1,
    type: input.activityType,
    url: normalizeUrl(input.sourceUrl) ?? '',
    date: input.occurredText ?? '',
    precision: input.datePrecision,
    text: foldText(collapseWhitespace(input.textPreview ?? '')).slice(0, 500),
    author:
      input.authorProfileId ??
      normalizeUrl(input.authorProfileUrl) ??
      foldText(input.authorName ?? ''),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
