import { AppError } from '../domain/errors.js';
import type { DatePrecision } from '../types/activity.js';

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CIVIL_MONTH = /^(\d{4})-(\d{2})$/;
const CIVIL_YEAR = /^(\d{4})$/;

export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new AppError(`Unknown timezone: ${timeZone}`);
  }
}

export function isRealCivilDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function parseCivilDate(value: string): { year: number; month: number; day: number } {
  const match = CIVIL_DATE.exec(value);
  if (!match) {
    throw new AppError(`Dates must use YYYY-MM-DD. Received: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealCivilDate(year, month, day) || year < 1970 || year > 2100) {
    throw new AppError(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - instant.getTime();
}

export function zonedCivilTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  assertTimeZone(timeZone);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let instant = utcGuess;
  for (let pass = 0; pass < 3; pass += 1) {
    instant = utcGuess - timeZoneOffsetMs(new Date(instant), timeZone);
  }
  return instant;
}

export function startOfCivilDayMs(isoDate: string, timeZone: string): number {
  const { year, month, day } = parseCivilDate(isoDate);
  return zonedCivilTimeToUtcMs(year, month, day, 0, 0, 0, timeZone);
}

export function addCivilDays(isoDate: string, days: number): string {
  const { year, month, day } = parseCivilDate(isoDate);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function addCivilMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export interface ParsedOccurrence {
  occurredText: string | null;
  precision: DatePrecision;
}

const RELATIVE_DATE =
  /\b(yesterday|today|tomorrow|just now|last (week|month|year)|ontem|hoje|amanha|amanhã|agora|semana passada|mês passado|mes passado|ano passado)\b/iu;

const PORTUGUESE_MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function monthNumber(name: string): number | null {
  const folded = name
    .normalize('NFKC')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return PORTUGUESE_MONTHS[folded] ?? ENGLISH_MONTHS[folded] ?? null;
}

export function parseSuppliedDate(value: string | null | undefined): ParsedOccurrence {
  if (!value || !value.trim()) {
    return { occurredText: null, precision: 'unknown' };
  }
  const trimmed = value.trim();
  if (RELATIVE_DATE.test(trimmed)) {
    return { occurredText: null, precision: 'unknown' };
  }
  if (CIVIL_DATE.test(trimmed)) {
    try {
      parseCivilDate(trimmed);
    } catch {
      return { occurredText: null, precision: 'unknown' };
    }
    return { occurredText: trimmed, precision: 'day' };
  }
  if (CIVIL_MONTH.test(trimmed)) {
    const match = CIVIL_MONTH.exec(trimmed);
    const year = Number(match?.[1]);
    const month = Number(match?.[2]);
    if (!match || month < 1 || month > 12 || year < 1970 || year > 2100) {
      return { occurredText: null, precision: 'unknown' };
    }
    return { occurredText: trimmed, precision: 'month' };
  }
  if (CIVIL_YEAR.test(trimmed)) {
    const year = Number(trimmed);
    if (year < 1970 || year > 2100) {
      return { occurredText: null, precision: 'unknown' };
    }
    return { occurredText: trimmed, precision: 'year' };
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return { occurredText: null, precision: 'unknown' };
    }
    return { occurredText: parsed.toISOString(), precision: 'instant' };
  }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(trimmed)) {
    return { occurredText: null, precision: 'unknown' };
  }

  const dayMonthYear =
    /^(\d{1,2}) de ([A-Za-zÀ-ÿ]+) de (\d{4})$/u.exec(trimmed) ??
    /^([A-Za-z]+) (\d{1,2}), (\d{4})$/u.exec(trimmed);
  if (dayMonthYear) {
    const portuguese = trimmed.includes(' de ');
    const day = Number(portuguese ? dayMonthYear[1] : dayMonthYear[2]);
    const monthName = portuguese ? dayMonthYear[2] : dayMonthYear[1];
    const year = Number(portuguese ? dayMonthYear[3] : dayMonthYear[3]);
    const month = monthName ? monthNumber(monthName) : null;
    if (!month || !isRealCivilDate(year, month, day)) {
      return { occurredText: null, precision: 'unknown' };
    }
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { occurredText: iso, precision: 'day' };
  }

  const monthYear =
    /^([A-Za-zÀ-ÿ]+) de (\d{4})$/u.exec(trimmed) ?? /^([A-Za-z]+) (\d{4})$/u.exec(trimmed);
  if (monthYear) {
    const month = monthNumber(monthYear[1] ?? '');
    const year = Number(monthYear[2]);
    if (!month || year < 1970 || year > 2100) {
      return { occurredText: null, precision: 'unknown' };
    }
    return { occurredText: `${year}-${String(month).padStart(2, '0')}`, precision: 'month' };
  }

  return { occurredText: null, precision: 'unknown' };
}
