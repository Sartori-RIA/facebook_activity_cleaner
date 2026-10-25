export const migration001 = {
  id: '001_initial',
  sql: `
CREATE TABLE scan_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'interrupted', 'failed')),
  activity_type TEXT,
  filters_json TEXT NOT NULL,
  items_seen INTEGER NOT NULL DEFAULT 0,
  items_inserted INTEGER NOT NULL DEFAULT 0,
  items_duplicate INTEGER NOT NULL DEFAULT 0,
  items_unknown_date INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_message TEXT
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('post', 'comment', 'reaction', 'media', 'other', 'unknown')),
  status TEXT NOT NULL CHECK (status IN ('discovered', 'eligible', 'skipped', 'pending', 'deleting', 'deleted', 'failed', 'requires_review')),
  occurred_text TEXT,
  date_precision TEXT NOT NULL CHECK (date_precision IN ('instant', 'day', 'month', 'year', 'unknown')),
  timezone TEXT NOT NULL,
  text_preview TEXT,
  source_url TEXT,
  author_name TEXT,
  author_profile_url TEXT,
  author_profile_id TEXT,
  ownership TEXT NOT NULL CHECK (ownership IN ('owned', 'not_owned', 'uncertain')),
  raw_label TEXT,
  scan_session_id TEXT REFERENCES scan_sessions(id),
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_activities_status ON activities(status);
CREATE INDEX idx_activities_type_date ON activities(activity_type, occurred_text);
CREATE INDEX idx_activities_source_url ON activities(source_url);
CREATE INDEX idx_activities_ownership ON activities(ownership);

CREATE TABLE deletion_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'interrupted', 'failed', 'cancelled')),
  dry_run INTEGER NOT NULL CHECK (dry_run IN (0, 1)),
  filters_json TEXT NOT NULL,
  limit_count INTEGER,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  confirmation_phrase TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error_message TEXT
);

CREATE TABLE deletion_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES deletion_jobs(id),
  activity_id TEXT NOT NULL REFERENCES activities(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('deleted', 'failed', 'requires_review', 'skipped', 'dry_run')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  error_message TEXT
);

CREATE INDEX idx_deletion_attempts_activity ON deletion_attempts(activity_id);
CREATE INDEX idx_deletion_attempts_job ON deletion_attempts(job_id);

CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('scan', 'deletion')),
  scope_id TEXT NOT NULL,
  cursor_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (scope, scope_id)
);

CREATE TABLE application_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE protected_people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relationship TEXT,
  profile_url TEXT,
  profile_id TEXT,
  protect_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_protected_people_profile_id
  ON protected_people(profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX idx_protected_people_profile_url
  ON protected_people(profile_url) WHERE profile_url IS NOT NULL;

CREATE TABLE protection_rules (
  id TEXT PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('protect', 'review')),
  value_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE protected_activities (
  activity_id TEXT PRIMARY KEY REFERENCES activities(id),
  reason TEXT NOT NULL,
  rule_id TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE activity_protection_matches (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  rule_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('protect', 'review')),
  reason_code TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_protection_matches_activity ON activity_protection_matches(activity_id);

CREATE TABLE manual_reviews (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  decision TEXT NOT NULL CHECK (decision IN ('protect', 'approve_deletion', 'skip')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_manual_reviews_activity ON manual_reviews(activity_id, created_at);
`,
};
