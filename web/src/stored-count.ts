/** Rows marked deleted stay in the database, but the home total no longer includes them. */
export function storedCount(counts: Record<string, number>): number {
  let total = 0;
  for (const [status, value] of Object.entries(counts)) {
    if (status !== 'deleted') {
      total += value;
    }
  }
  return total;
}
