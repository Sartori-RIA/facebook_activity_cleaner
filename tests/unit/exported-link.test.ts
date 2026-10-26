import { describe, expect, it } from 'vitest';
import { ExportedLinkDeleter } from '../../src/browser/exported-link-browser.js';
import {
  deleteAtExportedLink,
  lookAtText,
  type ExportedItemPage,
} from '../../src/facebook/exported-link.js';
import {
  FACEBOOK_SELECTORS_VALIDATED,
  recordedControls,
  type ObservedControl,
  type ObservedDeletionControls,
} from '../../src/facebook/selectors/registry.js';
import { LIVE_FACEBOOK_AUTOMATION_ENABLED } from '../../src/safety/live-automation.js';
import type { ActivityType } from '../../src/types/activity.js';
import { createStores, storeOwnedPost } from '../helpers.js';

const controls: ObservedDeletionControls = {
  deleteMenu: { role: 'button', name: 'test-delete' },
  confirm: { role: 'button', name: 'test-confirm' },
  removed: 'test-removed',
  blocked: 'test-blocked',
};

function pageFor(visible: string[]): {
  page: ExportedItemPage;
  opened: string[];
  clicks: string[];
} {
  const opened: string[] = [];
  const clicks: string[] = [];
  let reads = 0;
  const page: ExportedItemPage = {
    async open(url) {
      opened.push(url);
    },
    async waitForLook(hints) {
      const text = visible[Math.min(reads, visible.length - 1)] ?? '';
      reads += 1;
      return lookAtText(text, hints);
    },
    async settle() {
      return undefined;
    },
    async openOverflowMenu(saved) {
      clicks.push(`Mais opções para ${saved}`);
      return true;
    },
    async clickNamed(control: ObservedControl) {
      clicks.push(control.name);
    },
    async close() {
      return undefined;
    },
  };
  return { page, opened, clicks };
}

function item(overrides: {
  activityType?: ActivityType;
  sourceUrl?: string | null;
  textPreview?: string | null;
}) {
  return {
    activityType: overrides.activityType ?? 'post',
    sourceUrl:
      overrides.sourceUrl === undefined
        ? 'https://www.facebook.com/fixture/posts/1'
        : overrides.sourceUrl,
    textPreview:
      overrides.textPreview === undefined ? 'Quarterly planning notes' : overrides.textPreview,
  };
}

describe('exported link deletion', () => {
  it('keeps the recorded Facebook controls empty', () => {
    expect(LIVE_FACEBOOK_AUTOMATION_ENABLED).toBe(false);
    expect(FACEBOOK_SELECTORS_VALIDATED).toBe(false);
    expect(recordedControls('post')?.deleteMenu).toEqual({
      role: 'menuitem',
      name: 'Mover para a Lixeira',
    });
    expect(recordedControls('post')?.confirm).toEqual({
      role: 'button',
      name: 'Mover para a Lixeira',
    });
    expect(recordedControls('comment')).toBeNull();
    expect(recordedControls('reaction')).toBeNull();
  });

  it('does not open an item that has no Facebook address', async () => {
    const { page, opened } = pageFor(['Quarterly planning notes']);
    const result = await deleteAtExportedLink(item({ sourceUrl: null }), page, controls);
    expect(result.outcome).toBe('not_this_item');
    expect(opened).toEqual([]);
  });

  it('marks a post deleted when the stored link already opens on an empty activity log', async () => {
    const { page, clicks } = pageFor(['Registro de atividades\nNada para mostrar']);
    const result = await deleteAtExportedLink(item({}), page, controls);
    expect(clicks).toEqual([]);
    expect(result).toEqual({
      outcome: 'deleted',
      detail:
        'The opened page already showed Registro de atividades and Nada para mostrar, so this post is already gone.',
    });
  });

  it('does not treat one of those lines as proof the post is gone', async () => {
    const { page, clicks } = pageFor(['Nada para mostrar']);
    const result = await deleteAtExportedLink(item({}), page, controls);
    expect(result.outcome).toBe('not_this_item');
    expect(clicks).toEqual([]);
  });

  it('opens only the stored address and does not click when the text differs', async () => {
    const { page, opened, clicks } = pageFor(['A different post entirely']);
    const result = await deleteAtExportedLink(item({}), page, controls);
    expect(result.outcome).toBe('not_this_item');
    expect(opened).toEqual(['https://www.facebook.com/fixture/posts/1']);
    expect(clicks).toEqual([]);
  });

  it('uses the text that appears after the page renders', async () => {
    const page: ExportedItemPage = {
      async open() {
        return undefined;
      },
      async waitForLook() {
        return { saved: true, gone: false, blocked: false };
      },
      async settle() {
        return undefined;
      },
      async openOverflowMenu() {
        return true;
      },
      async clickNamed() {
        return undefined;
      },
      async close() {
        return undefined;
      },
    };
    const result = await deleteAtExportedLink(item({}), page, controls);
    expect(result.outcome).toBe('deleted');
  });

  it('does not click when the saved text has more than one menu', async () => {
    const { page, clicks } = pageFor(['Quarterly planning notes']);
    const ambiguous: ExportedItemPage = {
      ...page,
      async openOverflowMenu() {
        return false;
      },
    };
    const result = await deleteAtExportedLink(item({}), ambiguous, controls);
    expect(result.outcome).toBe('not_this_item');
    expect(clicks).toEqual([]);
  });

  it('finishes when the item is moved to the trash', async () => {
    const { page, clicks } = pageFor(['Quarterly planning notes', 'still on screen']);
    const result = await deleteAtExportedLink(item({}), page, controls);
    expect(clicks).toEqual([
      'Mais opções para Quarterly planning notes',
      'test-delete',
      'test-confirm',
    ]);
    expect(result).toEqual({
      outcome: 'deleted',
      detail: 'Moved to the trash with test-confirm. The account owner empties the trash manually.',
    });
  });

  it('stops without clicking when the page shows the recorded block notice', async () => {
    const { page, clicks } = pageFor(['test-blocked Quarterly planning notes']);
    const result = await deleteAtExportedLink(item({}), page, controls);
    expect(result.outcome).toBe('blocked_by_facebook');
    expect(clicks).toEqual([]);
  });

  it('refuses a comment or a run with no recorded controls before opening', async () => {
    const comment = pageFor(['Quarterly planning notes']);
    await expect(
      deleteAtExportedLink(item({ activityType: 'comment' }), comment.page, controls),
    ).rejects.toThrow(/will not be opened/);
    expect(comment.opened).toEqual([]);
    const missing = pageFor(['Quarterly planning notes']);
    await expect(deleteAtExportedLink(item({}), missing.page, null)).rejects.toThrow(
      /will not be opened/,
    );
    expect(missing.opened).toEqual([]);
  });

  it('refuses the live deleter before opening a browser', async () => {
    const stores = createStores();
    const activity = storeOwnedPost(stores.activities);
    const deleter = new ExportedLinkDeleter('/tmp/fb-cleaner-not-used');
    await expect(deleter.deleteActivity(activity)).rejects.toThrow(
      /Refusing to delete|not validated/,
    );
    expect(stores.activities.requireById(activity.id).status).toBe('eligible');
    stores.close();
  });
});
