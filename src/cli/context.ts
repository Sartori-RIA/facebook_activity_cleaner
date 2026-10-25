import type { AppConfig } from '../config/schema.js';
import { loadConfig } from '../config/load.js';
import { ensureAppDirs, resolveAppPaths, type AppPaths } from '../config/paths.js';
import { openDatabase, type SqliteDatabase } from '../database/connection.js';
import { ActivityRepository } from '../database/repositories/activities.repository.js';
import { CheckpointRepository } from '../database/repositories/checkpoints.repository.js';
import { DeletionRepository } from '../database/repositories/deletion.repository.js';
import { ProtectionRepository } from '../database/repositories/protection.repository.js';
import { ScanSessionRepository } from '../database/repositories/scan-sessions.repository.js';
import { SettingsRepository } from '../database/repositories/settings.repository.js';
import { createLogger, type AppLogger } from '../logging/logger.js';

export interface CliGlobals {
  config?: string;
  database?: string;
  home?: string;
  timezone?: string;
  logLevel?: string;
  verbose?: boolean;
  respectProtection?: boolean;
}

export interface AppContext {
  config: AppConfig;
  paths: AppPaths;
  db: SqliteDatabase;
  logger: AppLogger;
  activities: ActivityRepository;
  sessions: ScanSessionRepository;
  jobs: DeletionRepository;
  checkpoints: CheckpointRepository;
  protection: ProtectionRepository;
  settings: SettingsRepository;
  close(): void;
}

export function openContext(options: CliGlobals, env: NodeJS.ProcessEnv = process.env): AppContext {
  const paths = resolveAppPaths(env, undefined, {
    ...(options.home ? { home: options.home } : {}),
    ...(options.config ? { config: options.config } : {}),
    ...(options.database ? { database: options.database } : {}),
  });
  ensureAppDirs(paths);
  const loaded = loadConfig(paths.configPath, options.timezone);
  const level = options.verbose ? 'info' : (options.logLevel ?? loaded.logging.level);
  const config: AppConfig = {
    ...loaded,
    logging: { level: level as AppConfig['logging']['level'] },
  };
  const db = openDatabase(paths.databasePath);
  return {
    config,
    paths,
    db,
    logger: createLogger(config.logging.level),
    activities: new ActivityRepository(db),
    sessions: new ScanSessionRepository(db),
    jobs: new DeletionRepository(db),
    checkpoints: new CheckpointRepository(db),
    protection: new ProtectionRepository(db),
    settings: new SettingsRepository(db),
    close(): void {
      db.close();
    },
  };
}
