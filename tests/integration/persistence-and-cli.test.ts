import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { parse } from 'yaml';
import { appConfigSchema } from '../../src/config/schema.js';
import { createProgram, type CliIo } from '../../src/cli/program.js';
import { openDatabase } from '../../src/database/connection.js';
import { loadFixtureSource } from '../../src/scanner/fixture-source.js';
import { runScan } from '../../src/scanner/scanner.js';
import { compileDateFilter } from '../../src/scanner/filters.js';
import { assemblePolicy } from '../../src/protection/policy.js';
import { defaultConfig } from '../../src/config/schema.js';
import { FixtureActivitySource } from '../../src/scanner/fixture-source.js';
import type { RawActivity } from '../../src/types/activity.js';
import { createStores } from '../helpers.js';

const fixturePath = fileURLToPath(new URL('../fixtures/activity-log.html', import.meta.url));

function captureIo(): CliIo & { out: string; err: string } {
  const io = {
    out: '',
    err: '',
    stdout(text: string) {
      this.out += text;
    },
    stderr(text: string) {
      this.err += text;
    },
    isTTY: () => false,
    async prompt(): Promise<string> {
      return '';
    },
  };
  return io;
}

async function runCli(args: string[], io: CliIo): Promise<void> {
  const program = createProgram(io);
  await program.parseAsync(args, { from: 'user' });
}

describe('sqlite', () => {
  it('applies migrations once and enforces the activity foreign key', () => {
    const db = openDatabase(':memory:');
    const first = db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
      count: number;
    };
    db.close();
    const again = openDatabase(':memory:');
    const second = again
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_activities_status'",
      )
      .get();
    expect(first.count).toBe(1);
    expect(second).toBeTruthy();
    expect(() =>
      again
        .prepare(
          'INSERT INTO manual_reviews (id, activity_id, decision, created_at) VALUES (?, ?, ?, ?)',
        )
        .run('review-1', 'missing', 'skip', new Date().toISOString()),
    ).toThrow(/FOREIGN KEY/);
    again.close();
  });

  it('round-trips an application setting', () => {
    const stores = createStores();
    stores.settings.set('timezone', 'America/Sao_Paulo', new Date());
    expect(stores.settings.get('timezone')).toBe('America/Sao_Paulo');
    stores.close();
  });
});

describe('fixture scan', () => {
  it('stores activities once, protects family text, and resumes without widening the filter', async () => {
    const stores = createStores();
    const controller = new AbortController();
    let pages = 0;
    const source = loadFixtureSource(fixturePath, 4);
    const originalNext = source.nextPage.bind(source);
    source.nextPage = async () => {
      pages += 1;
      if (pages === 2) {
        controller.abort();
      }
      return originalNext();
    };
    const filter = compileDateFilter({ before: '2017-01-01' }, 'UTC');
    const policy = assemblePolicy(defaultConfig(), [], []);
    const first = await runScan(
      {
        activities: stores.activities,
        sessions: stores.sessions,
        checkpoints: stores.checkpoints,
        protection: stores.protection,
        logger: stores.logger,
      },
      {
        source,
        filter,
        dateFilter: { before: '2017-01-01' },
        type: 'all',
        policy,
        limits: { maxStagnation: 3, maxPages: 20 },
        fixturePath,
        signal: controller.signal,
      },
    );
    expect(first.status).toBe('interrupted');
    expect(stores.activities.list().length).toBeGreaterThan(0);
    const countAfterInterrupt = stores.activities.list().length;
    const resumed = await runScan(
      {
        activities: stores.activities,
        sessions: stores.sessions,
        checkpoints: stores.checkpoints,
        protection: stores.protection,
        logger: stores.logger,
      },
      {
        source: loadFixtureSource(fixturePath, 4),
        sessionId: first.sessionId,
        resumeCursor: stores.checkpoints.getScan(first.sessionId),
        filter,
        dateFilter: { before: '2017-01-01' },
        type: 'all',
        policy,
        limits: { maxStagnation: 3, maxPages: 20 },
        fixturePath,
      },
    );
    expect(resumed.status).toBe('completed');
    const rows = stores.activities.list();
    expect(rows.length).toBeGreaterThanOrEqual(countAfterInterrupt);
    expect(new Set(rows.map((row) => row.fingerprint)).size).toBe(rows.length);
    const family = rows.find((row) => row.textPreview?.includes('família'));
    expect(family?.status).toBe('skipped');
    const undated = rows.find((row) => row.textPreview === 'A mystery note');
    expect(undated?.status).toBe('requires_review');
    const otherPerson = rows.find((row) => row.ownership === 'not_owned');
    expect(otherPerson?.status).toBe('skipped');
    expect(rows.filter((row) => row.textPreview === 'Quarterly planning notes')).toHaveLength(1);
    stores.close();
  });

  it('stops a source that repeats the same page forever', async () => {
    const stores = createStores();
    const item: RawActivity = {
      activityType: 'post',
      occurredText: '2015-06-01',
      ownership: 'owned',
      textPreview: 'loop',
      sourceUrl: 'https://www.facebook.com/fixture/posts/loop',
      authorName: 'Alex',
    };
    let reads = 0;
    const source = new FixtureActivitySource([item], 1);
    const repeating = {
      async nextPage() {
        reads += 1;
        return { items: [item], endReached: false, pageIndex: reads };
      },
    };
    const summary = await runScan(
      {
        activities: stores.activities,
        sessions: stores.sessions,
        checkpoints: stores.checkpoints,
        protection: stores.protection,
        logger: stores.logger,
      },
      {
        source: repeating,
        filter: compileDateFilter({ all: true }, 'UTC'),
        dateFilter: { all: true },
        type: 'all',
        policy: assemblePolicy(defaultConfig(), [], []),
        limits: { maxStagnation: 3, maxPages: 50 },
        fixturePath: null,
      },
    );
    expect(summary.status).toBe('completed');
    expect(summary.inserted).toBe(1);
    expect(reads).toBeLessThan(10);
    void source;
    stores.close();
  });
});

describe('cli', () => {
  it('parses the example config', () => {
    const raw = parse(readFileSync(path.join(process.cwd(), 'config/example.yaml'), 'utf8'));
    expect(appConfigSchema.parse(raw).protection.people[0]?.name).toBe('Natanaiah');
  });

  it('protects a person, scans a fixture, previews the reason, and refuses live deletion', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'fb-cleaner-cli-'));
    const io = captureIo();
    const shared = ['--home', home, '--log-level', 'silent', '--timezone', 'UTC'];
    await runCli(
      ['protect', 'person', 'add', '--name', 'Natanaiah', '--relationship', 'spouse', ...shared],
      io,
    );
    expect(io.out).toContain('Natanaiah');
    io.out = '';
    await runCli(
      ['scan', '--fixture', fixturePath, '--before', '2017-01-01', '--type', 'all', ...shared],
      io,
    );
    expect(io.out).toContain('Scan completed');
    io.out = '';
    await runCli(['preview', '--group-by', 'protection-status', ...shared], io);
    expect(io.out).toContain('Protected activities');
    expect(io.out).toContain('família');
    expect(io.out).toContain('Natanaiah');
    io.out = '';
    await runCli(['delete', '--before', '2017-01-01', '--type', 'all', ...shared], io);
    const phrase = /--confirm "([^"]+)"/.exec(io.out)?.[1];
    expect(phrase).toBeTruthy();
    expect(io.out).toContain('Dry-run');
    await expect(
      runCli(
        [
          'delete',
          '--before',
          '2017-01-01',
          '--type',
          'all',
          '--execute',
          '--confirm',
          phrase ?? '',
          ...shared,
        ],
        io,
      ),
    ).rejects.toThrow(/Refusing to delete/);
    io.out = '';
    await runCli(['status', ...shared], io);
    expect(io.out).toContain('eligible:');
    expect(io.out).not.toContain('deleted: 1');
  });

  it('rejects a delete without a date filter and rejects disabling protection', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'fb-cleaner-cli-'));
    const io = captureIo();
    const shared = ['--home', home, '--log-level', 'silent'];
    await expect(runCli(['delete', '--type', 'all', ...shared], io)).rejects.toThrow(/date filter/);
    await expect(
      runCli(['scan', '--before', '2017-01-01', '--no-respect-protection', ...shared], io),
    ).rejects.toThrow(/cannot be disabled/);
  });

  it('shows help without throwing', async () => {
    const program: Command = createProgram(captureIo());
    await expect(program.parseAsync(['node', 'fb-cleaner', '--help'])).rejects.toMatchObject({
      exitCode: 0,
    });
  });
});
