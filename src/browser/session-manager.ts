import { restrictDirectory } from '../config/paths.js';

/**
 * Owns the on-disk Playwright profile directory.
 * It has no method that accepts a password, cookie, or token.
 */
export class SessionManager {
  constructor(private readonly profilePath: string) {}

  ensureProfileDir(): string {
    restrictDirectory(this.profilePath);
    return this.profilePath;
  }
}
