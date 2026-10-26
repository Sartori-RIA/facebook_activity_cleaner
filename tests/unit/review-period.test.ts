import { describe, expect, it } from 'vitest';
import { fixedReviewYears } from '../../src/review/fixed-years';
import { matchesReviewPeriod, reviewMonths, reviewYears } from '../../web/src/review-period';
import { storedCount } from '../../web/src/stored-count';

describe('review year and month filters', () => {
  const dates = ['2012-04-02', '2012', '2014-11-01', null];

  it('lists the stored years and the months inside one year', () => {
    expect(reviewYears(dates)).toEqual([2012, 2014]);
    expect(reviewMonths(dates, 2012)).toEqual([4]);
    expect(reviewMonths(dates, 2014)).toEqual([11]);
  });

  it('offers a fixed year menu that does not depend on stored posts', () => {
    expect(fixedReviewYears(2026)[0]).toBe(2026);
    expect(fixedReviewYears(2026).at(-1)).toBe(2004);
    expect(fixedReviewYears(1999)).toEqual([2004]);
  });

  it('leaves a deleted row out of the stored total', () => {
    expect(storedCount({ eligible: 2, deleted: 5, requires_review: 1 })).toBe(3);
  });

  it('keeps a year-only item when the month is open and drops it for a specific month', () => {
    expect(matchesReviewPeriod('2012', 2012, 'all')).toBe(true);
    expect(matchesReviewPeriod('2012', 2012, 4)).toBe(false);
    expect(matchesReviewPeriod('2012-04-02', 2012, 4)).toBe(true);
    expect(matchesReviewPeriod('2014-11-01', 2012, 'all')).toBe(false);
    expect(matchesReviewPeriod(null, 'all', 'all')).toBe(true);
    expect(matchesReviewPeriod(null, 2012, 'all')).toBe(false);
  });
});
