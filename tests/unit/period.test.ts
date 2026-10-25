import { describe, expect, it } from 'vitest';
import { PeriodError, periodChoice, type PeriodInput } from '../../web/src/period';

const empty: PeriodInput = {
  mode: 'dates',
  before: '',
  after: '',
  from: '',
  to: '',
  year: '',
};

describe('period filter', () => {
  it('keeps the shortcuts and accepts a chosen year or date range', () => {
    expect(periodChoice({ ...empty, mode: 'before-2017' })).toEqual({ before: '2017-01-01' });
    expect(periodChoice({ ...empty, mode: 'year', year: '2016' })).toEqual({ year: '2016' });
    expect(periodChoice({ ...empty, before: '2017-01-01', from: '2014-01-01' })).toEqual({
      before: '2017-01-01',
      from: '2014-01-01',
    });
  });

  it('refuses an empty date filter and a range with no days', () => {
    expect(() => periodChoice(empty)).toThrow(PeriodError);
    expect(() => periodChoice({ ...empty, from: '2016-02-01', to: '2016-01-01' })).toThrow(
      PeriodError,
    );
    expect(() => periodChoice({ ...empty, mode: 'year', year: '1800' })).toThrow(PeriodError);
  });
});
