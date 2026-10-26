import type { DeletionObservation } from '../deletion/deletion-verifier.js';
import { FacebookUiNotValidatedError } from '../domain/errors.js';
import type { ActivityRecord } from '../types/activity.js';
import { publicFacebookUrl } from '../utils/facebook-url.js';
import { collapseWhitespace, foldText } from '../utils/text.js';
import {
  ALREADY_GONE_BODY,
  ALREADY_GONE_HEADING,
  type ObservedControl,
  type ObservedDeletionControls,
} from './selectors/registry.js';

const MIN_SAVED_TEXT = 12;

const PAGE_READY_TIMEOUT_MS = 12_000;

export interface PageHints {
  saved: string;
  blocked: string | null;
}

export interface PageLook {
  saved: boolean;
  gone: boolean;
  blocked: boolean;
}

export interface ExportedItemPage {
  open(url: string): Promise<void>;
  waitForLook(hints: PageHints, timeoutMs: number): Promise<PageLook>;
  settle(): Promise<void>;
  openOverflowMenu(saved: string): Promise<boolean>;
  clickNamed(control: ObservedControl): Promise<void>;
  close(): Promise<void>;
}

function includesText(visible: string, expected: string): boolean {
  const needle = foldText(collapseWhitespace(expected));
  if (!needle) {
    return false;
  }
  return foldText(collapseWhitespace(visible)).includes(needle);
}

function showsAlreadyGone(visible: string): boolean {
  return includesText(visible, ALREADY_GONE_HEADING) && includesText(visible, ALREADY_GONE_BODY);
}

function showsSavedText(visible: string, saved: string): boolean {
  const needle = foldText(collapseWhitespace(saved)).replace(/…$/, '').trim();
  if (needle.length < MIN_SAVED_TEXT) {
    return false;
  }
  return foldText(collapseWhitespace(visible)).includes(needle);
}

export function lookAtText(visible: string, hints: PageHints): PageLook {
  const saved = showsSavedText(visible, hints.saved);
  return {
    saved,
    gone: showsAlreadyGone(visible) && !saved,
    blocked: Boolean(hints.blocked && includesText(visible, hints.blocked)),
  };
}

/**
 * Opens the address stored on one exported row and deletes only that page.
 * A missing address or a page that does not show the saved text is review, and the browser is not asked to click.
 */
export async function deleteAtExportedLink(
  activity: Pick<ActivityRecord, 'activityType' | 'sourceUrl' | 'textPreview'>,
  page: ExportedItemPage,
  controls: ObservedDeletionControls | null,
): Promise<DeletionObservation> {
  if (activity.activityType !== 'post' || !controls) {
    throw new FacebookUiNotValidatedError(
      'Deletion controls for this activity type are not recorded, so its link will not be opened.',
    );
  }
  const url = publicFacebookUrl(activity.sourceUrl);
  const saved = collapseWhitespace(activity.textPreview ?? '');
  if (!url || saved.length < MIN_SAVED_TEXT) {
    return {
      outcome: 'not_this_item',
      detail: url
        ? 'The saved text is too short to confirm the opened page.'
        : 'This exported item has no Facebook address to open.',
    };
  }

  await page.open(url);
  try {
    const look = await page.waitForLook(
      { saved, blocked: controls.blocked },
      PAGE_READY_TIMEOUT_MS,
    );
    if (look.blocked) {
      return { outcome: 'blocked_by_facebook', detail: controls.blocked ?? 'blocked' };
    }
    if (look.gone && !look.saved) {
      return {
        outcome: 'deleted',
        detail:
          'The opened page already showed Registro de atividades and Nada para mostrar, so this post is already gone.',
      };
    }
    if (!look.saved) {
      return { outcome: 'not_this_item', detail: 'The opened page does not show the saved text.' };
    }
    const opened = await page.openOverflowMenu(saved);
    if (!opened) {
      return {
        outcome: 'not_this_item',
        detail: 'The page did not show one menu for this saved text.',
      };
    }
    await page.clickNamed(controls.deleteMenu);
    await page.clickNamed(controls.confirm);
    return {
      outcome: 'deleted',
      detail: `Moved to the trash with ${controls.confirm.name}. The account owner empties the trash manually.`,
    };
  } finally {
    await page.close();
  }
}
