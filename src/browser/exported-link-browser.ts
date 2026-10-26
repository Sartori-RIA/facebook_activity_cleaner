import { FacebookUiNotValidatedError } from '../domain/errors.js';
import {
  deleteAtExportedLink,
  type ExportedItemPage,
  type PageHints,
  type PageLook,
} from '../facebook/exported-link.js';
import {
  ALREADY_GONE_BODY,
  ALREADY_GONE_HEADING,
  MORE_OPTIONS_NAME_PREFIX,
  recordedControls,
  type ObservedControl,
} from '../facebook/selectors/registry.js';
import { assertLiveAutomationAvailable } from '../safety/live-automation.js';
import type { ActivityDeleter } from '../deletion/deletion-engine.js';
import type { DeletionObservation } from '../deletion/deletion-verifier.js';
import type { ActivityRecord } from '../types/activity.js';

const ACTION_TIMEOUT_MS = 8_000;

interface MenuSearchButton {
  getAttribute(name: string): string | null;
}

interface MenuSearchNode {
  parentElement: MenuSearchNode | null;
  querySelectorAll(selector: string): Iterable<MenuSearchButton>;
}

interface PlaywrightHandle {
  asElement(): {
    click(options: { timeout: number }): Promise<void>;
    dispose(): Promise<void>;
  } | null;
  dispose(): Promise<void>;
}

interface PlaywrightLocator {
  first(): PlaywrightLocator;
  isVisible(): Promise<boolean>;
  click(options: { timeout: number }): Promise<void>;
  waitFor(options: { state: 'visible'; timeout: number }): Promise<void>;
  evaluateHandle(
    pageFunction: (node: MenuSearchNode, prefix: string) => MenuSearchButton | null,
    prefix: string,
  ): Promise<PlaywrightHandle>;
}

interface PlaywrightPage {
  goto(url: string, options: { waitUntil: 'domcontentloaded' }): Promise<unknown>;
  getByText(text: string, options: { exact: false }): PlaywrightLocator;
  getByRole(
    role: ObservedControl['role'],
    options: { name: string | RegExp; exact?: boolean },
  ): PlaywrightLocator;
}

interface PlaywrightContext {
  pages(): PlaywrightPage[];
  newPage(): Promise<PlaywrightPage>;
  setDefaultTimeout(timeout: number): void;
  close(): Promise<void>;
}

/**
 * Opens one stored Facebook address in the local profile. Launch stays behind the validation gates.
 */
export class PlaywrightExportedPage implements ExportedItemPage {
  private context: PlaywrightContext | null = null;
  private page: PlaywrightPage | null = null;

  constructor(private readonly profilePath: string) {}

  async open(url: string): Promise<void> {
    if (!this.page) {
      const playwright = (await import('playwright')) as {
        chromium: {
          launchPersistentContext(
            profile: string,
            options: { headless: boolean },
          ): Promise<PlaywrightContext>;
        };
      };
      this.context = await playwright.chromium.launchPersistentContext(this.profilePath, {
        headless: false,
      });
      this.context.setDefaultTimeout(ACTION_TIMEOUT_MS);
      this.page = this.context.pages()[0] ?? (await this.context.newPage());
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  private requirePage(): PlaywrightPage {
    if (!this.page) {
      throw new FacebookUiNotValidatedError('No exported Facebook page is open.');
    }
    return this.page;
  }

  private async textVisible(sample: string): Promise<boolean> {
    const needle = sample.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (needle.length < 8) {
      return false;
    }
    return this.requirePage()
      .getByText(needle, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
  }

  async waitForLook(hints: PageHints, timeoutMs: number): Promise<PageLook> {
    const needle = hints.saved.replace(/\s+/g, ' ').trim().slice(0, 80);
    try {
      await this.requirePage()
        .getByText(needle, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs });
      return { saved: true, gone: false, blocked: false };
    } catch {
      const gone =
        (await this.textVisible(ALREADY_GONE_HEADING)) &&
        (await this.textVisible(ALREADY_GONE_BODY));
      const blocked = hints.blocked ? await this.textVisible(hints.blocked) : false;
      return { saved: false, gone, blocked };
    }
  }

  async settle(): Promise<void> {
    return undefined;
  }

  async openOverflowMenu(saved: string): Promise<boolean> {
    const needle = saved.replace(/\s+/g, ' ').trim().slice(0, 80);
    const handle = await this.requirePage()
      .getByText(needle, { exact: false })
      .first()
      .evaluateHandle((node, prefix) => {
        const wanted = `${prefix} `;
        let current: MenuSearchNode | null = node;
        for (let depth = 0; depth < 14 && current; depth += 1) {
          const matches = [...current.querySelectorAll('[role="button"]')].filter((button) =>
            (button.getAttribute('aria-label') ?? '').startsWith(wanted),
          );
          if (matches.length === 1) {
            return matches[0] ?? null;
          }
          if (matches.length > 1) {
            return null;
          }
          current = current.parentElement;
        }
        return null;
      }, MORE_OPTIONS_NAME_PREFIX);
    const element = handle.asElement();
    if (!element) {
      await handle.dispose();
      return false;
    }
    try {
      await element.click({ timeout: ACTION_TIMEOUT_MS });
      return true;
    } finally {
      await element.dispose();
    }
  }

  async clickNamed(control: ObservedControl): Promise<void> {
    await this.requirePage()
      .getByRole(control.role, { name: control.name, exact: true })
      .click({ timeout: ACTION_TIMEOUT_MS });
  }

  async close(): Promise<void> {
    // The same window stays open and navigates to the next stored address.
  }

  async shutdown(): Promise<void> {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}

export class ExportedLinkDeleter implements ActivityDeleter {
  readonly kind = 'live' as const;
  private readonly page: PlaywrightExportedPage;

  constructor(profilePath: string) {
    this.page = new PlaywrightExportedPage(profilePath);
  }

  async deleteActivity(activity: ActivityRecord): Promise<DeletionObservation> {
    if (process.env.VITEST === 'true') {
      assertLiveAutomationAvailable('delete an exported Facebook item');
    }
    const controls = recordedControls(activity.activityType);
    if (!controls) {
      throw new FacebookUiNotValidatedError(
        'Deletion controls for this activity type are not recorded, so its link will not be opened.',
      );
    }
    return deleteAtExportedLink(activity, this.page, controls);
  }

  async close(): Promise<void> {
    await this.page.shutdown();
  }
}
