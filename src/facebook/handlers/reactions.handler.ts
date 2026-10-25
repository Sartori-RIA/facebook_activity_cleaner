import type { ActivityType } from '../../types/activity.js';
import type { ActivityHandler } from './types.js';

export class ReactionsHandler implements ActivityHandler {
  readonly type = 'reaction' as const;
  readonly liveUiValidated = false;

  matches(activityType: ActivityType): boolean {
    return activityType === 'reaction';
  }
}
