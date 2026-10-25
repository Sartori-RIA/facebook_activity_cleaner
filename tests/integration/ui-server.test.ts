import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openContext } from '../../src/cli/context.js';
import { startUiServer, type UiServer } from '../../src/server/http.js';

const homes: string[] = [];
const servers: UiServer[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.close();
  }
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

async function start() {
  const home = mkdtempSync(path.join(tmpdir(), 'fb-cleaner-ui-'));
  homes.push(home);
  const ctx = openContext({ home, logLevel: 'silent' });
  const ui = await startUiServer(ctx, { port: 0 });
  servers.push({
    url: ui.url,
    close: async () => {
      await ui.close();
      ctx.close();
    },
  });
  return ui.url;
}

async function call(
  url: string,
  pathname: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${url}${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('local interface', () => {
  it('scans a chosen html file and refuses a web address', async () => {
    const url = await start();
    const html =
      '<li data-fixture-activity="true" data-type="post" data-date="2015-06-01" data-ownership="owned" data-url="https://www.facebook.com/fixture/posts/upload" data-text="Uploaded note"></li>';
    const scan = await call(
      url,
      '/api/scan',
      { before: '2017-01-01', fixtureHtml: html, useSample: true },
      { 'x-fb-cleaner': '1' },
    );
    expect(scan.status).toBe(200);
    const body = (await scan.json()) as { inserted: number };
    expect(body.inserted).toBe(1);
    const activities = await call(url, '/api/activities');
    const cards = (await activities.json()) as { activities: Array<{ text: string | null }> };
    expect(cards.activities.some((item) => item.text === 'Uploaded note')).toBe(true);
    expect(cards.activities.some((item) => item.text === 'Quarterly planning notes')).toBe(false);

    const remote = await call(
      url,
      '/api/scan',
      { before: '2017-01-01', fixtureHtml: 'https://www.facebook.com/me' },
      { 'x-fb-cleaner': '1' },
    );
    expect(remote.status).toBe(400);
    expect(((await remote.json()) as { code: string }).code).toBe('file_unreadable');

    const address = await call(
      url,
      '/api/scan',
      { before: '2017-01-01', fixturePath: 'https://www.facebook.com/me' },
      { 'x-fb-cleaner': '1' },
    );
    expect(address.status).toBe(400);
    expect(((await address.json()) as { code: string }).code).toBe('remote_fixture');
  });

  it('reads an export longer than the old page limit', async () => {
    const url = await start();
    const section = (index: number) =>
      `<section><h2>Alex compartilhou um post.</h2><div>Nota ${index}</div><footer><div>jan 02, 2015 1:00:00 da manhã</div></footer></section>`;
    const html = Array.from({ length: 2001 }, (_, index) => section(index)).join('');
    const scan = await call(
      url,
      '/api/scan',
      { year: '2015', fixtureHtml: html },
      { 'x-fb-cleaner': '1' },
    );
    expect(scan.status).toBe(200);
    const body = (await scan.json()) as { seen: number; stopReason: string | null };
    expect(body.seen).toBe(2001);
    expect(body.stopReason).toBe('end');
    const again = await call(
      url,
      '/api/scan',
      { year: '2015', fixtureHtml: html },
      { 'x-fb-cleaner': '1' },
    );
    const repeated = (await again.json()) as {
      seen: number;
      inserted: number;
      stopReason: string | null;
    };
    expect(repeated.seen).toBe(2001);
    expect(repeated.inserted).toBe(0);
    expect(repeated.stopReason).toBe('end');
  });

  it('stores the account profile locally and refuses a session or another site', async () => {
    const url = await start();
    const empty = await call(url, '/api/overview');
    expect(((await empty.json()) as { account: null }).account).toBeNull();

    const saved = await call(
      url,
      '/api/account',
      { name: 'Alex', profileUrl: 'https://www.facebook.com/alex?fbclid=1' },
      { 'x-fb-cleaner': '1' },
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { account: { name: string; profileUrl: string } };
    expect(body.account.name).toBe('Alex');
    expect(body.account.profileUrl).not.toContain('fbclid');

    const cookie = await call(
      url,
      '/api/account',
      { name: 'Alex', profileUrl: 'https://www.facebook.com/alex?c_user=1' },
      { 'x-fb-cleaner': '1' },
    );
    expect(cookie.status).toBe(400);

    const otherSite = await call(
      url,
      '/api/account',
      { name: 'Alex', profileUrl: 'https://example.com/alex' },
      { 'x-fb-cleaner': '1' },
    );
    expect(otherSite.status).toBe(400);
  });

  it('protects a person, scans the sample, and simulates without deleting', async () => {
    const url = await start();
    const refused = await call(url, '/api/protection/person', { name: 'Natanaiah' });
    expect(refused.status).toBe(403);

    const person = await call(
      url,
      '/api/protection/person',
      { name: 'Natanaiah', relationship: 'cônjuge' },
      {
        'x-fb-cleaner': '1',
      },
    );
    expect(person.status).toBe(200);

    const blocked = await call(
      url,
      '/api/scan',
      { before: '2017-01-01', useSample: true, disableProtection: true },
      { 'x-fb-cleaner': '1' },
    );
    expect(blocked.status).toBe(400);
    const blockedBody = (await blocked.json()) as { error: string };
    expect(blockedBody.error).toMatch(/não podem ser desligadas/);

    const foreign = await call(
      url,
      '/api/scan',
      { before: '2017-01-01', useSample: true },
      { 'x-fb-cleaner': '1', origin: 'http://evil.example' },
    );
    expect(foreign.status).toBe(403);

    const scan = await call(
      url,
      '/api/scan',
      { before: '2017-01-01', useSample: true },
      { 'x-fb-cleaner': '1' },
    );
    expect(scan.status).toBe(200);

    const preview = await call(
      url,
      '/api/delete/preview',
      { before: '2017-01-01', type: 'all' },
      { 'x-fb-cleaner': '1' },
    );
    expect(preview.status).toBe(200);
    const body = (await preview.json()) as {
      nothingDeleted: boolean;
      eligible: Array<{ text: string | null; status: string }>;
    };
    expect(body.nothingDeleted).toBe(true);
    expect(body.eligible.map((item) => item.text).sort()).toEqual([
      'Quarterly planning notes',
      'Sounds good',
    ]);
    expect(body.eligible.every((item) => item.status !== 'deleted')).toBe(true);

    const execute = await call(
      url,
      '/api/delete/execute',
      { before: '2017-01-01', confirm: 'DELETE 2 ACTIVITIES' },
      { 'x-fb-cleaner': '1' },
    );
    expect(execute.status).toBe(404);

    const activities = await call(url, '/api/activities');
    const cards = (await activities.json()) as {
      activities: Array<{ text: string | null; group: string; status: string }>;
    };
    expect(cards.activities.find((item) => item.text === 'Natal com a família')?.group).toBe(
      'protected',
    );
    expect(cards.activities.find((item) => item.text === 'See you there')?.group).toBe('protected');
    expect(cards.activities.every((item) => item.status !== 'deleted')).toBe(true);
  });
});
