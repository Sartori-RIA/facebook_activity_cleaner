import type { ActivityType } from '../../types/activity.js';
import type { ActivityHandler } from './types.js';

export class MediaHandler implements ActivityHandler {
  readonly type = 'media' as const;
  readonly liveUiValidated = false;

  matches(activityType: ActivityType): boolean {
    return activityType === 'media';
  }
}
