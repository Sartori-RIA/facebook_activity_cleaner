import { AppError } from '../domain/errors.js';
import type { ActivityTypeFilter } from '../types/activity.js';
import { dateFilterFromParts, type DateFilterInput } from '../scanner/filters.js';

export const MAX_DELETE_LIMIT = 200;

export interface DateFlagOptions {
  before?: string;
  after?: string;
  from?: string;
  to?: string;
  year?: string;
  all?: boolean;
}

export function readDateFilter(options: DateFlagOptions): DateFilterInput {
  return dateFilterFromParts({
    ...(options.before ? { before: options.before } : {}),
    ...(options.after ? { after: options.after } : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
    ...(options.year ? { year: options.year } : {}),
    ...(options.all ? { all: true } : {}),
  });
}

export function hasDateFlags(options: DateFlagOptions): boolean {
  return Boolean(
    options.before || options.after || options.from || options.to || options.year || options.all,
  );
}

export function parseActivityType(value: string): ActivityTypeFilter {
  switch (value) {
    case 'post':
    case 'posts':
      return 'post';
    case 'comment':
    case 'comments':
      return 'comment';
    case 'reaction':
    case 'reactions':
      return 'reaction';
    case 'media':
    case 'photos':
    case 'videos':
      return 'media';
    case 'other':
      return 'other';
    case 'all':
      return 'all';
    default:
      throw new AppError(
        `Unknown activity type "${value}". Use posts, comments, reactions, media, other, or all.`,
      );
  }
}

export function parseLimit(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DELETE_LIMIT) {
    throw new AppError(`--limit must be an integer from 1 to ${MAX_DELETE_LIMIT}.`);
  }
  return limit;
}
