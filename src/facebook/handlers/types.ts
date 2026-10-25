import type { ActivityType } from '../../types/activity.js';

export interface ActivityHandler {
  readonly type: ActivityType;
  readonly liveUiValidated: boolean;
  matches(activityType: ActivityType): boolean;
}
