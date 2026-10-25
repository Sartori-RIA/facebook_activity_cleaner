import type BetterSqlite3 from 'better-sqlite3';
import { AppError } from '../../domain/errors.js';

export type DeletionJobStatus =
  'pending' | 'running' | 'completed' | 'interrupted' | 'failed' | 'cancelled';
export type AttemptOutcome = 'deleted' | 'failed' | 'requires_review' | 'skipped' | 'dry_run';

export interface DeletionJob {
  id: string;
  status: DeletionJobStatus;
  dryRun: boolean;
  filters: Record<string, unknown>;
  limitCount: number | null;
  eligibleCount: number;
  deletedCount: number;
  failedCount: number;
  skippedCount: number;
  reviewCount: number;
  confirmationPhrase: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

interface JobRow {
  id: string;
  status: DeletionJobStatus;
  dry_run: number;
  filters_json: string;
  limit_count: number | null;
  eligible_count: number;
  deleted_count: number;
  failed_count: number;
  skipped_count: number;
  review_count: number;
  confirmation_phrase: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

function mapJob(row: JobRow): DeletionJob {
  return {
    id: row.id,
    status: row.status,
    dryRun: row.dry_run === 1,
    filters: JSON.parse(row.filters_json) as Record<string, unknown>,
    limitCount: row.limit_count,
    eligibleCount: row.eligible_count,
    deletedCount: row.deleted_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    reviewCount: row.review_count,
    confirmationPhrase: row.confirmation_phrase,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
  };
}

export class DeletionRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(input: {
    id: string;
    dryRun: boolean;
    filters: Record<string, unknown>;
    limitCount: number | null;
    eligibleCount: number;
    confirmationPhrase: string | null;
    now: Date;
  }): DeletionJob {
    const timestamp = input.now.toISOString();
    this.db
      .prepare(
        `INSERT INTO deletion_jobs (
          id, status, dry_run, filters_json, limit_count, eligible_count, confirmation_phrase, created_at, started_at
        ) VALUES (?, 'running', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.dryRun ? 1 : 0,
        JSON.stringify(input.filters),
        input.limitCount,
        input.eligibleCount,
        input.confirmationPhrase,
        timestamp,
        timestamp,
      );
    return this.require(input.id);
  }

  require(id: string): DeletionJob {
    const job = this.get(id);
    if (!job) {
      throw new AppError(`No deletion job ${id}.`);
    }
    return job;
  }

  get(id: string): DeletionJob | null {
    const row = this.db.prepare('SELECT * FROM deletion_jobs WHERE id = ?').get(id) as
      JobRow | undefined;
    return row ? mapJob(row) : null;
  }

  latest(): DeletionJob | null {
    const row = this.db
      .prepare('SELECT * FROM deletion_jobs ORDER BY created_at DESC LIMIT 1')
      .get() as JobRow | undefined;
    return row ? mapJob(row) : null;
  }

  addAttempt(input: {
    id: string;
    jobId: string;
    activityId: string;
    outcome: AttemptOutcome;
    verified: boolean;
    errorMessage: string | null;
    now: Date;
  }): void {
    const timestamp = input.now.toISOString();
    this.db
      .prepare(
        `INSERT INTO deletion_attempts (
          id, job_id, activity_id, started_at, finished_at, outcome, verified, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.jobId,
        input.activityId,
        timestamp,
        timestamp,
        input.outcome,
        input.verified ? 1 : 0,
        input.errorMessage,
      );
  }

  finish(
    id: string,
    patch: {
      status: DeletionJobStatus;
      deletedCount: number;
      failedCount: number;
      skippedCount: number;
      reviewCount: number;
      errorMessage: string | null;
      now: Date;
    },
  ): DeletionJob {
    this.db
      .prepare(
        `UPDATE deletion_jobs SET
          status = ?, finished_at = ?, deleted_count = ?, failed_count = ?, skipped_count = ?, review_count = ?, error_message = ?
        WHERE id = ?`,
      )
      .run(
        patch.status,
        patch.now.toISOString(),
        patch.deletedCount,
        patch.failedCount,
        patch.skippedCount,
        patch.reviewCount,
        patch.errorMessage,
        id,
      );
    return this.require(id);
  }
}
