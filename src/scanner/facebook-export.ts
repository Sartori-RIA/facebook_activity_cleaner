import type { ActivityType, DatePrecision, RawActivity } from '../types/activity.js';
import { publicFacebookUrl } from '../utils/facebook-url.js';

const MONTHS: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const EXPORT_DATE =
  /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(\d{1,2}),\s+(\d{4})\s+\d{1,2}:\d{2}:\d{2}\s+da\s+(?:manhã|tarde\/noite)/iu;

function decode(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&nbsp;', ' ');
}

function plain(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionEnd(html: string, start: number): number {
  let depth = 1;
  let index = html.indexOf('>', start) + 1;
  while (index > 0 && index < html.length && depth > 0) {
    const open = html.indexOf('<section', index);
    const close = html.indexOf('</section>', index);
    if (close === -1) {
      return -1;
    }
    if (open !== -1 && open < close) {
      depth += 1;
      index = open + '<section'.length;
    } else {
      depth -= 1;
      index = close + '</section>'.length;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function civilDay(footer: string): { occurredText: string; datePrecision: DatePrecision } | null {
  const match = EXPORT_DATE.exec(footer);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1970 ||
    year > 2100 ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    occurredText: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    datePrecision: 'day',
  };
}

function activityType(label: string, html: string): ActivityType {
  if (/\bcomentou\b/iu.test(label)) {
    return 'comment';
  }
  if (/\b(?:foto|v[ií]deo|reel)\b/iu.test(label)) {
    return 'media';
  }
  if (label.trim()) {
    return 'post';
  }
  if (/>\s*rea[cç][aã]o\s*</iu.test(html)) {
    return 'reaction';
  }
  return 'unknown';
}

function authorName(label: string): string | null {
  const match = /^(.*?)\s+(?:compartilhou|comentou|atualizou|curtiu|reagiu|publicou)\b/iu.exec(
    label,
  );
  const name = match?.[1]?.trim();
  return name || null;
}

function parentAuthor(label: string): string | null {
  const match =
    /\bcomentou (?:no post|na foto|no link|o link|na publicação|na publicacao) de (.+)$/iu.exec(
      label,
    );
  const name = match?.[1]?.trim().replace(/\.$/, '');
  if (!name || /pr[oó]pri/iu.test(name)) {
    return null;
  }
  return name;
}

function sourceUrl(html: string): string | null {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => decode(match[1] ?? ''));
  const facebook = hrefs
    .map((href) => publicFacebookUrl(href))
    .filter((href): href is string => Boolean(href));
  return facebook.find((href) => !href.includes('/dyi/')) ?? facebook[0] ?? null;
}

function sectionActivity(slice: string): RawActivity | null {
  const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(slice);
  const footer = /<footer\b[^>]*>([\s\S]*?)<\/footer>/i.exec(slice);
  const label = plain(heading?.[1] ?? '');
  const dated = civilDay(plain(footer?.[1] ?? ''));
  const body = slice
    .replace(/<h2\b[\s\S]*?<\/h2>/i, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/i, ' ');
  const text = plain(body);
  if (!label && !dated && !text) {
    return null;
  }
  const type = activityType(label, slice);
  const author = authorName(label);
  const activity: RawActivity = {
    activityType: type,
    ownership: 'owned',
    ...(label ? { label } : {}),
    ...(text ? { textPreview: text } : label ? { textPreview: label } : {}),
    ...(author ? { authorName: author } : {}),
    ...(dated ?? {}),
  };
  const url = sourceUrl(slice);
  if (url) {
    activity.sourceUrl = url;
  }
  const parent = parentAuthor(label);
  if (parent) {
    activity.parentAuthorName = parent;
  }
  if (type === 'media') {
    activity.mediaClassification = 'unclassified';
  }
  return activity;
}

export function parseFacebookExportHtml(html: string): RawActivity[] {
  const items: RawActivity[] = [];
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf('<section', index);
    if (start === -1) {
      break;
    }
    const end = sectionEnd(html, start);
    if (end === -1) {
      break;
    }
    const slice = html.slice(start, end);
    const nested = slice.indexOf('<section', '<section'.length) !== -1;
    const footer = /<footer\b/i.test(slice);
    const activity = sectionActivity(slice);
    if (activity && (!nested || footer)) {
      items.push(activity);
      index = end;
    } else {
      index = start + '<section'.length;
    }
  }
  return items;
}
