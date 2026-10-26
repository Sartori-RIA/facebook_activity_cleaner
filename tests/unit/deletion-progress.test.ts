import { describe, expect, it } from 'vitest';
import { formatDeletionProgress, formatDuration } from '../../src/cli/deletion-progress.js';

describe('deletion progress text', () => {
  it('formats durations and a progress line', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(8_000)).toBe('0:08');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_661_000)).toBe('1:01:01');
    expect(
      formatDeletionProgress({
        index: 2,
        total: 10,
        phase: 'opening',
        elapsedMs: 12_000,
        remainingMs: 48_000,
      }),
    ).toBe('2/10 opening. Elapsed 0:12.');
    expect(
      formatDeletionProgress({
        index: 2,
        total: 10,
        phase: 'done',
        outcome: 'requires_review',
        elapsedMs: 20_000,
        remainingMs: 80_000,
      }),
    ).toBe('2/10 needs review. Elapsed 0:20. About 1:20 left.');
    expect(
      formatDeletionProgress({
        index: 10,
        total: 10,
        phase: 'done',
        outcome: 'deleted',
        elapsedMs: 100_000,
        remainingMs: 0,
      }),
    ).toBe('10/10 deleted. Elapsed 1:40.');
  });
});
