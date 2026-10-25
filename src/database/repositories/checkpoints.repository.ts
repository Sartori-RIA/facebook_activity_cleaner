import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';

export interface ScanCursor {
  nextPageIndex: number;
  lastFingerprint: string | null;
  fixturePath: string | null;
}

export class CheckpointRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  saveScan(scopeId: string, cursor: ScanCursor, now: Date): void {
    const timestamp = now.toISOString();
    this.db
      .prepare(
        `INSERT INTO checkpoints (id, scope, scope_id, cursor_json, created_at, updated_at)
         VALUES (?, 'scan', ?, ?, ?, ?)
         ON CONFLICT(scope, scope_id) DO UPDATE SET cursor_json = excluded.cursor_json, updated_at = excluded.updated_at`,
      )
      .run(randomUUID(), scopeId, JSON.stringify(cursor), timestamp, timestamp);
  }

  getScan(scopeId: string): ScanCursor | null {
    const row = this.db
      .prepare(`SELECT cursor_json FROM checkpoints WHERE scope = 'scan' AND scope_id = ?`)
      .get(scopeId) as { cursor_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.cursor_json) as ScanCursor;
  }
}
