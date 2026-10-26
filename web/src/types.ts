export type Screen = 'home' | 'protect' | 'scan' | 'review' | 'simulate';

export type PreviewGroup =
  'safe_candidates' | 'protected' | 'potential_family_memories' | 'needs_review' | 'skipped';

export interface Overview {
  timezone: string;
  databasePath: string;
  counts: Record<string, number>;
  years: Array<{ year: number; count: number }>;
  people: Array<{
    id: string;
    name: string;
    relationship: string | null;
    profileUrl: string | null;
  }>;
  rules: Array<{ id: string; key: string; type: string; action: string; value: unknown }>;
  familyMemories: { enabled: boolean; keywords: string[] };
  lastScan: { status: string; startedAt: string; inserted: number } | null;
  lastJob: { status: string; dryRun: boolean; createdAt: string } | null;
  liveFacebook: boolean;
  sampleFixtureAvailable: boolean;
  account: { name: string; profileUrl: string | null } | null;
}

export interface ActivityCard {
  id: string;
  type: string;
  status: string;
  date: string | null;
  ownership: string;
  text: string | null;
  label?: string | null;
  sharedFrom?: string | null;
  author: string | null;
  url: string | null;
  group: PreviewGroup;
  outcome: string;
  reasons: Array<{ code: string; value: string | null }>;
}

export interface ScanResult {
  status: string;
  seen: number;
  inserted: number;
  duplicate: number;
  unknownDate: number;
  description: string;
  stopReason?: string | null;
}

export interface PreviewResult {
  dryRun: boolean;
  description: string;
  eligible: ActivityCard[];
  withheldCount: number;
  nothingDeleted: boolean;
}

export interface DateChoice {
  before?: string;
  after?: string;
  from?: string;
  to?: string;
  year?: string;
  all?: boolean;
}
