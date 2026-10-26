/** Facebook opened in 2004. The review menu uses this range instead of years found in stored posts. */
export const FIXED_REVIEW_YEAR_MIN = 2004;
export const FIXED_REVIEW_YEAR_MAX = 2100;

export function fixedReviewYears(currentYear: number): number[] {
  const end = Math.min(Math.max(currentYear, FIXED_REVIEW_YEAR_MIN), FIXED_REVIEW_YEAR_MAX);
  const years: number[] = [];
  for (let year = end; year >= FIXED_REVIEW_YEAR_MIN; year -= 1) {
    years.push(year);
  }
  return years;
}

export function isFixedReviewYear(year: number): boolean {
  return Number.isInteger(year) && year >= FIXED_REVIEW_YEAR_MIN && year <= FIXED_REVIEW_YEAR_MAX;
}
