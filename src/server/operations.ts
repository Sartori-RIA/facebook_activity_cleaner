import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../cli/context.js';
import {
  parseActivityType,
  parseLimit,
  readDateFilter,
  type DateFlagOptions,
} from '../cli/options.js';
import { UiError } from './ui-error.js';
import { toCsv, toJson, exportRow } from '../export/serialize.js';
import {
  DeletionEngine,
  UnavailableFacebookDeleter,
  recoverInFlightDeletions,
} from '../deletion/deletion-engine.js';
import { factsFromActivity } from '../protection/facts.js';
import { assemblePolicy } from '../protection/policy.js';
import { previewGroup, type PreviewGroup } from '../protection/preview.js';
import { applyManualReview, loadDecision, rememberDecision } from '../protection/refresh.js';
import { restrictDirectory } from '../config/paths.js';
import { compileDateFilter, type DateFilterInput } from '../scanner/filters.js';
import { parseFacebookExportHtml } from '../scanner/facebook-export.js';
import { loadActivitySource, parseFixtureHtml } from '../scanner/fixture-source.js';
import { runScan, type ScanSummary } from '../scanner/scanner.js';
import { PERSON_ASSOCIATIONS, type ActivityStatus } from '../types/activity.js';
import { publicFacebookUrl } from '../utils/facebook-url.js';

export interface DateRequest {
  before?: string;
  after?: string;
  from?: string;
  to?: string;
  year?: string;
  all?: boolean;
}

export interface ActivityCard {
  id: string;
  type: string;
  status: string;
  date: string | null;
  ownership: string;
  text: string | null;
  label: string | null;
  sharedFrom: string | null;
  author: string | null;
  url: string | null;
  group: PreviewGroup;
  outcome: string;
  reasons: Array<{ code: string; value: string | null }>;
}

function reasonPayload(code: string, detail: string): { code: string; value: string | null } {
  const quoted = /“([^”]+)”/.exec(detail)?.[1] ?? null;
  if (code === 'protected_person') {
    const person = detail.split(' matches ')[0]?.trim() ?? '';
    return { code, value: person && person !== detail ? person : null };
  }
  if (code === 'family_keyword' || code === 'family_album') {
    return { code, value: quoted };
  }
  return { code, value: null };
}

export function sampleFixturePath(): string | null {
  const candidate = path.resolve(process.cwd(), 'tests/fixtures/activity-log.html');
  return existsSync(candidate) ? candidate : null;
}

function policyFor(ctx: AppContext) {
  return assemblePolicy(ctx.config, ctx.protection.listPeople(), ctx.protection.listRules());
}

function dateInput(request: DateRequest): DateFilterInput {
  const flags: DateFlagOptions = {};
  if (request.before) flags.before = request.before;
  if (request.after) flags.after = request.after;
  if (request.from) flags.from = request.from;
  if (request.to) flags.to = request.to;
  if (request.year) flags.year = request.year;
  if (request.all) flags.all = true;
  return readDateFilter(flags);
}

export function listActivityCards(ctx: AppContext, year?: number): ActivityCard[] {
  const filter = compileDateFilter({ all: true }, ctx.config.timezone);
  const policy = policyFor(ctx);
  const activities = year === undefined ? ctx.activities.list() : ctx.activities.listByYear(year);
  return activities
    .map((activity) => {
      const decision = loadDecision(
        { activities: ctx.activities, protection: ctx.protection },
        activity,
        filter,
        policy,
      );
      const saved = rememberDecision(
        { activities: ctx.activities, protection: ctx.protection },
        activity,
        decision,
        { updateStatus: true },
      );
      if (saved.status === 'deleted' || saved.status === 'deleting') {
        return null;
      }
      return {
        id: saved.id,
        type: saved.activityType,
        status: saved.status,
        date: saved.occurredText,
        ownership: saved.ownership,
        text: saved.textPreview,
        label: saved.rawLabel,
        sharedFrom: saved.metadata.sharedFromName,
        author: saved.authorName,
        url: publicFacebookUrl(saved.sourceUrl),
        group: saved.status === 'requires_review' ? 'needs_review' : previewGroup(decision),
        outcome: decision.outcome,
        reasons: decision.reasons.map((reason) => reasonPayload(reason.code, reason.detail)),
      };
    })
    .filter((card): card is ActivityCard => card !== null);
}

export function overview(ctx: AppContext) {
  const scan = ctx.sessions.latest();
  const job = ctx.jobs.latest();
  return {
    timezone: ctx.config.timezone,
    databasePath: ctx.paths.databasePath,
    counts: ctx.activities.countByStatus() satisfies Record<ActivityStatus, number>,
    years: ctx.activities.countByYear(),
    people: ctx.protection.listPeople().map((person) => ({
      id: person.id,
      name: person.name,
      relationship: person.relationship,
      profileUrl: person.profileUrl,
    })),
    rules: ctx.protection.listRules().map((rule) => ({
      id: rule.id,
      key: rule.ruleKey,
      type: rule.ruleType,
      action: rule.action,
      value: rule.value,
    })),
    familyMemories: {
      enabled: ctx.config.protection.family_memories.enabled,
      keywords: ctx.config.protection.family_memories.keywords,
    },
    lastScan: scan
      ? { status: scan.status, startedAt: scan.startedAt, inserted: scan.itemsInserted }
      : null,
    lastJob: job ? { status: job.status, dryRun: job.dryRun, createdAt: job.createdAt } : null,
    liveFacebook: false,
    sampleFixtureAvailable: sampleFixturePath() !== null,
    account: readAccount(ctx),
  };
}

const ACCOUNT_KEY = 'account.profile';
const SESSION_MARKERS = ['c_user=', 'xs=', 'datr=', 'sb=', 'fr=', 'password='];

export function readAccount(ctx: AppContext): { name: string; profileUrl: string | null } | null {
  const stored = ctx.settings.get<{ name?: unknown; profileUrl?: unknown }>(ACCOUNT_KEY);
  if (!stored || typeof stored.name !== 'string' || !stored.name.trim()) {
    return null;
  }
  return {
    name: stored.name.trim(),
    profileUrl:
      typeof stored.profileUrl === 'string' && stored.profileUrl ? stored.profileUrl : null,
  };
}

export function saveAccount(
  ctx: AppContext,
  input: { name: string; profileUrl: string | null },
): { name: string; profileUrl: string | null } | null {
  const name = input.name.trim();
  const rawUrl = input.profileUrl?.trim() ?? '';
  if (!name && !rawUrl) {
    ctx.settings.set(ACCOUNT_KEY, null, new Date());
    return null;
  }
  if (!name || name.length > 200) {
    throw new UiError('account_name', 'Escreva o nome do seu perfil.');
  }
  const profileUrl = rawUrl ? facebookProfileUrl(rawUrl) : null;
  const account = { name, profileUrl };
  ctx.settings.set(ACCOUNT_KEY, account, new Date());
  return account;
}

function facebookProfileUrl(raw: string): string {
  const lower = raw.toLowerCase();
  if (SESSION_MARKERS.some((marker) => lower.includes(marker))) {
    throw new UiError(
      'account_secret',
      'Não cole cookies nem a sessão. Só o endereço público do perfil.',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UiError(
      'account_url',
      'Use um endereço https do Facebook, como https://www.facebook.com/seu.nome',
    );
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const facebookHost =
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com');
  if (url.protocol !== 'https:' || !facebookHost) {
    throw new UiError(
      'account_url',
      'Use um endereço https do Facebook, como https://www.facebook.com/seu.nome',
    );
  }
  url.searchParams.delete('fbclid');
  url.hash = '';
  return url.toString();
}

export function addPerson(
  ctx: AppContext,
  input: {
    name: string;
    relationship: string | null;
    profileUrl: string | null;
    profileId: string | null;
  },
) {
  const name = input.name.trim();
  if (!name) {
    throw new UiError('name_required', 'Escreva o nome da pessoa.');
  }
  return ctx.protection.addPerson({
    id: randomUUID(),
    name,
    relationship: input.relationship,
    profileUrl: input.profileUrl,
    profileId: input.profileId,
    protect: [...PERSON_ASSOCIATIONS],
    now: new Date(),
  });
}

export function addKeyword(ctx: AppContext, keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) {
    throw new UiError('keyword_required', 'Escreva a palavra que deve ser protegida.');
  }
  return ctx.protection.addRule({
    id: randomUUID(),
    ruleKey: `keyword-${randomUUID()}`,
    ruleType: 'keyword',
    action: 'protect',
    value: { values: [trimmed] },
    now: new Date(),
  });
}

export function addAlbum(ctx: AppContext, input: { url: string | null; name: string | null }) {
  if (!input.url && !input.name) {
    throw new UiError('album_required', 'Informe o nome ou o endereço do álbum.');
  }
  if (input.url) {
    ctx.protection.addRule({
      id: randomUUID(),
      ruleKey: `album-url-${randomUUID()}`,
      ruleType: 'album_url',
      action: 'protect',
      value: input.url,
      now: new Date(),
    });
  }
  if (input.name) {
    ctx.protection.addRule({
      id: randomUUID(),
      ruleKey: `album-${randomUUID()}`,
      ruleType: 'album',
      action: 'protect',
      value: input.name,
      now: new Date(),
    });
  }
}

export function addPost(ctx: AppContext, url: string) {
  if (!url.trim()) {
    throw new UiError('post_required', 'Informe o endereço do post.');
  }
  ctx.protection.addRule({
    id: randomUUID(),
    ruleKey: `post-${randomUUID()}`,
    ruleType: 'post_url',
    action: 'protect',
    value: url.trim(),
    now: new Date(),
  });
}

const UPLOAD_HTML_LIMIT = 8_000_000;

function storeUploadedFixture(ctx: AppContext, html: string): string {
  if (html.length > UPLOAD_HTML_LIMIT) {
    throw new UiError('file_too_large', 'Esse arquivo é grande demais para esta versão.');
  }
  if (!html.trim()) {
    throw new UiError('file_empty', 'O arquivo está vazio.');
  }
  if (parseFixtureHtml(html).length === 0 && parseFacebookExportHtml(html).length === 0) {
    throw new UiError(
      'file_unreadable',
      'Este arquivo não tem itens no formato que esta versão lê.',
    );
  }
  const directory = path.join(ctx.paths.root, 'uploads');
  restrictDirectory(directory);
  const filePath = path.join(directory, `${randomUUID()}.html`);
  writeFileSync(filePath, html, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

function resolveFixture(
  ctx: AppContext,
  input: { fixturePath?: string; fixtureHtml?: string; useSample?: boolean },
): string {
  if (input.fixtureHtml !== undefined) {
    return storeUploadedFixture(ctx, input.fixtureHtml);
  }
  if (input.useSample) {
    const sample = sampleFixturePath();
    if (!sample) {
      throw new UiError(
        'sample_missing',
        'O arquivo de exemplo não está nesta pasta. Escolha um HTML neste computador.',
      );
    }
    return sample;
  }
  const fixturePath = input.fixturePath?.trim();
  if (!fixturePath) {
    throw new UiError(
      'live_unavailable',
      'A busca ao vivo no Facebook ainda não está disponível. Use o arquivo de exemplo ou escolha um HTML neste computador.',
    );
  }
  if (fixturePath.startsWith('http://') || fixturePath.startsWith('https://')) {
    throw new UiError(
      'remote_fixture',
      'A busca aceita só um arquivo neste computador, não um endereço da internet.',
    );
  }
  const resolved = path.resolve(fixturePath);
  if (!existsSync(resolved)) {
    throw new UiError('file_missing', 'Não encontrei esse arquivo.');
  }
  return resolved;
}

export async function scanActivities(
  ctx: AppContext,
  input: DateRequest & {
    type?: string;
    fixturePath?: string;
    fixtureHtml?: string;
    useSample?: boolean;
  },
): Promise<ScanSummary & { description: string }> {
  const dateFilter = dateInput(input);
  const filter = compileDateFilter(dateFilter, ctx.config.timezone, { requireConstraint: true });
  const type = input.type ? parseActivityType(input.type) : 'all';
  const fixturePath = resolveFixture(ctx, input);
  const summary = await runScan(
    {
      activities: ctx.activities,
      sessions: ctx.sessions,
      checkpoints: ctx.checkpoints,
      protection: ctx.protection,
      logger: ctx.logger,
    },
    {
      source: loadActivitySource(fixturePath, 200),
      filter,
      dateFilter,
      type,
      policy: policyFor(ctx),
      limits: {
        maxStagnation: ctx.config.limits.max_scrolls_per_scan,
        maxPages: ctx.config.limits.max_scrolls_per_scan,
      },
      fixturePath,
    },
  );
  return { ...summary, description: filter.description };
}

export async function resumeActivities(ctx: AppContext) {
  const recovered = recoverInFlightDeletions(ctx.activities, new Date());
  const session = ctx.sessions.latestInterrupted();
  if (!session) {
    return { recovered, summary: null };
  }
  const fixturePath = session.filters.fixturePath;
  if (typeof fixturePath !== 'string') {
    throw new UiError(
      'resume_unavailable',
      'Esta busca interrompida não tem um arquivo local. Continuar no Facebook ainda não está disponível.',
    );
  }
  const dateFilter = readDateFilter({
    ...(typeof session.filters.before === 'string' ? { before: session.filters.before } : {}),
    ...(typeof session.filters.after === 'string' ? { after: session.filters.after } : {}),
    ...(typeof session.filters.from === 'string' ? { from: session.filters.from } : {}),
    ...(typeof session.filters.to === 'string' ? { to: session.filters.to } : {}),
    ...(typeof session.filters.year === 'number' ? { year: String(session.filters.year) } : {}),
    ...(session.filters.all === true ? { all: true } : {}),
  });
  const filter = compileDateFilter(dateFilter, ctx.config.timezone, { requireConstraint: true });
  const type = session.activityType ? parseActivityType(session.activityType) : 'all';
  const summary = await runScan(
    {
      activities: ctx.activities,
      sessions: ctx.sessions,
      checkpoints: ctx.checkpoints,
      protection: ctx.protection,
      logger: ctx.logger,
    },
    {
      source: loadActivitySource(fixturePath, 200),
      sessionId: session.id,
      resumeCursor: ctx.checkpoints.getScan(session.id),
      filter,
      dateFilter,
      type,
      policy: policyFor(ctx),
      limits: {
        maxStagnation: ctx.config.limits.max_scrolls_per_scan,
        maxPages: ctx.config.limits.max_scrolls_per_scan,
      },
      fixturePath,
    },
  );
  return { recovered, summary };
}

export function decideActivity(
  ctx: AppContext,
  input: { id: string; decision: 'protect' | 'approve_deletion' | 'skip'; note: string | null },
) {
  const result = applyManualReview(
    { activities: ctx.activities, protection: ctx.protection },
    {
      activityId: input.id,
      decision: input.decision,
      note: input.note,
      filter: compileDateFilter({ all: true }, ctx.config.timezone),
      policy: policyFor(ctx),
    },
  );
  return {
    id: result.activity.id,
    status: result.activity.status,
    outcome: result.decision.outcome,
  };
}

export async function previewDeletion(
  ctx: AppContext,
  input: DateRequest & { type?: string; limit?: number },
) {
  const dateFilter = dateInput(input);
  const filter = compileDateFilter(dateFilter, ctx.config.timezone, { requireConstraint: true });
  const type = parseActivityType(input.type ?? 'all');
  const limit = parseLimit(
    input.limit === undefined ? undefined : String(input.limit),
    ctx.config.limits.max_deletes_per_run,
  );
  const engine = new DeletionEngine({
    activities: ctx.activities,
    jobs: ctx.jobs,
    sleep: async () => undefined,
  });
  const summary = await engine.run({
    mode: 'live',
    execute: false,
    phrase: null,
    filter,
    filters: { ...dateFilter, type },
    type,
    policy: policyFor(ctx),
    limit,
    delays: { minMs: ctx.config.delays.min_ms, maxMs: ctx.config.delays.max_ms },
    maxConsecutiveFailures: ctx.config.limits.max_consecutive_failures,
    deleter: new UnavailableFacebookDeleter(),
    loadFacts: (activity) => {
      const review = ctx.protection.latestReview(activity.id);
      return factsFromActivity(activity, filter, {
        explicitlyProtected: ctx.protection.isExplicitlyProtected(activity.id),
        manualDecision: review?.decision ?? null,
      });
    },
  });
  const cards = listActivityCards(ctx);
  const eligible = summary.eligibleIds
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is ActivityCard => card !== undefined);
  return {
    dryRun: true,
    description: summary.description,
    phrase: summary.phrase,
    eligible,
    withheldCount: summary.withheldIds.length,
    nothingDeleted: true,
  };
}

export function exportActivities(
  ctx: AppContext,
  format: string,
): { body: string; contentType: string; filename: string } {
  const rows = ctx.activities
    .list()
    .map((activity) => exportRow(activity, ctx.protection.listMatches(activity.id)));
  if (format === 'csv') {
    return {
      body: toCsv(rows),
      contentType: 'text/csv; charset=utf-8',
      filename: 'atividades.csv',
    };
  }
  if (format === 'json') {
    return {
      body: toJson(rows),
      contentType: 'application/json; charset=utf-8',
      filename: 'atividades.json',
    };
  }
  throw new UiError('bad_format', 'O formato precisa ser json ou csv.');
}
