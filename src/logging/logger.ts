import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';
import { sanitizeLogMessage, sanitizeUnknown } from './redact.js';

export interface AppLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): AppLogger;
}

function wrap(logger: PinoLogger): AppLogger {
  const write = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, unknown>,
  ): void => {
    const safeMessage = sanitizeLogMessage(message);
    if (fields) {
      logger[level](sanitizeUnknown(fields) as Record<string, unknown>, safeMessage);
      return;
    }
    logger[level](safeMessage);
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    child(fields: Record<string, unknown>): AppLogger {
      return wrap(logger.child(sanitizeUnknown(fields) as Record<string, unknown>));
    },
  };
}

export function createLogger(level = 'warn'): AppLogger {
  return wrap(
    pino({
      level,
      redact: {
        paths: [
          'password',
          'cookie',
          'cookies',
          'token',
          'authorization',
          'session',
          '*.password',
          '*.cookie',
          '*.token',
          '*.authorization',
        ],
        censor: '[Redacted]',
      },
    }),
  );
}

export function silentLogger(): AppLogger {
  return createLogger('silent');
}
