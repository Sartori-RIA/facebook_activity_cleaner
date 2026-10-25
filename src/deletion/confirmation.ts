import { createHash } from 'node:crypto';
import { AppError, ConfirmationRequiredError } from '../domain/errors.js';

export function confirmationPhrase(ids: readonly string[]): string {
  const digest = createHash('sha256')
    .update([...ids].sort().join('\n'))
    .digest('hex')
    .slice(0, 8);
  return `DELETE ${ids.length} ACTIVITIES ${digest}`;
}

export function authorizeDeletion(input: {
  execute: boolean;
  phrase: string | null;
  ids: readonly string[];
}): { dryRun: true } | { dryRun: false; ids: string[] } {
  if (!input.execute) {
    return { dryRun: true };
  }
  if (input.ids.length === 0) {
    throw new AppError('Nothing is eligible for deletion.');
  }
  const expected = confirmationPhrase(input.ids);
  if (input.phrase !== expected) {
    throw new ConfirmationRequiredError(expected);
  }
  return { dryRun: false, ids: [...input.ids] };
}
