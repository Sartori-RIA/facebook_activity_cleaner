import type { ActivityType } from '../../types/activity.js';
import type { ActivityHandler } from './types.js';

export class CommentsHandler implements ActivityHandler {
  readonly type = 'comment' as const;
  readonly liveUiValidated = false;

  matches(activityType: ActivityType): boolean {
    return activityType === 'comment';
  }
}
