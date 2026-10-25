import type BetterSqlite3 from 'better-sqlite3';

export class SettingsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  get<T>(key: string): T | null {
    const row = this.db
      .prepare('SELECT value_json FROM application_settings WHERE key = ?')
      .get(key) as { value_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.value_json) as T;
  }

  set(key: string, value: unknown, now: Date): void {
    this.db
      .prepare(
        `INSERT INTO application_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), now.toISOString());
  }
}
