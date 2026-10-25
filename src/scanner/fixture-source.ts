import { readFileSync } from 'node:fs';
import type {
  ActivityType,
  MediaClassification,
  Ownership,
  RawActivity,
} from '../types/activity.js';
import { ACTIVITY_TYPES, MEDIA_CLASSIFICATIONS, OWNERSHIPS } from '../types/activity.js';
import { parseFacebookExportHtml } from './facebook-export.js';

export interface ActivityPage {
  items: RawActivity[];
  endReached: boolean;
  pageIndex: number;
}

export interface ActivitySource {
  nextPage(): Promise<ActivityPage>;
  seek?(pageIndex: number): void;
}

function decode(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attributes(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  const pattern = /([:\w-]+)="([^"]*)"/g;
  for (const match of source.matchAll(pattern)) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined) {
      values[key] = decode(value);
    }
  }
  return values;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) {
    return undefined;
  }
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parseFixtureHtml(html: string): RawActivity[] {
  const items: RawActivity[] = [];
  const pattern = /<li\b([^>]*\bdata-fixture-activity\b[^>]*)>/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = attributes(match[1] ?? '');
    const activity: RawActivity = {};
    const activityType = oneOf(attrs['data-type'], ACTIVITY_TYPES);
    if (activityType) {
      activity.activityType = activityType as ActivityType;
    }
    if (attrs['data-label']) {
      activity.label = attrs['data-label'];
    }
    if (attrs['data-date']) {
      activity.occurredText = attrs['data-date'];
    }
    if (attrs['data-text']) {
      activity.textPreview = attrs['data-text'];
    }
    if (attrs['data-url']) {
      activity.sourceUrl = attrs['data-url'];
    }
    if (attrs['data-author-name']) {
      activity.authorName = attrs['data-author-name'];
    }
    if (attrs['data-author-url']) {
      activity.authorProfileUrl = attrs['data-author-url'];
    }
    if (attrs['data-author-id']) {
      activity.authorProfileId = attrs['data-author-id'];
    }
    const ownership = oneOf(attrs['data-ownership'], OWNERSHIPS);
    if (ownership) {
      activity.ownership = ownership as Ownership;
    }
    if (attrs['data-tags']) {
      activity.taggedNames = attrs['data-tags'].split('|').filter(Boolean);
    }
    if (attrs['data-mentions']) {
      activity.mentionedNames = attrs['data-mentions'].split('|').filter(Boolean);
    }
    if (attrs['data-hashtags']) {
      activity.hashtags = attrs['data-hashtags'].split('|').filter(Boolean);
    }
    if (attrs['data-album']) {
      activity.albumName = attrs['data-album'];
    }
    if (attrs['data-album-url']) {
      activity.albumUrl = attrs['data-album-url'];
    }
    if (attrs['data-shared-from']) {
      activity.sharedFromName = attrs['data-shared-from'];
    }
    if (attrs['data-parent-author-name']) {
      activity.parentAuthorName = attrs['data-parent-author-name'];
    }
    if (attrs['data-parent-author-url']) {
      activity.parentAuthorProfileUrl = attrs['data-parent-author-url'];
    }
    const media = oneOf(attrs['data-media-classification'], MEDIA_CLASSIFICATIONS);
    if (media) {
      activity.mediaClassification = media as MediaClassification;
    }
    items.push(activity);
  }
  return items;
}

export class FixtureActivitySource implements ActivitySource {
  private page: number;

  constructor(
    private readonly items: readonly RawActivity[],
    private readonly pageSize: number,
    startPage = 0,
  ) {
    this.page = startPage;
  }

  seek(pageIndex: number): void {
    this.page = pageIndex;
  }

  async nextPage(): Promise<ActivityPage> {
    const start = this.page * this.pageSize;
    const items = this.items.slice(start, start + this.pageSize);
    const pageIndex = this.page;
    this.page += 1;
    return {
      items: [...items],
      endReached: start + this.pageSize >= this.items.length,
      pageIndex,
    };
  }
}

export function loadActivitySource(filePath: string, pageSize = 4): FixtureActivitySource {
  const html = readFileSync(filePath, 'utf8');
  const fixture = parseFixtureHtml(html);
  const items = fixture.length > 0 ? fixture : parseFacebookExportHtml(html);
  return new FixtureActivitySource(items, pageSize);
}

export function loadFixtureSource(filePath: string, pageSize = 4): FixtureActivitySource {
  return loadActivitySource(filePath, pageSize);
}
