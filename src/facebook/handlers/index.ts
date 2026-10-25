import { CommentsHandler } from './comments.handler.js';
import { MediaHandler } from './media.handler.js';
import { OtherActivityHandler } from './other.handler.js';
import { PostsHandler } from './posts.handler.js';
import { ReactionsHandler } from './reactions.handler.js';
import type { ActivityHandler } from './types.js';

export const activityHandlers: readonly ActivityHandler[] = [
  new PostsHandler(),
  new CommentsHandler(),
  new ReactionsHandler(),
  new MediaHandler(),
  new OtherActivityHandler(),
];

export function handlerFor(activityType: ActivityHandler['type']): ActivityHandler {
  return (
    activityHandlers.find((handler) => handler.matches(activityType)) ?? new OtherActivityHandler()
  );
}
