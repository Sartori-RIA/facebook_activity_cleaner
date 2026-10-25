import type BetterSqlite3 from 'better-sqlite3';
import { migration001 } from './migrations/001_initial.js';

export interface Migration {
  id: string;
  sql: string;
}

export const migrations: readonly Migration[] = [migration001];

export function migrate(db: BetterSqlite3.Database, now: Date = new Date()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const existing = db.prepare('SELECT id FROM schema_migrations WHERE id = ?');
  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  for (const migration of migrations) {
    if (existing.get(migration.id)) {
      continue;
    }
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      insert.run(migration.id, now.toISOString());
    });
    apply();
  }
}
