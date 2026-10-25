import type { ActivityRecord } from '../types/activity.js';
import {
  compareIntervalToWindow,
  intervalForOccurrence,
  type CompiledDateFilter,
} from '../scanner/filters.js';
import type { ActivityFacts } from './engine.js';

export function factsFromActivity(
  activity: ActivityRecord,
  filter: CompiledDateFilter,
  extras: {
    explicitlyProtected: boolean;
    manualDecision: ActivityFacts['manualDecision'];
  },
): ActivityFacts {
  const interval = intervalForOccurrence(
    activity.occurredText,
    activity.datePrecision,
    filter.timeZone,
  );
  return {
    id: activity.id,
    activityType: activity.activityType,
    ownership: activity.ownership,
    dateVerdict: compareIntervalToWindow(interval, filter),
    datePrecision: activity.datePrecision,
    occurredText: activity.occurredText,
    timeZone: filter.timeZone,
    interval,
    text: activity.textPreview ?? '',
    hashtags: activity.metadata.hashtags,
    sourceUrl: activity.sourceUrl,
    authorName: activity.authorName,
    authorProfileUrl: activity.authorProfileUrl,
    authorProfileId: activity.authorProfileId,
    taggedNames: activity.metadata.taggedNames,
    taggedProfileUrls: activity.metadata.taggedProfileUrls,
    mentionedNames: activity.metadata.mentionedNames,
    albumName: activity.metadata.albumName,
    albumUrl: activity.metadata.albumUrl,
    sharedFromName: activity.metadata.sharedFromName,
    sharedFromProfileUrl: activity.metadata.sharedFromProfileUrl,
    parentAuthorName: activity.metadata.parentAuthorName,
    parentAuthorProfileUrl: activity.metadata.parentAuthorProfileUrl,
    parentAuthorProfileId: activity.metadata.parentAuthorProfileId,
    mediaClassification: activity.metadata.mediaClassification,
    explicitlyProtected: extras.explicitlyProtected,
    manualDecision: extras.manualDecision,
  };
}
