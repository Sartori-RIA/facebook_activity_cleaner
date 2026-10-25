import type { ActivityType } from '../../types/activity.js';
import type { ActivityHandler } from './types.js';

/** Extension point for activity categories that do not have a dedicated handler yet. */
export class OtherActivityHandler implements ActivityHandler {
  readonly type = 'other' as const;
  readonly liveUiValidated = false;

  matches(activityType: ActivityType): boolean {
    return activityType === 'other' || activityType === 'unknown';
  }
}
