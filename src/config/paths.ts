import { chmodSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AppPaths {
  root: string;
  configPath: string;
  databasePath: string;
  browserProfilePath: string;
  logPath: string;
}

export function resolveAppPaths(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
  overrides: { home?: string; config?: string; database?: string } = {},
): AppPaths {
  const root = overrides.home ?? env.FB_CLEANER_HOME ?? path.join(home, '.fb-cleaner');
  return {
    root,
    configPath: overrides.config ?? env.FB_CLEANER_CONFIG ?? path.join(root, 'config.yaml'),
    databasePath:
      overrides.database ?? env.FB_CLEANER_DATABASE ?? path.join(root, 'activity.sqlite'),
    browserProfilePath: path.join(root, 'browser-profile'),
    logPath: path.join(root, 'logs'),
  };
}

export function restrictDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    chmodSync(directory, 0o700);
  } catch {
    // Windows does not honor POSIX modes. The directory still lives outside the repository.
  }
}

export function ensureAppDirs(paths: AppPaths): void {
  restrictDirectory(paths.root);
  restrictDirectory(paths.browserProfilePath);
  restrictDirectory(paths.logPath);
}
