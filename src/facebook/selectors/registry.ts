import { FacebookUiNotValidatedError } from '../../domain/errors.js';

/**
 * Selectors stay unvalidated until someone inspects the current Facebook Activity Log
 * and records an accessible role or name here. Do not invent CSS selectors.
 */
export const FACEBOOK_SELECTORS_VALIDATED = false;

export interface SelectorDefinition {
  id: string;
  purpose: string;
  validated: boolean;
  notes: string;
}

export const selectorRegistry: readonly SelectorDefinition[] = [
  {
    id: 'activity-log.root',
    purpose: 'Container that lists the authenticated user activity.',
    validated: false,
    notes: 'Record an accessible role or name after inspecting the live Activity Log.',
  },
  {
    id: 'activity-log.entry',
    purpose: 'One activity entry.',
    validated: false,
    notes: 'Needed before a scan can read type, date, text, and URL from Facebook.',
  },
  {
    id: 'activity-log.timestamp',
    purpose: 'The date shown for an entry.',
    validated: false,
    notes: 'Unknown or relative dates must stay unconfirmed.',
  },
  {
    id: 'activity.delete',
    purpose: 'The control that deletes the authenticated user activity.',
    validated: false,
    notes: 'Required before any live deletion. Confirmation UI must also be identified.',
  },
  {
    id: 'security.challenge',
    purpose: 'Checkpoint, captcha, or rate-limit dialog.',
    validated: false,
    notes: 'When this appears, automation must stop. Do not bypass it.',
  },
];

export function assertSelectorsValidated(): void {
  if (!FACEBOOK_SELECTORS_VALIDATED || selectorRegistry.some((selector) => !selector.validated)) {
    throw new FacebookUiNotValidatedError(
      'Facebook selectors are not validated against the current interface. No Facebook page will be automated.',
    );
  }
}
