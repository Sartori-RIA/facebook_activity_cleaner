import { assertLiveAutomationAvailable } from '../safety/live-automation.js';
import { SessionManager } from './session-manager.js';

export class BrowserManager {
  constructor(private readonly sessions: SessionManager) {}

  async openForManualLogin(): Promise<void> {
    this.sessions.ensureProfileDir();
    assertLiveAutomationAvailable('open a browser for manual Facebook login');
  }
}
