import { AppError } from '../domain/errors.js';
import type { DatePrecision } from '../types/activity.js';
import { addCivilDays, addCivilMonths, parseCivilDate, startOfCivilDayMs } from '../utils/dates.js';

export interface DateFilterInput {
  before?: string;
  after?: string;
  from?: string;
  to?: string;
  year?: number;
  all?: boolean;
}

export interface CompiledDateFilter {
  timeZone: string;
  startInclusiveMs: number | null;
  endExclusiveMs: number | null;
  description: string;
}

export type DateVerdict = 'inside' | 'outside' | 'ambiguous' | 'unknown';

export interface TimeInterval {
  startInclusiveMs: number;
  endExclusiveMs: number;
}

function tightenStart(current: number | null, value: number): number {
  return current === null ? value : Math.max(current, value);
}

function tightenEnd(current: number | null, value: number): number {
  return current === null ? value : Math.min(current, value);
}

export function describeDateFilter(input: DateFilterInput, timeZone: string): string {
  if (input.all) {
    return `all confidently dated activities in ${timeZone}`;
  }
  const parts: string[] = [];
  if (input.before) {
    parts.push(`before ${input.before} (exclusive)`);
  }
  if (input.after) {
    parts.push(`after ${input.after} (exclusive)`);
  }
  if (input.from) {
    parts.push(`from ${input.from} (inclusive)`);
  }
  if (input.to) {
    parts.push(`to ${input.to} (inclusive)`);
  }
  if (input.year) {
    parts.push(`year ${input.year} (inclusive)`);
  }
  if (parts.length === 0) {
    return `no date filter in ${timeZone}`;
  }
  return `${parts.join(', ')} in ${timeZone}`;
}

export function compileDateFilter(
  input: DateFilterInput,
  timeZone: string,
  options: { requireConstraint?: boolean } = {},
): CompiledDateFilter {
  const hasConstraint = Boolean(
    input.before || input.after || input.from || input.to || input.year || input.all,
  );
  if (options.requireConstraint && !hasConstraint) {
    throw new AppError(
      'Refusing to run without a date filter. Pass --before, --after, --from, --to, --year, or --all.',
    );
  }
  if (input.all && (input.before || input.after || input.from || input.to || input.year)) {
    throw new AppError('Do not combine --all with other date filters.');
  }
  if (input.year !== undefined && (input.year < 1970 || input.year > 2100)) {
    throw new AppError(`Invalid year: ${input.year}`);
  }
  if (input.all || !hasConstraint) {
    return {
      timeZone,
      startInclusiveMs: null,
      endExclusiveMs: null,
      description: describeDateFilter(input.all ? { all: true } : {}, timeZone),
    };
  }

  let start: number | null = null;
  let end: number | null = null;
  if (input.from) {
    start = tightenStart(start, startOfCivilDayMs(input.from, timeZone));
  }
  if (input.after) {
    start = tightenStart(start, startOfCivilDayMs(addCivilDays(input.after, 1), timeZone));
  }
  if (input.to) {
    end = tightenEnd(end, startOfCivilDayMs(addCivilDays(input.to, 1), timeZone));
  }
  if (input.before) {
    end = tightenEnd(end, startOfCivilDayMs(input.before, timeZone));
  }
  if (input.year) {
    start = tightenStart(start, startOfCivilDayMs(`${input.year}-01-01`, timeZone));
    end = tightenEnd(end, startOfCivilDayMs(`${input.year + 1}-01-01`, timeZone));
  }
  if (start !== null && end !== null && start >= end) {
    throw new AppError(
      'These date flags do not overlap. The command stopped instead of widening the range.',
    );
  }
  return {
    timeZone,
    startInclusiveMs: start,
    endExclusiveMs: end,
    description: describeDateFilter(input, timeZone),
  };
}

export function intervalForOccurrence(
  occurredText: string | null,
  precision: DatePrecision,
  timeZone: string,
): TimeInterval | null {
  if (!occurredText || precision === 'unknown') {
    return null;
  }
  if (precision === 'instant') {
    const parsed = new Date(occurredText);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return { startInclusiveMs: parsed.getTime(), endExclusiveMs: parsed.getTime() + 1 };
  }
  if (precision === 'day') {
    const start = startOfCivilDayMs(occurredText, timeZone);
    return {
      startInclusiveMs: start,
      endExclusiveMs: startOfCivilDayMs(addCivilDays(occurredText, 1), timeZone),
    };
  }
  if (precision === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(occurredText);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const next = addCivilMonths(year, month, 1);
    const startIso = `${year}-${String(month).padStart(2, '0')}-01`;
    const endIso = `${next.year}-${String(next.month).padStart(2, '0')}-01`;
    return {
      startInclusiveMs: startOfCivilDayMs(startIso, timeZone),
      endExclusiveMs: startOfCivilDayMs(endIso, timeZone),
    };
  }
  if (precision === 'year') {
    const year = Number(occurredText);
    if (!Number.isInteger(year)) {
      return null;
    }
    return {
      startInclusiveMs: startOfCivilDayMs(`${year}-01-01`, timeZone),
      endExclusiveMs: startOfCivilDayMs(`${year + 1}-01-01`, timeZone),
    };
  }
  return null;
}

export function compareIntervalToWindow(
  interval: TimeInterval | null,
  filter: CompiledDateFilter,
): DateVerdict {
  if (!interval) {
    return 'unknown';
  }
  const windowStart = filter.startInclusiveMs ?? Number.NEGATIVE_INFINITY;
  const windowEnd = filter.endExclusiveMs ?? Number.POSITIVE_INFINITY;
  if (interval.startInclusiveMs >= windowStart && interval.endExclusiveMs <= windowEnd) {
    return 'inside';
  }
  if (interval.endExclusiveMs <= windowStart || interval.startInclusiveMs >= windowEnd) {
    return 'outside';
  }
  return 'ambiguous';
}

export function dateFilterFromParts(parts: {
  before?: string;
  after?: string;
  from?: string;
  to?: string;
  year?: string;
  all?: boolean;
}): DateFilterInput {
  if (parts.year !== undefined && !/^\d{4}$/.test(parts.year)) {
    throw new AppError(`--year must be YYYY. Received: ${parts.year}`);
  }
  const input: DateFilterInput = {};
  if (parts.before) {
    parseCivilDate(parts.before);
    input.before = parts.before;
  }
  if (parts.after) {
    parseCivilDate(parts.after);
    input.after = parts.after;
  }
  if (parts.from) {
    parseCivilDate(parts.from);
    input.from = parts.from;
  }
  if (parts.to) {
    parseCivilDate(parts.to);
    input.to = parts.to;
  }
  if (parts.year) {
    input.year = Number(parts.year);
  }
  if (parts.all) {
    input.all = true;
  }
  return input;
}
