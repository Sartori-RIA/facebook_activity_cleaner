import { chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { restrictDirectory } from '../config/paths.js';
import { migrate } from './migrate.js';

export type SqliteDatabase = BetterSqlite3.Database;

export function openDatabase(databasePath: string): SqliteDatabase {
  if (databasePath !== ':memory:') {
    restrictDirectory(dirname(databasePath));
  }
  const db = new BetterSqlite3(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') {
    db.pragma('journal_mode = WAL');
    try {
      chmodSync(databasePath, 0o600);
    } catch {
      // POSIX modes are not available on every platform.
    }
  }
  migrate(db);
  return db;
}
