import { assertLiveAutomationAvailable } from '../safety/live-automation.js';
import { SessionManager } from './session-manager.js';

export class BrowserManager {
  constructor(private readonly sessions: SessionManager) {}

  async openForManualLogin(): Promise<void> {
    const profile = this.sessions.ensureProfileDir();
    if (process.env.VITEST === 'true') {
      assertLiveAutomationAvailable('open a browser for manual Facebook login');
    }
    const playwright = (await import('playwright')) as {
      chromium: {
        launchPersistentContext(
          profilePath: string,
          options: { headless: boolean },
        ): Promise<{
          pages(): { goto(url: string): Promise<unknown> }[];
          newPage(): Promise<{ goto(url: string): Promise<unknown> }>;
          once(event: 'close', listener: () => void): void;
        }>;
      };
    };
    const context = await playwright.chromium.launchPersistentContext(profile, { headless: false });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://www.facebook.com/');
    await new Promise<void>((resolve) => {
      context.once('close', () => resolve());
    });
  }
}
