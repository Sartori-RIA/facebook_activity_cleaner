import type { ActivityRecord } from '../types/activity.js';
import type { ProtectionDecision } from '../protection/engine.js';
import { previewGroup, type PreviewGroup } from '../protection/preview.js';
import { publicFacebookUrl } from '../utils/facebook-url.js';

export interface ReviewedActivity {
  activity: ActivityRecord;
  decision: ProtectionDecision;
}

const GROUP_TITLES: Record<PreviewGroup, string> = {
  safe_candidates: 'Safe candidates for deletion',
  protected: 'Protected activities',
  potential_family_memories: 'Potential family memories',
  needs_review: 'Activities requiring manual review',
  skipped: 'Skipped',
};

const GROUP_ORDER: PreviewGroup[] = [
  'safe_candidates',
  'protected',
  'potential_family_memories',
  'needs_review',
  'skipped',
];

export function groupActivities(
  items: readonly ReviewedActivity[],
): Record<PreviewGroup, ReviewedActivity[]> {
  const groups: Record<PreviewGroup, ReviewedActivity[]> = {
    safe_candidates: [],
    protected: [],
    potential_family_memories: [],
    needs_review: [],
    skipped: [],
  };
  for (const item of items) {
    groups[previewGroup(item.decision)].push(item);
  }
  return groups;
}

export function renderPreviewText(items: readonly ReviewedActivity[]): string {
  const groups = groupActivities(items);
  const lines: string[] = [];
  for (const group of GROUP_ORDER) {
    const entries = groups[group];
    lines.push(`${GROUP_TITLES[group]} (${entries.length})`);
    if (entries.length === 0) {
      lines.push('  none');
    }
    for (const entry of entries) {
      const date = entry.activity.occurredText ?? 'unknown date';
      const text = entry.activity.textPreview ?? entry.activity.rawLabel ?? '(no preview)';
      lines.push(`- ${date} ${entry.activity.activityType} ${text}`);
      lines.push(`  id: ${entry.activity.id}`);
      if (entry.activity.authorName) {
        lines.push(`  author: ${entry.activity.authorName}`);
      }
      for (const reason of entry.decision.reasons) {
        lines.push(`  reason: ${reason.detail}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderReviewHtml(items: readonly ReviewedActivity[]): string {
  const groups = groupActivities(items);
  const sections = GROUP_ORDER.map((group) => {
    const cards = groups[group]
      .map((entry) => {
        const reasons = entry.decision.reasons
          .map((reason) => `<li>${escapeHtml(reason.detail)}</li>`)
          .join('');
        const address = publicFacebookUrl(entry.activity.sourceUrl);
        const link = address
          ? `<p><a href="${escapeHtml(address)}">Open the saved address</a></p>`
          : '<p>No public address was saved for this item.</p>';
        return `<article>
          <h3>${escapeHtml(entry.activity.activityType)} · ${escapeHtml(entry.activity.occurredText ?? 'unknown date')}</h3>
          <p>${escapeHtml(entry.activity.textPreview ?? '(no preview)')}</p>
          <p>Author: ${escapeHtml(entry.activity.authorName ?? 'unknown')}</p>
          <p>Ownership: ${escapeHtml(entry.activity.ownership)}</p>
          <p>Id: ${escapeHtml(entry.activity.id)}</p>
          ${link}
          <p>Thumbnail: not embedded. Remote images are omitted so this page does not contact Facebook.</p>
          <ul>${reasons}</ul>
        </article>`;
      })
      .join('\n');
    return `<section><h2>${escapeHtml(GROUP_TITLES[group])} (${groups[group].length})</h2>${cards || '<p>None</p>'}</section>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Facebook Activity Cleaner review</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; line-height: 1.4; }
    article { border: 1px solid #ccc; padding: 1rem; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <h1>Local review</h1>
  <p>This file stays on your computer. It does not load remote images or send data anywhere.</p>
  <p>Facebook deletion may be irreversible. Export your Facebook data before deleting anything.</p>
  ${sections}
</body>
</html>
`;
}
