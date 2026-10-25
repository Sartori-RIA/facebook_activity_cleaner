import { assertSelectorsValidated } from '../selectors/registry.js';

export class ActivityLogAdapter {
  async readNextPage(): Promise<never> {
    assertSelectorsValidated();
    throw new Error('Unreachable until selectors are validated.');
  }
}
