import { FacebookUiNotValidatedError } from '../domain/errors.js';

/**
 * Live Facebook automation stays off until a person has inspected the current
 * Activity Log UI and recorded the validated selectors. Tests must keep this false.
 */
export const LIVE_FACEBOOK_AUTOMATION_ENABLED = false;

export function assertLiveAutomationAvailable(action: string): void {
  if (!LIVE_FACEBOOK_AUTOMATION_ENABLED) {
    throw new FacebookUiNotValidatedError(
      `Refusing to ${action}. This build has no validated Facebook selectors, so it will not open Facebook or click through it.`,
    );
  }
}
