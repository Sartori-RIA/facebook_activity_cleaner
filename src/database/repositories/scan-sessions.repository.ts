import type BetterSqlite3 from 'better-sqlite3';
import { AppError } from '../../domain/errors.js';

export type ScanStatus = 'running' | 'completed' | 'interrupted' | 'failed';

export interface ScanSession {
  id: string;
  status: ScanStatus;
  activityType: string | null;
  filters: Record<string, unknown>;
  itemsSeen: number;
  itemsInserted: number;
  itemsDuplicate: number;
  itemsUnknownDate: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

interface ScanRow {
  id: string;
  status: ScanStatus;
  activity_type: string | null;
  filters_json: string;
  items_seen: number;
  items_inserted: number;
  items_duplicate: number;
  items_unknown_date: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

function mapSession(row: ScanRow): ScanSession {
  return {
    id: row.id,
    status: row.status,
    activityType: row.activity_type,
    filters: JSON.parse(row.filters_json) as Record<string, unknown>,
    itemsSeen: row.items_seen,
    itemsInserted: row.items_inserted,
    itemsDuplicate: row.items_duplicate,
    itemsUnknownDate: row.items_unknown_date,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
  };
}

export class ScanSessionRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(input: {
    id: string;
    activityType: string | null;
    filters: Record<string, unknown>;
    now: Date;
  }): ScanSession {
    this.db
      .prepare(
        `INSERT INTO scan_sessions (
          id, status, activity_type, filters_json, started_at
        ) VALUES (?, 'running', ?, ?, ?)`,
      )
      .run(input.id, input.activityType, JSON.stringify(input.filters), input.now.toISOString());
    return this.require(input.id);
  }

  require(id: string): ScanSession {
    const session = this.get(id);
    if (!session) {
      throw new AppError(`No scan session ${id}.`);
    }
    return session;
  }

  get(id: string): ScanSession | null {
    const row = this.db.prepare('SELECT * FROM scan_sessions WHERE id = ?').get(id) as
      ScanRow | undefined;
    return row ? mapSession(row) : null;
  }

  latestInterrupted(): ScanSession | null {
    const row = this.db
      .prepare(
        `SELECT * FROM scan_sessions WHERE status = 'interrupted' ORDER BY started_at DESC LIMIT 1`,
      )
      .get() as ScanRow | undefined;
    return row ? mapSession(row) : null;
  }

  latest(): ScanSession | null {
    const row = this.db
      .prepare('SELECT * FROM scan_sessions ORDER BY started_at DESC LIMIT 1')
      .get() as ScanRow | undefined;
    return row ? mapSession(row) : null;
  }

  addCounts(
    id: string,
    delta: { seen?: number; inserted?: number; duplicate?: number; unknownDate?: number },
    now: Date,
  ): void {
    this.db
      .prepare(
        `UPDATE scan_sessions SET
          items_seen = items_seen + ?,
          items_inserted = items_inserted + ?,
          items_duplicate = items_duplicate + ?,
          items_unknown_date = items_unknown_date + ?,
          finished_at = NULL
        WHERE id = ?`,
      )
      .run(delta.seen ?? 0, delta.inserted ?? 0, delta.duplicate ?? 0, delta.unknownDate ?? 0, id);
    void now;
  }

  finish(
    id: string,
    status: ScanStatus,
    now: Date,
    errorMessage: string | null = null,
  ): ScanSession {
    this.db
      .prepare(
        'UPDATE scan_sessions SET status = ?, finished_at = ?, error_message = ? WHERE id = ?',
      )
      .run(status, now.toISOString(), errorMessage, id);
    return this.require(id);
  }
}
