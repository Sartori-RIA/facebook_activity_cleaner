export const ACTIVITY_TYPES = ['post', 'comment', 'reaction', 'media', 'other', 'unknown'] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = [
  'discovered',
  'eligible',
  'skipped',
  'pending',
  'deleting',
  'deleted',
  'failed',
  'requires_review',
] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const DATE_PRECISIONS = ['instant', 'day', 'month', 'year', 'unknown'] as const;

export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export const OWNERSHIPS = ['owned', 'not_owned', 'uncertain'] as const;

export type Ownership = (typeof OWNERSHIPS)[number];

export const MEDIA_CLASSIFICATIONS = [
  'protected',
  'potential_family_memory',
  'unclassified',
] as const;

export type MediaClassification = (typeof MEDIA_CLASSIFICATIONS)[number];

export const PERSON_ASSOCIATIONS = [
  'posts_authored_by',
  'posts_tagging',
  'posts_mentioning',
  'photos_with',
  'shared_posts_from',
  'comments_on_posts_by',
] as const;

export type PersonAssociation = (typeof PERSON_ASSOCIATIONS)[number];

export const CLI_ACTIVITY_TYPES = [
  'posts',
  'post',
  'comments',
  'comment',
  'reactions',
  'reaction',
  'media',
  'photos',
  'videos',
  'other',
  'all',
] as const;

export type CliActivityType = (typeof CLI_ACTIVITY_TYPES)[number];

export type ActivityTypeFilter = ActivityType | 'all';

export interface ActivityMetadata {
  taggedNames: string[];
  taggedProfileUrls: string[];
  mentionedNames: string[];
  hashtags: string[];
  albumName: string | null;
  albumUrl: string | null;
  sharedFromName: string | null;
  sharedFromProfileUrl: string | null;
  parentAuthorName: string | null;
  parentAuthorProfileUrl: string | null;
  parentAuthorProfileId: string | null;
  mediaClassification: MediaClassification | null;
  skipReason: string | null;
}

export interface ActivityRecord {
  id: string;
  fingerprint: string;
  activityType: ActivityType;
  status: ActivityStatus;
  occurredText: string | null;
  datePrecision: DatePrecision;
  timezone: string;
  textPreview: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  authorProfileUrl: string | null;
  authorProfileId: string | null;
  ownership: Ownership;
  rawLabel: string | null;
  scanSessionId: string | null;
  discoveredAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastError: string | null;
  attemptCount: number;
  metadata: ActivityMetadata;
}

export interface RawActivity {
  activityType?: ActivityType;
  label?: string;
  occurredText?: string | null;
  datePrecision?: DatePrecision;
  textPreview?: string;
  sourceUrl?: string;
  authorName?: string;
  authorProfileUrl?: string;
  authorProfileId?: string;
  ownership?: Ownership;
  taggedNames?: string[];
  taggedProfileUrls?: string[];
  mentionedNames?: string[];
  hashtags?: string[];
  albumName?: string;
  albumUrl?: string;
  sharedFromName?: string;
  sharedFromProfileUrl?: string;
  parentAuthorName?: string;
  parentAuthorProfileUrl?: string;
  parentAuthorProfileId?: string;
  mediaClassification?: MediaClassification;
}

export function emptyMetadata(): ActivityMetadata {
  return {
    taggedNames: [],
    taggedProfileUrls: [],
    mentionedNames: [],
    hashtags: [],
    albumName: null,
    albumUrl: null,
    sharedFromName: null,
    sharedFromProfileUrl: null,
    parentAuthorName: null,
    parentAuthorProfileUrl: null,
    parentAuthorProfileId: null,
    mediaClassification: null,
    skipReason: null,
  };
}
