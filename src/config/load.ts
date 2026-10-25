import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ZodError } from 'zod';
import { AppError } from '../domain/errors.js';
import { assertTimeZone } from '../utils/dates.js';
import { appConfigSchema, type AppConfig } from './schema.js';

export function loadConfig(configPath: string, timezoneOverride?: string): AppConfig {
  let raw: unknown = {};
  if (existsSync(configPath)) {
    const source = readFileSync(configPath, 'utf8');
    raw = parse(source) ?? {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(`Config file must be a YAML object: ${configPath}`);
  }
  try {
    const config = appConfigSchema.parse(raw);
    const timezone = timezoneOverride ?? config.timezone;
    assertTimeZone(timezone);
    if (config.delays.min_ms > config.delays.max_ms) {
      throw new AppError('delays.min_ms cannot be greater than delays.max_ms.');
    }
    return timezone === config.timezone ? config : { ...config, timezone };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof ZodError) {
      throw new AppError(
        `Invalid config: ${error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    throw error;
  }
}
