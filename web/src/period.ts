import type { DateChoice } from './types';

export type PeriodMode = 'before-2017' | 'year-2015' | 'dates' | 'year' | 'all';

export interface PeriodInput {
  mode: PeriodMode;
  before: string;
  after: string;
  from: string;
  to: string;
  year: string;
}

export class PeriodError extends Error {
  readonly code: 'date_required' | 'date_empty';

  constructor(code: 'date_required' | 'date_empty') {
    super(code);
    this.code = code;
  }
}

function civilDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

export function periodChoice(input: PeriodInput): DateChoice {
  if (input.mode === 'before-2017') {
    return { before: '2017-01-01' };
  }
  if (input.mode === 'year-2015') {
    return { year: '2015' };
  }
  if (input.mode === 'all') {
    return { all: true };
  }
  if (input.mode === 'year') {
    if (!/^\d{4}$/.test(input.year)) {
      throw new PeriodError('date_required');
    }
    const year = Number(input.year);
    if (year < 1970 || year > 2100) {
      throw new PeriodError('date_required');
    }
    return { year: input.year };
  }
  const choice: DateChoice = {};
  const before = civilDate(input.before);
  const after = civilDate(input.after);
  const from = civilDate(input.from);
  const to = civilDate(input.to);
  if (before) {
    choice.before = before;
  }
  if (after) {
    choice.after = after;
  }
  if (from) {
    choice.from = from;
  }
  if (to) {
    choice.to = to;
  }
  if (!before && !after && !from && !to) {
    throw new PeriodError('date_required');
  }
  if (from && to && from > to) {
    throw new PeriodError('date_empty');
  }
  if (after && before && after >= before) {
    throw new PeriodError('date_empty');
  }
  return choice;
}
