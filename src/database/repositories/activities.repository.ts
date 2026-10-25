import { z } from 'zod';
import type BetterSqlite3 from 'better-sqlite3';
import { AppError } from '../../domain/errors.js';
import { assertTransition } from '../../deletion/state-machine.js';
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  DATE_PRECISIONS,
  OWNERSHIPS,
  type ActivityMetadata,
  type ActivityRecord,
  type ActivityStatus,
  type ActivityType,
  type DatePrecision,
  type Ownership,
} from '../../types/activity.js';

const metadataSchema = z.object({
  taggedNames: z.array(z.string()).default([]),
  taggedProfileUrls: z.array(z.string()).default([]),
  mentionedNames: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  albumName: z.string().nullable().default(null),
  albumUrl: z.string().nullable().default(null),
  sharedFromName: z.string().nullable().default(null),
  sharedFromProfileUrl: z.string().nullable().default(null),
  parentAuthorName: z.string().nullable().default(null),
  parentAuthorProfileUrl: z.string().nullable().default(null),
  parentAuthorProfileId: z.string().nullable().default(null),
  mediaClassification: z
    .enum(['protected', 'potential_family_memory', 'unclassified'])
    .nullable()
    .default(null),
  skipReason: z.string().nullable().default(null),
});

interface ActivityRow {
  id: string;
  fingerprint: string;
  activity_type: ActivityType;
  status: ActivityStatus;
  occurred_text: string | null;
  date_precision: DatePrecision;
  timezone: string;
  text_preview: string | null;
  source_url: string | null;
  author_name: string | null;
  author_profile_url: string | null;
  author_profile_id: string | null;
  ownership: Ownership;
  raw_label: string | null;
  scan_session_id: string | null;
  discovered_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_error: string | null;
  attempt_count: number;
  metadata_json: string;
}

export interface ActivityDraft {
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
  metadata: ActivityMetadata;
  lastError?: string | null;
}

function asEnum<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new AppError(`Invalid ${label} in the local database: ${value}`, 1);
}

function readMetadata(row: ActivityRow): ActivityMetadata {
  try {
    return metadataSchema.parse(JSON.parse(row.metadata_json));
  } catch {
    throw new AppError(`Activity ${row.id} has unreadable metadata. It was not changed.`, 1);
  }
}

function mapActivity(row: ActivityRow): ActivityRecord {
  const metadata = readMetadata(row);
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    activityType: asEnum(row.activity_type, ACTIVITY_TYPES, 'activity type'),
    status: asEnum(row.status, ACTIVITY_STATUSES, 'status'),
    occurredText: row.occurred_text,
    datePrecision: asEnum(row.date_precision, DATE_PRECISIONS, 'date precision'),
    timezone: row.timezone,
    textPreview: row.text_preview,
    sourceUrl: row.source_url,
    authorName: row.author_name,
    authorProfileUrl: row.author_profile_url,
    authorProfileId: row.author_profile_id,
    ownership: asEnum(row.ownership, OWNERSHIPS, 'ownership'),
    rawLabel: row.raw_label,
    scanSessionId: row.scan_session_id,
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    lastError: row.last_error,
    attemptCount: row.attempt_count,
    metadata,
  };
}

export class ActivityRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  inTransaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  upsertDiscovered(
    draft: ActivityDraft,
    now: Date,
    options: { preserveStatus: boolean },
  ): { inserted: boolean; record: ActivityRecord } {
    const existing = this.findByFingerprint(draft.fingerprint);
    const timestamp = now.toISOString();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO activities (
            id, fingerprint, activity_type, status, occurred_text, date_precision, timezone,
            text_preview, source_url, author_name, author_profile_url, author_profile_id,
            ownership, raw_label, scan_session_id, discovered_at, updated_at, last_error, metadata_json
          ) VALUES (
            @id, @fingerprint, @activity_type, @status, @occurred_text, @date_precision, @timezone,
            @text_preview, @source_url, @author_name, @author_profile_url, @author_profile_id,
            @ownership, @raw_label, @scan_session_id, @discovered_at, @updated_at, @last_error, @metadata_json
          )`,
        )
        .run({
          id: draft.id,
          fingerprint: draft.fingerprint,
          activity_type: draft.activityType,
          status: draft.status,
          occurred_text: draft.occurredText,
          date_precision: draft.datePrecision,
          timezone: draft.timezone,
          text_preview: draft.textPreview,
          source_url: draft.sourceUrl ?? null,
          author_name: draft.authorName ?? null,
          author_profile_url: draft.authorProfileUrl ?? null,
          author_profile_id: draft.authorProfileId ?? null,
          ownership: draft.ownership,
          raw_label: draft.rawLabel,
          scan_session_id: draft.scanSessionId,
          discovered_at: timestamp,
          updated_at: timestamp,
          last_error: draft.lastError ?? null,
          metadata_json: JSON.stringify(draft.metadata),
        });
      const created = this.getById(draft.id);
      if (!created) {
        throw new AppError(`Failed to read activity ${draft.id} after insert.`, 1);
      }
      return { inserted: true, record: created };
    }

    const status = options.preserveStatus ? existing.status : draft.status;
    if (!options.preserveStatus) {
      assertTransition(existing.status, status);
    }
    this.db
      .prepare(
        `UPDATE activities SET
          status = @status,
          occurred_text = @occurred_text,
          date_precision = @date_precision,
          timezone = @timezone,
          text_preview = @text_preview,
          source_url = @source_url,
          author_name = @author_name,
          author_profile_url = @author_profile_url,
          author_profile_id = @author_profile_id,
          ownership = @ownership,
          raw_label = @raw_label,
          updated_at = @updated_at,
          metadata_json = @metadata_json
        WHERE id = @id`,
      )
      .run({
        id: existing.id,
        status,
        occurred_text: draft.occurredText,
        date_precision: draft.datePrecision,
        timezone: draft.timezone,
        text_preview: draft.textPreview,
        source_url: draft.sourceUrl ?? null,
        author_name: draft.authorName ?? null,
        author_profile_url: draft.authorProfileUrl ?? null,
        author_profile_id: draft.authorProfileId ?? null,
        ownership: draft.ownership,
        raw_label: draft.rawLabel,
        updated_at: timestamp,
        metadata_json: JSON.stringify(draft.metadata),
      });
    const updated = this.getById(existing.id);
    if (!updated) {
      throw new AppError(`Failed to read activity ${existing.id} after update.`, 1);
    }
    return { inserted: false, record: updated };
  }

  getById(id: string): ActivityRecord | null {
    const row = this.db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as
      ActivityRow | undefined;
    return row ? mapActivity(row) : null;
  }

  requireById(id: string): ActivityRecord {
    const record = this.getById(id);
    if (!record) {
      throw new AppError(`No activity with id ${id}.`);
    }
    return record;
  }

  findByFingerprint(fingerprint: string): ActivityRecord | null {
    const row = this.db
      .prepare('SELECT * FROM activities WHERE fingerprint = ?')
      .get(fingerprint) as ActivityRow | undefined;
    return row ? mapActivity(row) : null;
  }

  list(): ActivityRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM activities ORDER BY occurred_text IS NULL, occurred_text, id')
      .all() as ActivityRow[];
    return rows.map(mapActivity);
  }

  listByStatuses(statuses: readonly ActivityStatus[]): ActivityRecord[] {
    if (statuses.length === 0) {
      return [];
    }
    const placeholders = statuses.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM activities WHERE status IN (${placeholders}) ORDER BY occurred_text IS NULL, occurred_text, id`,
      )
      .all(...statuses) as ActivityRow[];
    return rows.map(mapActivity);
  }

  countByStatus(): Record<ActivityStatus, number> {
    const counts = Object.fromEntries(ACTIVITY_STATUSES.map((status) => [status, 0])) as Record<
      ActivityStatus,
      number
    >;
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS count FROM activities GROUP BY status')
      .all() as Array<{
      status: ActivityStatus;
      count: number;
    }>;
    for (const row of rows) {
      counts[asEnum(row.status, ACTIVITY_STATUSES, 'status')] = row.count;
    }
    return counts;
  }

  transition(
    id: string,
    to: ActivityStatus,
    now: Date,
    patch: {
      lastError?: string | null;
      deletedAt?: string | null;
      incrementAttempt?: boolean;
      metadata?: ActivityMetadata;
    } = {},
  ): ActivityRecord {
    const current = this.requireById(id);
    assertTransition(current.status, to);
    const timestamp = now.toISOString();
    this.db
      .prepare(
        `UPDATE activities SET
          status = @status,
          updated_at = @updated_at,
          last_error = @last_error,
          deleted_at = @deleted_at,
          attempt_count = @attempt_count,
          metadata_json = @metadata_json
        WHERE id = @id`,
      )
      .run({
        id,
        status: to,
        updated_at: timestamp,
        last_error: patch.lastError === undefined ? current.lastError : patch.lastError,
        deleted_at: patch.deletedAt === undefined ? current.deletedAt : patch.deletedAt,
        attempt_count: current.attemptCount + (patch.incrementAttempt ? 1 : 0),
        metadata_json: JSON.stringify(patch.metadata ?? current.metadata),
      });
    return this.requireById(id);
  }
}
