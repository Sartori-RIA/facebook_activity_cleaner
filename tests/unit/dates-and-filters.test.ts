import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/domain/errors.js';
import {
  compareIntervalToWindow,
  compileDateFilter,
  intervalForOccurrence,
} from '../../src/scanner/filters.js';
import { parseSuppliedDate, startOfCivilDayMs } from '../../src/utils/dates.js';

describe('civil date boundaries', () => {
  it('converts midnight in the configured timezone to UTC', () => {
    expect(new Date(startOfCivilDayMs('2017-01-01', 'America/Sao_Paulo')).toISOString()).toBe(
      '2017-01-01T02:00:00.000Z',
    );
    expect(new Date(startOfCivilDayMs('2024-01-01', 'America/Sao_Paulo')).toISOString()).toBe(
      '2024-01-01T03:00:00.000Z',
    );
    expect(new Date(startOfCivilDayMs('2024-01-01', 'America/New_York')).toISOString()).toBe(
      '2024-01-01T05:00:00.000Z',
    );
    expect(new Date(startOfCivilDayMs('2024-07-01', 'America/New_York')).toISOString()).toBe(
      '2024-07-01T04:00:00.000Z',
    );
    expect(new Date(startOfCivilDayMs('2024-01-01', 'UTC')).toISOString()).toBe(
      '2024-01-01T00:00:00.000Z',
    );
  });

  it('treats --before as exclusive and --from/--to as inclusive', () => {
    const filter = compileDateFilter({ before: '2017-01-01' }, 'UTC');
    expect(compareIntervalToWindow(intervalForOccurrence('2016-12-31', 'day', 'UTC'), filter)).toBe(
      'inside',
    );
    expect(compareIntervalToWindow(intervalForOccurrence('2017-01-01', 'day', 'UTC'), filter)).toBe(
      'outside',
    );

    const inclusive = compileDateFilter({ from: '2017-01-01', to: '2017-01-01' }, 'UTC');
    expect(
      compareIntervalToWindow(intervalForOccurrence('2017-01-01', 'day', 'UTC'), inclusive),
    ).toBe('inside');
    expect(
      compareIntervalToWindow(intervalForOccurrence('2016-12-31', 'day', 'UTC'), inclusive),
    ).toBe('outside');
    expect(
      compareIntervalToWindow(intervalForOccurrence('2017-01-02', 'day', 'UTC'), inclusive),
    ).toBe('outside');
  });

  it('treats --after as exclusive of that civil day', () => {
    const filter = compileDateFilter({ after: '2017-01-01' }, 'UTC');
    expect(compareIntervalToWindow(intervalForOccurrence('2017-01-01', 'day', 'UTC'), filter)).toBe(
      'outside',
    );
    expect(compareIntervalToWindow(intervalForOccurrence('2017-01-02', 'day', 'UTC'), filter)).toBe(
      'inside',
    );
  });

  it('includes the whole year for --year', () => {
    const filter = compileDateFilter({ year: 2015 }, 'UTC');
    expect(compareIntervalToWindow(intervalForOccurrence('2015-01-01', 'day', 'UTC'), filter)).toBe(
      'inside',
    );
    expect(compareIntervalToWindow(intervalForOccurrence('2015-12-31', 'day', 'UTC'), filter)).toBe(
      'inside',
    );
    expect(compareIntervalToWindow(intervalForOccurrence('2014-12-31', 'day', 'UTC'), filter)).toBe(
      'outside',
    );
    expect(compareIntervalToWindow(intervalForOccurrence('2016-01-01', 'day', 'UTC'), filter)).toBe(
      'outside',
    );
  });

  it('keeps a coarse date only when the whole period sits inside the filter', () => {
    const before = compileDateFilter({ before: '2017-01-01' }, 'UTC');
    expect(compareIntervalToWindow(intervalForOccurrence('2016-12', 'month', 'UTC'), before)).toBe(
      'inside',
    );
    expect(compareIntervalToWindow(intervalForOccurrence('2017-01', 'month', 'UTC'), before)).toBe(
      'outside',
    );
    const partial = compileDateFilter({ from: '2016-06-10', to: '2016-06-20' }, 'UTC');
    expect(compareIntervalToWindow(intervalForOccurrence('2016-06', 'month', 'UTC'), partial)).toBe(
      'ambiguous',
    );
  });

  it('uses the Sao Paulo civil day for an absolute instant', () => {
    const filter = compileDateFilter({ before: '2017-01-01' }, 'America/Sao_Paulo');
    const beforeMidnight = intervalForOccurrence(
      '2017-01-01T01:30:00.000Z',
      'instant',
      'America/Sao_Paulo',
    );
    const atMidnight = intervalForOccurrence(
      '2017-01-01T02:00:00.000Z',
      'instant',
      'America/Sao_Paulo',
    );
    expect(compareIntervalToWindow(beforeMidnight, filter)).toBe('inside');
    expect(compareIntervalToWindow(atMidnight, filter)).toBe('outside');
  });

  it('refuses an empty intersection instead of widening it', () => {
    expect(() => compileDateFilter({ before: '2015-01-01', from: '2016-01-01' }, 'UTC')).toThrow(
      AppError,
    );
    expect(() => compileDateFilter({ all: true, before: '2017-01-01' }, 'UTC')).toThrow(
      /Do not combine --all/,
    );
  });

  it('requires an explicit date constraint when asked', () => {
    expect(() => compileDateFilter({}, 'UTC', { requireConstraint: true })).toThrow(
      /without a date filter/,
    );
  });

  it('does not guess ambiguous or relative dates', () => {
    expect(parseSuppliedDate('01/02/2015').precision).toBe('unknown');
    expect(parseSuppliedDate('yesterday').precision).toBe('unknown');
    expect(parseSuppliedDate('ontem').precision).toBe('unknown');
    expect(parseSuppliedDate('2015-02-31').precision).toBe('unknown');
    expect(parseSuppliedDate('15 de janeiro de 2015')).toEqual({
      occurredText: '2015-01-15',
      precision: 'day',
    });
    expect(parseSuppliedDate('janeiro de 2015')).toEqual({
      occurredText: '2015-01',
      precision: 'month',
    });
    expect(parseSuppliedDate('January 2015')).toEqual({
      occurredText: '2015-01',
      precision: 'month',
    });
  });
});
