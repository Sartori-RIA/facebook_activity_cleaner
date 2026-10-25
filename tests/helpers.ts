import { openDatabase } from '../src/database/connection.js';
import {
  ActivityRepository,
  type ActivityDraft,
} from '../src/database/repositories/activities.repository.js';
import { CheckpointRepository } from '../src/database/repositories/checkpoints.repository.js';
import { DeletionRepository } from '../src/database/repositories/deletion.repository.js';
import { ProtectionRepository } from '../src/database/repositories/protection.repository.js';
import { ScanSessionRepository } from '../src/database/repositories/scan-sessions.repository.js';
import { SettingsRepository } from '../src/database/repositories/settings.repository.js';
import { silentLogger } from '../src/logging/logger.js';
import {
  emptyFamilyPolicy,
  type ActivityFacts,
  type ProtectionPolicy,
} from '../src/protection/engine.js';
import { intervalForOccurrence } from '../src/scanner/filters.js';
import { fingerprintActivity } from '../src/scanner/fingerprint.js';
import { DEFAULT_FAMILY_KEYWORDS } from '../src/config/schema.js';
import {
  emptyMetadata,
  type ActivityType,
  type DatePrecision,
  type Ownership,
} from '../src/types/activity.js';

export function createStores() {
  const db = openDatabase(':memory:');
  return {
    db,
    activities: new ActivityRepository(db),
    sessions: new ScanSessionRepository(db),
    jobs: new DeletionRepository(db),
    checkpoints: new CheckpointRepository(db),
    protection: new ProtectionRepository(db),
    settings: new SettingsRepository(db),
    logger: silentLogger(),
    close(): void {
      db.close();
    },
  };
}

export function baseFacts(overrides: Partial<ActivityFacts> = {}): ActivityFacts {
  const timeZone = overrides.timeZone ?? 'UTC';
  const occurredText = overrides.occurredText === undefined ? '2015-06-01' : overrides.occurredText;
  const datePrecision = overrides.datePrecision ?? 'day';
  return {
    id: 'activity-1',
    activityType: 'post',
    ownership: 'owned',
    dateVerdict: 'inside',
    datePrecision,
    occurredText,
    timeZone,
    interval: intervalForOccurrence(occurredText, datePrecision, timeZone),
    text: 'Quarterly planning notes',
    hashtags: [],
    sourceUrl: null,
    authorName: 'Alex',
    authorProfileUrl: null,
    authorProfileId: null,
    taggedNames: [],
    taggedProfileUrls: [],
    mentionedNames: [],
    albumName: null,
    albumUrl: null,
    sharedFromName: null,
    sharedFromProfileUrl: null,
    parentAuthorName: null,
    parentAuthorProfileUrl: null,
    parentAuthorProfileId: null,
    mediaClassification: null,
    explicitlyProtected: false,
    manualDecision: null,
    ...overrides,
  };
}

export function basePolicy(overrides: Partial<ProtectionPolicy> = {}): ProtectionPolicy {
  return {
    people: [],
    rules: [],
    familyMemories: emptyFamilyPolicy({ keywords: [...DEFAULT_FAMILY_KEYWORDS] }),
    ...overrides,
  };
}

export function storeOwnedPost(
  activities: ActivityRepository,
  overrides: Partial<ActivityDraft> & { textPreview?: string | null } = {},
): ReturnType<ActivityRepository['upsertDiscovered']>['record'] {
  const activityType: ActivityType = overrides.activityType ?? 'post';
  const occurredText = overrides.occurredText === undefined ? '2015-06-01' : overrides.occurredText;
  const datePrecision: DatePrecision = overrides.datePrecision ?? 'day';
  const ownership: Ownership = overrides.ownership ?? 'owned';
  const textPreview =
    overrides.textPreview === undefined ? 'Quarterly planning notes' : overrides.textPreview;
  const sourceUrl =
    overrides.sourceUrl === undefined
      ? `https://www.facebook.com/fixture/posts/${encodeURIComponent(textPreview ?? 'item')}`
      : overrides.sourceUrl;
  const fingerprint = fingerprintActivity({
    activityType,
    sourceUrl,
    occurredText,
    datePrecision,
    textPreview,
    authorName: overrides.authorName ?? 'Alex',
    authorProfileId: overrides.authorProfileId ?? null,
    authorProfileUrl: overrides.authorProfileUrl ?? null,
  });
  const draft: ActivityDraft = {
    id: overrides.id ?? fingerprint,
    fingerprint,
    activityType,
    status: overrides.status ?? 'eligible',
    occurredText,
    datePrecision,
    timezone: overrides.timezone ?? 'UTC',
    textPreview,
    sourceUrl,
    authorName: overrides.authorName ?? 'Alex',
    authorProfileUrl: overrides.authorProfileUrl ?? null,
    authorProfileId: overrides.authorProfileId ?? null,
    ownership,
    rawLabel: overrides.rawLabel ?? null,
    scanSessionId: null,
    metadata: overrides.metadata ?? emptyMetadata(),
  };
  return activities.upsertDiscovered(draft, new Date('2026-01-01T00:00:00.000Z'), {
    preserveStatus: false,
  }).record;
}
