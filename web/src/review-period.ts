export interface YearMonth {
  year: number;
  month: number | null;
}

const DATED = /^(\d{4})(?:-(\d{2}))?/;

export function activityYearMonth(date: string | null): YearMonth | null {
  if (!date) {
    return null;
  }
  const match = DATED.exec(date);
  if (!match?.[1]) {
    return null;
  }
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  if (!Number.isInteger(year) || (month !== null && (month < 1 || month > 12))) {
    return null;
  }
  return { year, month };
}

export function matchesReviewPeriod(
  date: string | null,
  year: number | 'all',
  month: number | 'all',
): boolean {
  if (year === 'all') {
    return true;
  }
  const parts = activityYearMonth(date);
  if (!parts || parts.year !== year) {
    return false;
  }
  if (month === 'all') {
    return true;
  }
  return parts.month === month;
}

export function reviewYears(dates: Array<string | null>): number[] {
  const years = new Set<number>();
  for (const date of dates) {
    const parts = activityYearMonth(date);
    if (parts) {
      years.add(parts.year);
    }
  }
  return [...years].sort((left, right) => left - right);
}

export function reviewMonths(dates: Array<string | null>, year: number): number[] {
  const months = new Set<number>();
  for (const date of dates) {
    const parts = activityYearMonth(date);
    if (parts?.year === year && parts.month) {
      months.add(parts.month);
    }
  }
  return [...months].sort((left, right) => left - right);
}
