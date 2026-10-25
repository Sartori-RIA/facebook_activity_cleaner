import type BetterSqlite3 from 'better-sqlite3';
import { AppError } from '../../domain/errors.js';
import type { PersonAssociation } from '../../types/activity.js';
import { PERSON_ASSOCIATIONS } from '../../types/activity.js';

export interface ProtectedPersonRecord {
  id: string;
  name: string;
  relationship: string | null;
  profileUrl: string | null;
  profileId: string | null;
  protect: PersonAssociation[];
  createdAt: string;
  updatedAt: string;
}

export interface ProtectionRuleRecord {
  id: string;
  ruleKey: string;
  ruleType: string;
  action: 'protect' | 'review';
  value: unknown;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManualReviewRecord {
  id: string;
  activityId: string;
  decision: 'protect' | 'approve_deletion' | 'skip';
  note: string | null;
  createdAt: string;
}

export interface ProtectionMatchRecord {
  id: string;
  activityId: string;
  ruleId: string | null;
  action: 'protect' | 'review';
  reasonCode: string;
  detail: string;
  createdAt: string;
}

interface PersonRow {
  id: string;
  name: string;
  relationship: string | null;
  profile_url: string | null;
  profile_id: string | null;
  protect_json: string;
  created_at: string;
  updated_at: string;
}

interface RuleRow {
  id: string;
  rule_key: string;
  rule_type: string;
  action: 'protect' | 'review';
  value_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function mapPerson(row: PersonRow): ProtectedPersonRecord {
  const parsed = JSON.parse(row.protect_json) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some((entry) => !PERSON_ASSOCIATIONS.includes(entry as PersonAssociation))
  ) {
    throw new AppError(`Protected person ${row.id} has an invalid association list.`);
  }
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    profileUrl: row.profile_url,
    profileId: row.profile_id,
    protect: parsed as PersonAssociation[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRule(row: RuleRow): ProtectionRuleRecord {
  return {
    id: row.id,
    ruleKey: row.rule_key,
    ruleType: row.rule_type,
    action: row.action,
    value: JSON.parse(row.value_json) as unknown,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProtectionRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  addPerson(input: {
    id: string;
    name: string;
    relationship: string | null;
    profileUrl: string | null;
    profileId: string | null;
    protect: PersonAssociation[];
    now: Date;
  }): ProtectedPersonRecord {
    const timestamp = input.now.toISOString();
    this.db
      .prepare(
        `INSERT INTO protected_people (
          id, name, relationship, profile_url, profile_id, protect_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        input.relationship,
        input.profileUrl,
        input.profileId,
        JSON.stringify(input.protect),
        timestamp,
        timestamp,
      );
    return this.listPeople().find((person) => person.id === input.id) as ProtectedPersonRecord;
  }

  listPeople(): ProtectedPersonRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM protected_people ORDER BY name')
      .all() as PersonRow[];
    return rows.map(mapPerson);
  }

  addRule(input: {
    id: string;
    ruleKey: string;
    ruleType: string;
    action: 'protect' | 'review';
    value: unknown;
    now: Date;
  }): ProtectionRuleRecord {
    const timestamp = input.now.toISOString();
    this.db
      .prepare(
        `INSERT INTO protection_rules (
          id, rule_key, rule_type, action, value_json, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        input.id,
        input.ruleKey,
        input.ruleType,
        input.action,
        JSON.stringify(input.value),
        timestamp,
        timestamp,
      );
    const rule = this.listRules().find((entry) => entry.id === input.id);
    if (!rule) {
      throw new AppError(`Failed to read protection rule ${input.id}.`, 1);
    }
    return rule;
  }

  listRules(): ProtectionRuleRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM protection_rules ORDER BY rule_key')
      .all() as RuleRow[];
    return rows.map(mapRule);
  }

  protectActivity(input: {
    activityId: string;
    reason: string;
    ruleId: string | null;
    source: string;
    now: Date;
  }): void {
    this.db
      .prepare(
        `INSERT INTO protected_activities (activity_id, reason, rule_id, source, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(activity_id) DO UPDATE SET reason = excluded.reason, rule_id = excluded.rule_id, source = excluded.source`,
      )
      .run(input.activityId, input.reason, input.ruleId, input.source, input.now.toISOString());
  }

  isExplicitlyProtected(activityId: string): boolean {
    const row = this.db
      .prepare('SELECT activity_id FROM protected_activities WHERE activity_id = ?')
      .get(activityId);
    return Boolean(row);
  }

  replaceMatches(
    activityId: string,
    matches: Array<{
      id: string;
      ruleId: string | null;
      action: 'protect' | 'review';
      reasonCode: string;
      detail: string;
    }>,
    now: Date,
  ): void {
    const timestamp = now.toISOString();
    const write = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM activity_protection_matches WHERE activity_id = ?')
        .run(activityId);
      const insert = this.db.prepare(
        `INSERT INTO activity_protection_matches (
          id, activity_id, rule_id, action, reason_code, detail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const match of matches) {
        insert.run(
          match.id,
          activityId,
          match.ruleId,
          match.action,
          match.reasonCode,
          match.detail,
          timestamp,
        );
      }
    });
    write();
  }

  listMatches(activityId: string): ProtectionMatchRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM activity_protection_matches WHERE activity_id = ? ORDER BY created_at',
      )
      .all(activityId) as Array<{
      id: string;
      activity_id: string;
      rule_id: string | null;
      action: 'protect' | 'review';
      reason_code: string;
      detail: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      activityId: row.activity_id,
      ruleId: row.rule_id,
      action: row.action,
      reasonCode: row.reason_code,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }

  addReview(input: {
    id: string;
    activityId: string;
    decision: 'protect' | 'approve_deletion' | 'skip';
    note: string | null;
    now: Date;
  }): void {
    this.db
      .prepare(
        'INSERT INTO manual_reviews (id, activity_id, decision, note, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.id, input.activityId, input.decision, input.note, input.now.toISOString());
  }

  latestReview(activityId: string): ManualReviewRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM manual_reviews WHERE activity_id = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(activityId) as
      | {
          id: string;
          activity_id: string;
          decision: 'protect' | 'approve_deletion' | 'skip';
          note: string | null;
          created_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      activityId: row.activity_id,
      decision: row.decision,
      note: row.note,
      createdAt: row.created_at,
    };
  }
}
