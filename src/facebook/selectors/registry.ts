import { FacebookUiNotValidatedError } from '../../domain/errors.js';
import type { ActivityType } from '../../types/activity.js';

/**
 * Selectors stay unvalidated until someone inspects the current Facebook Activity Log
 * and records an accessible role or name here. Do not invent CSS selectors.
 */
export const FACEBOOK_SELECTORS_VALIDATED = false;

/** Accessible-name prefix of the overflow button observed beside Ver. */
export const MORE_OPTIONS_NAME_PREFIX = 'Mais opções para';

/** Empty Activity Log observed when a stored link no longer has a post. */
export const ALREADY_GONE_HEADING = 'Registro de atividades';
export const ALREADY_GONE_BODY = 'Nada para mostrar';

export interface SelectorDefinition {
  id: string;
  purpose: string;
  validated: boolean;
  notes: string;
  observedRole: 'button' | 'link' | 'menuitem' | null;
  observedName: string | null;
}

function unobserved(id: string, purpose: string, notes: string): SelectorDefinition {
  return { id, purpose, validated: false, notes, observedRole: null, observedName: null };
}

export const selectorRegistry: readonly SelectorDefinition[] = [
  unobserved(
    'activity-log.root',
    'Container that lists the authenticated user activity.',
    'Record an accessible role or name after inspecting the live Activity Log.',
  ),
  unobserved(
    'activity-log.entry',
    'One activity entry.',
    'Needed before a scan can read type, date, text, and URL from Facebook.',
  ),
  {
    id: 'activity-log.more',
    purpose: 'Overflow button that opens the move-to-trash menu for one Activity Log row.',
    validated: true,
    observedRole: 'button',
    observedName: null,
    notes:
      'Observed on 24 Oct 2026 beside Ver, on more than one activity type. The account owner says this control is always present, regardless of item type. role=button, aria-haspopup=dialog, aria-expanded=false. The accessible name is "Mais opções para " plus that row\'s own sentence. The icon is aria-hidden. Ver is role=link with aria-label Ver. The button is on the list row, next to Ver. There is no stable id. Obfuscated class names must not be copied. The same menu does not make a photo, reel, or unknown row eligible.',
  },
  unobserved(
    'activity-log.timestamp',
    'The date shown for an entry.',
    'Unknown or relative dates must stay unconfirmed.',
  ),
  {
    id: 'post.delete-menu',
    purpose: 'The menu that deletes one of the authenticated user posts.',
    validated: true,
    observedRole: 'menuitem',
    observedName: 'Mover para a Lixeira',
    notes:
      'Observed 24 Oct 2026 in a menu with role=menu and aria-label "Opções para gerenciar essa atividade". The account owner says this menu is shown for every item type. This item is role=menuitem and its visible name is Mover para a Lixeira. Mover para Itens Arquivados is also role=menuitem and must not be clicked. The menu opens from activity-log.more, the button beside Ver. There is no stable id. Obfuscated class names must not be copied.',
  },
  {
    id: 'post.confirm',
    purpose: 'The confirmation control for deleting one post.',
    validated: true,
    observedRole: 'button',
    observedName: 'Mover para a Lixeira',
    notes:
      'Observed 24 Oct 2026 inside a dialog with role=dialog, aria-modal=true, and aria-label "Mover para a Lixeira?". The confirm control is role=button and aria-label "Mover para a Lixeira", without a question mark. Cancelar is role=button and aria-label Cancelar. Fechar is role=button and aria-label Fechar. The heading id is generated and must not be used. Obfuscated class names must not be copied. The account owner empties the trash by hand. The overflow menu item with the same visible words still has no recorded role.',
  },
  {
    id: 'post.removed',
    purpose: 'The visible notice that the post is gone.',
    validated: false,
    observedRole: null,
    observedName: 'Nada para mostrar',
    notes:
      'Observed 24 Oct 2026. After a row is moved to the trash, the program does not wait for this screen and does not click it. If the stored link already opens on the heading Registro de atividades and the body Nada para mostrar, and the saved text is absent, the post is already gone.',
  },
  unobserved(
    'comment.delete-menu',
    'The menu that deletes one of the authenticated user comments.',
    'Leave empty until a comment has been inspected. Posts come first.',
  ),
  unobserved(
    'comment.confirm',
    'The confirmation control for deleting one comment.',
    'Leave empty until a comment has been inspected.',
  ),
  unobserved(
    'comment.removed',
    'The visible notice that the comment is gone.',
    'Leave empty until a comment has been inspected.',
  ),
  unobserved(
    'reaction.delete-menu',
    'The control that removes one of the authenticated user reactions.',
    'Leave empty until a reaction has been inspected.',
  ),
  unobserved(
    'reaction.confirm',
    'The confirmation control for removing one reaction.',
    'Leave empty until a reaction has been inspected.',
  ),
  unobserved(
    'reaction.removed',
    'The visible notice that the reaction is gone.',
    'Leave empty until a reaction has been inspected.',
  ),
  unobserved(
    'security.challenge',
    'Checkpoint, captcha, or rate-limit dialog.',
    'When this text appears, automation must stop. Do not bypass it.',
  ),
];

export interface ObservedControl {
  role: 'button' | 'link' | 'menuitem';
  name: string;
}

export interface ObservedDeletionControls {
  deleteMenu: ObservedControl;
  confirm: ObservedControl;
  removed: string;
  blocked: string | null;
}

function selectorById(id: string): SelectorDefinition | undefined {
  return selectorRegistry.find((item) => item.id === id);
}

function namedControl(id: string): ObservedControl | null {
  const selector = selectorById(id);
  if (
    !selector?.validated ||
    !selector.observedName?.trim() ||
    (selector.observedRole !== 'button' &&
      selector.observedRole !== 'link' &&
      selector.observedRole !== 'menuitem')
  ) {
    return null;
  }
  return { role: selector.observedRole, name: selector.observedName.trim() };
}

function namedText(id: string): string | null {
  const selector = selectorById(id);
  if (!selector?.validated || !selector.observedName?.trim()) {
    return null;
  }
  return selector.observedName.trim();
}

export function recordedControls(activityType: ActivityType): ObservedDeletionControls | null {
  if (activityType !== 'post' && activityType !== 'comment' && activityType !== 'reaction') {
    return null;
  }
  const deleteMenu = namedControl(`${activityType}.delete-menu`);
  const confirm = namedControl(`${activityType}.confirm`);
  if (!deleteMenu || !confirm) {
    return null;
  }
  return {
    deleteMenu,
    confirm,
    removed: namedText(`${activityType}.removed`) ?? '',
    blocked: namedText('security.challenge'),
  };
}

export function assertSelectorsValidated(): void {
  if (!FACEBOOK_SELECTORS_VALIDATED || selectorRegistry.some((selector) => !selector.validated)) {
    throw new FacebookUiNotValidatedError(
      'Facebook selectors are not validated against the current interface. No Facebook page will be automated.',
    );
  }
}
