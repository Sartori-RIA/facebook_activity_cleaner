import type { ActivityType } from '../../types/activity.js';
import type { ActivityHandler } from './types.js';

export class PostsHandler implements ActivityHandler {
  readonly type = 'post' as const;
  readonly liveUiValidated = false;

  matches(activityType: ActivityType): boolean {
    return activityType === 'post';
  }
}
