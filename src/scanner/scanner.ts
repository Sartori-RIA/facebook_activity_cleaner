import { randomUUID } from 'node:crypto';
import type { ActivityRepository } from '../database/repositories/activities.repository.js';
import type {
  CheckpointRepository,
  ScanCursor,
} from '../database/repositories/checkpoints.repository.js';
import type { ProtectionRepository } from '../database/repositories/protection.repository.js';
import type { ScanSessionRepository } from '../database/repositories/scan-sessions.repository.js';
import type { AppLogger } from '../logging/logger.js';
import { evaluateProtection, type ProtectionPolicy } from '../protection/engine.js';
import { factsFromActivity } from '../protection/facts.js';
import { statusForDecision } from '../deletion/state-machine.js';
import {
  emptyMetadata,
  type ActivityMetadata,
  type ActivityType,
  type ActivityTypeFilter,
  type RawActivity,
} from '../types/activity.js';
import { parseSuppliedDate } from '../utils/dates.js';
import { previewText } from '../utils/text.js';
import { classifyActivityLabel } from './classify.js';
import { fingerprintActivity } from './fingerprint.js';
import type { ActivitySource } from './fixture-source.js';
import type { CompiledDateFilter, DateFilterInput } from './filters.js';
import {
  initialScrollState,
  nextScrollState,
  pageSignature,
  type ScrollLimits,
} from './pagination.js';

export interface ScanDependencies {
  activities: ActivityRepository;
  sessions: ScanSessionRepository;
  checkpoints: CheckpointRepository;
  protection: ProtectionRepository;
  logger: AppLogger;
  now?: () => Date;
}

export interface ScanRequest {
  source: ActivitySource;
  sessionId?: string;
  filter: CompiledDateFilter;
  dateFilter: DateFilterInput;
  type: ActivityTypeFilter;
  policy: ProtectionPolicy;
  limits: ScrollLimits;
  fixturePath: string | null;
  signal?: AbortSignal;
  resumeCursor?: ScanCursor | null;
}

export interface ScanSummary {
  sessionId: string;
  status: 'completed' | 'interrupted' | 'failed';
  seen: number;
  inserted: number;
  duplicate: number;
  unknownDate: number;
  stopReason: string | null;
}

function typeIncluded(filter: ActivityTypeFilter, activityType: ActivityType): boolean {
  return filter === 'all' || filter === activityType;
}

function metadataFrom(raw: RawActivity): ActivityMetadata {
  return {
    ...emptyMetadata(),
    taggedNames: raw.taggedNames ?? [],
    taggedProfileUrls: raw.taggedProfileUrls ?? [],
    mentionedNames: raw.mentionedNames ?? [],
    hashtags: raw.hashtags ?? [],
    albumName: raw.albumName ?? null,
    albumUrl: raw.albumUrl ?? null,
    sharedFromName: raw.sharedFromName ?? null,
    sharedFromProfileUrl: raw.sharedFromProfileUrl ?? null,
    parentAuthorName: raw.parentAuthorName ?? null,
    parentAuthorProfileUrl: raw.parentAuthorProfileUrl ?? null,
    parentAuthorProfileId: raw.parentAuthorProfileId ?? null,
    mediaClassification:
      raw.mediaClassification ?? (raw.activityType === 'media' ? 'unclassified' : null),
  };
}

export async function runScan(deps: ScanDependencies, request: ScanRequest): Promise<ScanSummary> {
  const now = deps.now ?? (() => new Date());
  const session =
    (request.sessionId ? deps.sessions.get(request.sessionId) : null) ??
    deps.sessions.create({
      id: request.sessionId ?? randomUUID(),
      activityType: request.type,
      filters: {
        ...request.dateFilter,
        type: request.type,
        timezone: request.filter.timeZone,
        fixturePath: request.fixturePath,
      },
      now: now(),
    });
  if (request.resumeCursor) {
    request.source.seek?.(request.resumeCursor.nextPageIndex);
  }
  let scroll = initialScrollState();
  let stopReason: string | null = null;
  let status: ScanSummary['status'] = 'completed';
  try {
    while (!request.signal?.aborted) {
      const page = await request.source.nextPage();
      let inserted = 0;
      const fingerprints: string[] = [];
      for (const raw of page.items) {
        if (request.signal?.aborted) {
          break;
        }
        const occurred = raw.datePrecision
          ? { occurredText: raw.occurredText ?? null, precision: raw.datePrecision }
          : parseSuppliedDate(raw.occurredText);
        const activityType = raw.activityType ?? classifyActivityLabel(raw.label);
        const metadata = metadataFrom({ ...raw, activityType });
        const fingerprint = fingerprintActivity({
          activityType,
          sourceUrl: raw.sourceUrl ?? null,
          occurredText: occurred.occurredText,
          datePrecision: occurred.precision,
          textPreview: raw.textPreview ?? null,
          authorProfileId: raw.authorProfileId ?? null,
          authorProfileUrl: raw.authorProfileUrl ?? null,
          authorName: raw.authorName ?? null,
        });
        fingerprints.push(fingerprint);
        const existing = deps.activities.findByFingerprint(fingerprint);
        const explicit = existing ? deps.protection.isExplicitlyProtected(existing.id) : false;
        const review = existing ? deps.protection.latestReview(existing.id) : null;
        const draftId = existing?.id ?? fingerprint;
        const ownership = raw.ownership ?? 'uncertain';
        const baseRecord = {
          id: draftId,
          fingerprint,
          activityType,
          status: 'discovered' as const,
          occurredText: occurred.occurredText,
          datePrecision: occurred.precision,
          timezone: request.filter.timeZone,
          textPreview: raw.textPreview ? previewText(raw.textPreview) : null,
          sourceUrl: raw.sourceUrl ?? null,
          authorName: raw.authorName ?? null,
          authorProfileUrl: raw.authorProfileUrl ?? null,
          authorProfileId: raw.authorProfileId ?? null,
          ownership,
          rawLabel: raw.label ?? null,
          scanSessionId: session.id,
          metadata,
        };
        const provisional = existing ?? {
          ...baseRecord,
          discoveredAt: now().toISOString(),
          updatedAt: now().toISOString(),
          deletedAt: null,
          lastError: null,
          attemptCount: 0,
        };
        const facts = factsFromActivity(provisional, request.filter, {
          explicitlyProtected: explicit,
          manualDecision: review?.decision ?? null,
        });
        let decision = evaluateProtection(facts, request.policy);
        if (!typeIncluded(request.type, activityType) && decision.outcome === 'eligible') {
          decision = {
            outcome: 'out_of_scope',
            reasons: [
              {
                code: 'type_not_requested',
                action: 'review',
                ruleId: null,
                detail: `Scan type is ${request.type}.`,
              },
            ],
          };
        }
        const locked =
          existing?.status === 'deleted' ||
          existing?.status === 'deleting' ||
          review !== null ||
          explicit;
        const saved = deps.activities.upsertDiscovered(
          {
            ...baseRecord,
            status: locked && existing ? existing.status : statusForDecision(decision),
            metadata: {
              ...metadata,
              skipReason: decision.outcome === 'eligible' ? null : decision.outcome,
            },
          },
          now(),
          { preserveStatus: locked },
        );
        deps.protection.replaceMatches(
          saved.record.id,
          decision.reasons.map((entry) => ({
            id: randomUUID(),
            ruleId: entry.ruleId,
            action: entry.action,
            reasonCode: entry.code,
            detail: entry.detail,
          })),
          now(),
        );
        deps.sessions.addCounts(
          session.id,
          {
            seen: 1,
            inserted: saved.inserted ? 1 : 0,
            duplicate: saved.inserted ? 0 : 1,
            unknownDate: saved.inserted && occurred.precision === 'unknown' ? 1 : 0,
          },
          now(),
        );
        if (saved.inserted) {
          inserted += 1;
        }
        deps.logger.info('Activity stored', {
          id: saved.record.id,
          type: activityType,
          inserted: saved.inserted,
        });
      }
      const decision = nextScrollState(
        scroll,
        { signature: pageSignature(fingerprints), inserted, endReached: page.endReached },
        request.limits,
      );
      scroll = decision.state;
      const aborted = Boolean(request.signal?.aborted);
      const cursor: ScanCursor = {
        nextPageIndex: aborted ? page.pageIndex : page.pageIndex + 1,
        lastFingerprint: fingerprints.at(-1) ?? null,
        fixturePath: request.fixturePath,
      };
      deps.checkpoints.saveScan(session.id, cursor, now());
      if (request.signal?.aborted) {
        status = 'interrupted';
        stopReason = 'aborted';
        break;
      }
      if (decision.stop) {
        stopReason = decision.reason;
        break;
      }
    }
    if (request.signal?.aborted) {
      status = 'interrupted';
      stopReason = 'aborted';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'scan failed';
    deps.sessions.finish(session.id, 'failed', now(), message);
    throw error;
  }
  const finished = deps.sessions.finish(session.id, status, now(), stopReason);
  return {
    sessionId: finished.id,
    status,
    seen: finished.itemsSeen,
    inserted: finished.itemsInserted,
    duplicate: finished.itemsDuplicate,
    unknownDate: finished.itemsUnknownDate,
    stopReason,
  };
}
