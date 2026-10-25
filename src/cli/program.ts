import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import { BrowserManager } from '../browser/browser-manager.js';
import { SessionManager } from '../browser/session-manager.js';
import { AppError } from '../domain/errors.js';
import { toCsv, toJson, exportRow } from '../export/serialize.js';
import { PERSON_ASSOCIATIONS } from '../types/activity.js';
import { factsFromActivity } from '../protection/facts.js';
import { assemblePolicy } from '../protection/policy.js';
import { applyManualReview, loadDecision, rememberDecision } from '../protection/refresh.js';
import { compileDateFilter } from '../scanner/filters.js';
import { loadFixtureSource } from '../scanner/fixture-source.js';
import { runScan } from '../scanner/scanner.js';
import {
  DeletionEngine,
  UnavailableFacebookDeleter,
  recoverInFlightDeletions,
} from '../deletion/deletion-engine.js';
import { renderPreviewText, renderReviewHtml, type ReviewedActivity } from '../review/report.js';
import { assertLiveAutomationAvailable } from '../safety/live-automation.js';
import { startUiServer } from '../server/http.js';
import { openContext, type AppContext, type CliGlobals } from './context.js';
import {
  hasDateFlags,
  parseActivityType,
  parseLimit,
  readDateFilter,
  type DateFlagOptions,
} from './options.js';

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  isTTY(): boolean;
  prompt(question: string): Promise<string>;
}

const defaultIo: CliIo = {
  stdout: (text) => output.write(text),
  stderr: (text) => process.stderr.write(text),
  isTTY: () => Boolean(input.isTTY),
  async prompt(question: string): Promise<string> {
    const rl = createInterface({ input, output });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  },
};

function print(io: CliIo, text: string): void {
  io.stdout(text.endsWith('\n') ? text : `${text}\n`);
}

function globals(
  command: Command,
): CliGlobals & DateFlagOptions & Record<string, string | boolean | undefined> {
  return command.optsWithGlobals() as CliGlobals &
    DateFlagOptions &
    Record<string, string | boolean | undefined>;
}

async function usingContext(
  command: Command,
  io: CliIo,
  work: (ctx: AppContext) => Promise<void>,
): Promise<void> {
  const options = globals(command);
  if (options.respectProtection === false) {
    throw new AppError('Protection rules cannot be disabled, including with --execute.');
  }
  const ctx = openContext(options);
  try {
    await work(ctx);
  } finally {
    ctx.close();
  }
}

function addDateOptions(command: Command): Command {
  return command
    .option('--before <date>', 'Exclusive civil date. Activity must be entirely before YYYY-MM-DD.')
    .option('--after <date>', 'Exclusive civil date. Activity must be entirely after YYYY-MM-DD.')
    .option('--from <date>', 'Inclusive start civil date, YYYY-MM-DD.')
    .option('--to <date>', 'Inclusive end civil date, YYYY-MM-DD.')
    .option('--year <yyyy>', 'Inclusive calendar year in the configured timezone.')
    .option('--all', 'Every confidently dated activity. Unknown dates are still excluded.');
}

function policyFor(ctx: AppContext) {
  return assemblePolicy(ctx.config, ctx.protection.listPeople(), ctx.protection.listRules());
}

function reviewedActivities(ctx: AppContext, updateStatus: boolean): ReviewedActivity[] {
  const filter = compileDateFilter({ all: true }, ctx.config.timezone);
  const policy = policyFor(ctx);
  return ctx.activities.list().map((activity) => {
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
      { updateStatus },
    );
    return { activity: saved, decision };
  });
}

export function createProgram(io: CliIo = defaultIo): Command {
  const program = new Command();
  program
    .name('fb-cleaner')
    .description(
      'Delete your own historical Facebook activity locally. Dry-run is the default. Family memories are protected and that protection cannot be turned off.',
    )
    .option('--home <path>', 'Data directory. Defaults to ~/.fb-cleaner, outside this repository.')
    .option('--config <path>', 'YAML config path.')
    .option('--database <path>', 'SQLite database path.')
    .option('--timezone <iana>', 'IANA timezone used for civil date boundaries.')
    .option('--log-level <level>', 'silent, debug, info, warn, or error.')
    .option('--verbose', 'Write info logs.')
    .option('--respect-protection', 'Accepted for compatibility. Protection is always on.', true)
    .option('--no-respect-protection', 'Rejected. Protection cannot be disabled.')
    .showHelpAfterError(false)
    .exitOverride();

  addDateOptions(
    program
      .command('scan')
      .description('Discover activities. Without --fixture, Facebook is not opened.')
      .option('--type <type>', 'posts, comments, reactions, media, other, or all.')
      .option('--fixture <path>', 'Local HTML fixture. This is not the Facebook DOM.')
      .option('--respect-protection', 'Accepted for compatibility. Protection is always on.', true)
      .option('--no-respect-protection', 'Rejected. Protection cannot be disabled.'),
  ).action(async function (this: Command) {
    await usingContext(this, io, async (ctx) => {
      const options = globals(this);
      const dateFilter = readDateFilter(options);
      const filter = compileDateFilter(dateFilter, ctx.config.timezone, {
        requireConstraint: true,
      });
      const type = options.type ? parseActivityType(String(options.type)) : 'all';
      print(io, 'Protection is on. Unknown dates and uncertain ownership are kept.');
      print(io, `Filters: ${filter.description}. Type: ${type}.`);
      if (!options.fixture || typeof options.fixture !== 'string') {
        assertLiveAutomationAvailable('scan the Facebook Activity Log');
        return;
      }
      const summary = await runScan(
        {
          activities: ctx.activities,
          sessions: ctx.sessions,
          checkpoints: ctx.checkpoints,
          protection: ctx.protection,
          logger: ctx.logger,
        },
        {
          source: loadFixtureSource(options.fixture),
          filter,
          dateFilter,
          type,
          policy: policyFor(ctx),
          limits: {
            maxStagnation: ctx.config.limits.scroll_stagnation_limit,
            maxPages: ctx.config.limits.max_scrolls_per_scan,
          },
          fixturePath: options.fixture,
        },
      );
      print(
        io,
        `Scan ${summary.status}. Seen ${summary.seen}, inserted ${summary.inserted}, duplicates ${summary.duplicate}, unknown dates ${summary.unknownDate}. Stop: ${summary.stopReason ?? 'none'}.`,
      );
    });
  });

  program
    .command('preview')
    .description('Show stored activities grouped by protection status.')
    .option('--group-by <group>', 'protection-status', 'protection-status')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        if (options.groupBy && options.groupBy !== 'protection-status') {
          throw new AppError('The only preview grouping is protection-status.');
        }
        print(
          io,
          'Preview groups stored activities. A later delete still uses only the date filter you pass.',
        );
        print(io, renderPreviewText(reviewedActivities(ctx, true)));
      });
    });

  addDateOptions(
    program
      .command('delete')
      .description('Dry-run unless --execute and the confirmation phrase are both present.')
      .requiredOption(
        '--type <type>',
        'posts, comments, reactions, media, other, or all. Required so the scope is explicit.',
      )
      .option(
        '--execute',
        'Arm deletion. Still requires the confirmation phrase. Live Facebook deletion is unavailable in this build.',
      )
      .option('--confirm <phrase>', 'Exact phrase printed by the dry-run.')
      .option('--limit <count>', 'Maximum deletion attempts for this run.'),
  ).action(async function (this: Command) {
    await usingContext(this, io, async (ctx) => {
      const options = globals(this);
      const dateFilter = readDateFilter(options);
      const filter = compileDateFilter(dateFilter, ctx.config.timezone, {
        requireConstraint: true,
      });
      const type = parseActivityType(String(options.type));
      const limit = parseLimit(
        typeof options.limit === 'string' ? options.limit : undefined,
        ctx.config.limits.max_deletes_per_run,
      );
      print(
        io,
        'Facebook deletion may be irreversible. Export your Facebook data before deleting anything.',
      );
      print(io, 'Protection rules are on and cannot be disabled.');
      print(io, `Filters: ${filter.description}. Type: ${type}. Limit: ${limit}.`);
      const engine = new DeletionEngine({
        activities: ctx.activities,
        jobs: ctx.jobs,
        sleep: async () => undefined,
      });
      const baseRequest = {
        mode: 'live' as const,
        filter,
        filters: { ...dateFilter, type },
        type,
        policy: policyFor(ctx),
        limit,
        delays: { minMs: ctx.config.delays.min_ms, maxMs: ctx.config.delays.max_ms },
        maxConsecutiveFailures: ctx.config.limits.max_consecutive_failures,
        deleter: new UnavailableFacebookDeleter(),
        loadFacts: (activity: ReviewedActivity['activity']) => {
          const review = ctx.protection.latestReview(activity.id);
          return factsFromActivity(activity, filter, {
            explicitlyProtected: ctx.protection.isExplicitlyProtected(activity.id),
            manualDecision: review?.decision ?? null,
          });
        },
      };
      let phrase = typeof options.confirm === 'string' ? options.confirm : null;
      if (options.execute && !phrase && io.isTTY()) {
        const planned = await engine.run({ ...baseRequest, execute: false, phrase: null });
        print(io, `Eligible posts and comments: ${planned.eligibleIds.length}.`);
        phrase = (await io.prompt(`Type ${planned.phrase} to authorize this exact set: `)).trim();
      }
      const summary = await engine.run({
        ...baseRequest,
        execute: Boolean(options.execute),
        phrase,
      });
      if (summary.dryRun) {
        print(io, 'Dry-run. Nothing was deleted.');
        print(io, `Eligible posts and comments: ${summary.eligibleIds.length}.`);
        print(
          io,
          `Held back because this build has no validated handler: ${summary.withheldIds.length}.`,
        );
        print(
          io,
          `To authorize this exact set, re-run with --execute --confirm "${summary.phrase}".`,
        );
        return;
      }
      print(
        io,
        `Deleted ${summary.deletedIds.length}. Failed ${summary.failedIds.length}. Needs review ${summary.reviewIds.length}.`,
      );
    });
  });

  program
    .command('resume')
    .description(
      'Continue an interrupted fixture scan and recover uncertain deletions. Never deletes by itself.',
    )
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        if (hasDateFlags(options)) {
          throw new AppError('Resume keeps the original filters. Start a new scan to change them.');
        }
        const recovered = recoverInFlightDeletions(ctx.activities, new Date());
        print(
          io,
          `Recovered ${recovered.reviewed.length} uncertain deletion(s) into review and returned ${recovered.requeued.length} queued item(s) to eligible.`,
        );
        const session = ctx.sessions.latestInterrupted();
        if (!session) {
          print(io, 'No interrupted scan.');
          return;
        }
        const fixturePath = session.filters.fixturePath;
        if (typeof fixturePath !== 'string') {
          assertLiveAutomationAvailable('resume a Facebook scan');
          return;
        }
        const dateFilter = readDateFilter({
          ...(typeof session.filters.before === 'string' ? { before: session.filters.before } : {}),
          ...(typeof session.filters.after === 'string' ? { after: session.filters.after } : {}),
          ...(typeof session.filters.from === 'string' ? { from: session.filters.from } : {}),
          ...(typeof session.filters.to === 'string' ? { to: session.filters.to } : {}),
          ...(typeof session.filters.year === 'number'
            ? { year: String(session.filters.year) }
            : {}),
          ...(session.filters.all === true ? { all: true } : {}),
        });
        const filter = compileDateFilter(dateFilter, ctx.config.timezone, {
          requireConstraint: true,
        });
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
            source: loadFixtureSource(fixturePath),
            sessionId: session.id,
            resumeCursor: ctx.checkpoints.getScan(session.id),
            filter,
            dateFilter,
            type,
            policy: policyFor(ctx),
            limits: {
              maxStagnation: ctx.config.limits.scroll_stagnation_limit,
              maxPages: ctx.config.limits.max_scrolls_per_scan,
            },
            fixturePath,
          },
        );
        print(
          io,
          `Resume ${summary.status}. Inserted ${summary.inserted}, duplicates ${summary.duplicate}.`,
        );
      });
    });

  program
    .command('status')
    .description('Show local database counts. This does not contact Facebook.')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const counts = ctx.activities.countByStatus();
        print(io, `Database: ${ctx.paths.databasePath}`);
        print(io, `Timezone: ${ctx.config.timezone}`);
        for (const [status, count] of Object.entries(counts)) {
          print(io, `${status}: ${count}`);
        }
        const scan = ctx.sessions.latest();
        print(io, scan ? `Last scan: ${scan.status} at ${scan.startedAt}` : 'Last scan: none');
        const job = ctx.jobs.latest();
        print(
          io,
          job
            ? `Last deletion job: ${job.status}, dry-run ${job.dryRun}`
            : 'Last deletion job: none',
        );
        print(io, `Protected people: ${ctx.protection.listPeople().length}`);
        print(io, `Protection rules: ${ctx.protection.listRules().length}`);
      });
    });

  program
    .command('export')
    .description('Write stored activities to JSON or CSV on this computer.')
    .option('--format <format>', 'json or csv', 'json')
    .option('--output <path>', 'File path. Omit to write to stdout.')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        const format = String(options.format ?? 'json');
        const rows = ctx.activities
          .list()
          .map((activity) => exportRow(activity, ctx.protection.listMatches(activity.id)));
        const body = format === 'csv' ? toCsv(rows) : format === 'json' ? toJson(rows) : null;
        if (body === null) {
          throw new AppError('Export format must be json or csv.');
        }
        io.stderr('Export stays on this machine unless you move the file yourself.\n');
        if (typeof options.output === 'string') {
          writeFileSync(options.output, body, { encoding: 'utf8', mode: 0o600 });
          print(io, `Wrote ${options.output}`);
          return;
        }
        io.stdout(body);
      });
    });

  program
    .command('login')
    .description(
      'Prepare a private browser profile. Live Facebook login is disabled until the UI is validated.',
    )
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        print(
          io,
          'Manual login would let you finish 2FA yourself. This program never asks for or stores a password.',
        );
        const browser = new BrowserManager(new SessionManager(ctx.paths.browserProfilePath));
        await browser.openForManualLogin();
      });
    });

  const protect = program
    .command('protect')
    .description('Protect people, keywords, albums, and posts.');
  protect
    .command('list')
    .description('List protection rules stored in the local database.')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const people = ctx.protection.listPeople();
        const rules = ctx.protection.listRules();
        print(io, `People (${people.length})`);
        for (const person of people) {
          print(io, `- ${person.name}${person.relationship ? ` (${person.relationship})` : ''}`);
        }
        print(io, `Rules (${rules.length})`);
        for (const rule of rules) {
          print(io, `- ${rule.ruleKey} ${rule.ruleType} ${rule.action}`);
        }
        const memories = ctx.config.protection.family_memories;
        print(
          io,
          `Family memories: ${memories.enabled ? 'on' : 'off'} (${memories.keywords.length} keywords)`,
        );
      });
    });

  protect
    .command('person')
    .command('add')
    .description('Protect a person by name and, when you have it, profile URL or id.')
    .requiredOption('--name <name>')
    .option('--relationship <relationship>')
    .option('--profile-url <url>')
    .option('--profile-id <id>')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        const person = ctx.protection.addPerson({
          id: randomUUID(),
          name: String(options.name),
          relationship: typeof options.relationship === 'string' ? options.relationship : null,
          profileUrl: typeof options.profileUrl === 'string' ? options.profileUrl : null,
          profileId: typeof options.profileId === 'string' ? options.profileId : null,
          protect: [...PERSON_ASSOCIATIONS],
          now: new Date(),
        });
        print(
          io,
          `Protected ${person.name}. Posts, tags, mentions, photos, shares, and comments tied to this person will not be deleted.`,
        );
      });
    });

  protect
    .command('keyword')
    .command('add')
    .description('Protect activities whose text contains a keyword.')
    .argument('<keyword>')
    .action(async function (this: Command, keyword: string) {
      await usingContext(this, io, async (ctx) => {
        const rule = ctx.protection.addRule({
          id: randomUUID(),
          ruleKey: `keyword-${randomUUID()}`,
          ruleType: 'keyword',
          action: 'protect',
          value: { values: [keyword] },
          now: new Date(),
        });
        print(io, `Added keyword rule ${rule.ruleKey} for “${keyword}”.`);
      });
    });

  protect
    .command('album')
    .command('add')
    .description('Protect an album by URL or name.')
    .option('--url <url>')
    .option('--name <name>')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        if (typeof options.url !== 'string' && typeof options.name !== 'string') {
          throw new AppError('Pass --url or --name for the album to protect.');
        }
        if (typeof options.url === 'string') {
          ctx.protection.addRule({
            id: randomUUID(),
            ruleKey: `album-url-${randomUUID()}`,
            ruleType: 'album_url',
            action: 'protect',
            value: options.url,
            now: new Date(),
          });
        }
        if (typeof options.name === 'string') {
          ctx.protection.addRule({
            id: randomUUID(),
            ruleKey: `album-${randomUUID()}`,
            ruleType: 'album',
            action: 'protect',
            value: options.name,
            now: new Date(),
          });
        }
        print(io, 'Album protection saved.');
      });
    });

  protect
    .command('post')
    .command('add')
    .description('Protect one post URL.')
    .requiredOption('--url <url>')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        ctx.protection.addRule({
          id: randomUUID(),
          ruleKey: `post-${randomUUID()}`,
          ruleType: 'post_url',
          action: 'protect',
          value: String(options.url),
          now: new Date(),
        });
        print(io, 'Post protection saved.');
      });
    });

  const review = program
    .command('review')
    .description('Inspect stored activities before any deletion.');
  review.action(async function (this: Command) {
    await usingContext(this, io, async (ctx) => {
      print(io, renderPreviewText(reviewedActivities(ctx, true)));
    });
  });
  review
    .command('list')
    .description('List review groups.')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        print(io, renderPreviewText(reviewedActivities(ctx, true)));
      });
    });
  review
    .command('html')
    .description('Write a local HTML review page. It does not load remote images.')
    .requiredOption('--output <path>')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        const html = renderReviewHtml(reviewedActivities(ctx, false));
        writeFileSync(String(options.output), html, { encoding: 'utf8', mode: 0o600 });
        print(io, `Wrote ${String(options.output)}`);
      });
    });
  review
    .command('decide')
    .description('Protect an activity, approve that one activity, or skip it for now.')
    .requiredOption('--id <id>')
    .requiredOption('--decision <decision>', 'protect, approve_deletion, or skip')
    .option('--note <note>')
    .action(async function (this: Command) {
      await usingContext(this, io, async (ctx) => {
        const options = globals(this);
        const decision = String(options.decision);
        if (decision !== 'protect' && decision !== 'approve_deletion' && decision !== 'skip') {
          throw new AppError('Decision must be protect, approve_deletion, or skip.');
        }
        const result = applyManualReview(
          { activities: ctx.activities, protection: ctx.protection },
          {
            activityId: String(options.id),
            decision,
            note: typeof options.note === 'string' ? options.note : null,
            filter: compileDateFilter({ all: true }, ctx.config.timezone),
            policy: policyFor(ctx),
          },
        );
        print(
          io,
          `${result.activity.id} is now ${result.activity.status} (${result.decision.outcome}).`,
        );
      });
    });

  program
    .command('ui')
    .description('Open the local page for these same actions. It does not contact Facebook.')
    .option('--port <port>', 'Port on this computer', '4173')
    .option('--no-open', 'Do not launch a browser')
    .action(async function (this: Command) {
      const options = globals(this);
      const port = Number(options.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new AppError('The port must be an integer from 1 to 65535.');
      }
      await usingContext(this, io, async (ctx) => {
        const staticDir = path.resolve('web/dist');
        const pageReady = existsSync(path.join(staticDir, 'index.html'));
        const ui = await startUiServer(ctx, {
          port,
          ...(pageReady ? { staticDir } : {}),
          devOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
        });
        print(io, `Interface local: ${ui.url}`);
        print(io, `Dados neste computador: ${ctx.paths.root}`);
        print(io, 'Nada é apagado no Facebook. Ctrl+C encerra.');
        if (!pageReady) {
          io.stderr('A página ainda não foi compilada. Rode npm run ui ou npm run ui:dev.\n');
        }
        if (options.open !== false && pageReady && process.platform !== 'win32') {
          const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
          spawn(opener, [ui.url], { stdio: 'ignore', detached: true }).unref();
        }
        await new Promise<void>((resolve) => {
          const stop = () => {
            void ui.close().finally(resolve);
          };
          process.once('SIGINT', stop);
          process.once('SIGTERM', stop);
        });
      });
    });

  return program;
}
