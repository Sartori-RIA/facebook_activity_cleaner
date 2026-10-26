import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { z } from 'zod';
import type { AppContext } from '../cli/context.js';
import {
  AppError,
  FacebookUiNotValidatedError,
  ProtectionOverrideError,
} from '../domain/errors.js';
import { isFixedReviewYear } from '../review/fixed-years.js';
import { UiError } from './ui-error.js';
import {
  addAlbum,
  addKeyword,
  addPerson,
  addPost,
  decideActivity,
  exportActivities,
  listActivityCards,
  overview,
  previewDeletion,
  saveAccount,
  resumeActivities,
  scanActivities,
} from './operations.js';

const dateFields = {
  before: z.string().optional(),
  after: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  all: z.boolean().optional(),
  disableProtection: z.boolean().optional(),
};

const scanSchema = z.object({
  ...dateFields,
  type: z.string().optional(),
  fixturePath: z.string().optional(),
  fixtureHtml: z.string().optional(),
  useSample: z.boolean().optional(),
});

const deleteSchema = z.object({
  ...dateFields,
  type: z.string().optional(),
  limit: z.number().int().optional(),
});

const accountSchema = z.object({
  name: z.string().max(200),
  profileUrl: z.string().max(500).optional(),
  disableProtection: z.boolean().optional(),
});

const personSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  profileUrl: z.string().optional(),
  profileId: z.string().optional(),
  disableProtection: z.boolean().optional(),
});

const keywordSchema = z.object({
  keyword: z.string().min(1),
  disableProtection: z.boolean().optional(),
});

const albumSchema = z.object({
  url: z.string().optional(),
  name: z.string().optional(),
  disableProtection: z.boolean().optional(),
});

const postSchema = z.object({
  url: z.string().min(1),
  disableProtection: z.boolean().optional(),
});

const reviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(['protect', 'approve_deletion', 'skip']),
  note: z.string().optional(),
  disableProtection: z.boolean().optional(),
});

function rejectDisabledProtection(body: { disableProtection?: boolean }): void {
  if (body.disableProtection) {
    throw new UiError('protection_locked', 'As regras de proteção não podem ser desligadas.');
  }
}

function dateRequest(body: z.infer<typeof scanSchema>) {
  return {
    ...(body.before ? { before: body.before } : {}),
    ...(body.after ? { after: body.after } : {}),
    ...(body.from ? { from: body.from } : {}),
    ...(body.to ? { to: body.to } : {}),
    ...(body.year !== undefined ? { year: String(body.year) } : {}),
    ...(body.all ? { all: true } : {}),
  };
}

async function readJson(req: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new UiError('body_too_large', 'O pedido é grande demais.');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new UiError('invalid_json', 'O pedido não está em JSON.');
  }
}

function reviewYear(raw: string | null): number {
  const year = Number(raw);
  if (!raw || !/^\d{4}$/.test(raw) || !isFixedReviewYear(year)) {
    throw new UiError('year_required', 'Choose a four-digit year for review.');
  }
  return year;
}

function errorCode(error: AppError): string {
  if (error instanceof UiError) {
    return error.code;
  }
  if (error instanceof ProtectionOverrideError) {
    return 'protection_override';
  }
  if (error instanceof FacebookUiNotValidatedError) {
    return 'live_unavailable';
  }
  if (error.message.startsWith('Refusing to run without a date filter')) {
    return 'date_required';
  }
  if (error.message.startsWith('Do not combine --all')) {
    return 'date_conflict';
  }
  if (error.message.startsWith('These date flags do not overlap')) {
    return 'date_empty';
  }
  return 'generic';
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

function isLoopback(host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  const hostname = host.replace(/:\d+$/, '');
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveStatic(staticDir: string, urlPath: string, res: ServerResponse): void {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const resolved = path.resolve(staticDir, `.${requested}`);
  const root = path.resolve(staticDir);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    sendJson(res, 403, { error: 'Caminho recusado.' });
    return;
  }
  const file =
    existsSync(resolved) && statSync(resolved).isFile() ? resolved : path.join(root, 'index.html');
  if (!existsSync(file)) {
    sendJson(res, 404, { error: 'A interface ainda não foi compilada. Rode npm run ui.' });
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(res);
}

export interface UiServer {
  url: string;
  close(): Promise<void>;
}

export function startUiServer(
  ctx: AppContext,
  options: { port: number; staticDir?: string; devOrigins?: string[] },
): Promise<UiServer> {
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const run = chain.then(work, work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const server = createServer((req, res) => {
    void exclusive(async () => {
      try {
        if (!isLoopback(req.headers.host)) {
          sendJson(res, 403, { error: 'A interface só responde neste computador.' });
          return;
        }
        const origin = req.headers.origin;
        const ownOrigins = [`http://127.0.0.1:${options.port}`, `http://localhost:${options.port}`];
        const allowed = new Set([...ownOrigins, ...(options.devOrigins ?? [])]);
        if (origin && !allowed.has(origin)) {
          sendJson(res, 403, { error: 'Origem recusada.' });
          return;
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'access-control-allow-origin': origin ?? ownOrigins[0],
            'access-control-allow-headers': 'content-type, x-fb-cleaner',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            vary: 'origin',
          });
          res.end();
          return;
        }
        if (origin) {
          res.setHeader('access-control-allow-origin', origin);
          res.setHeader('vary', 'origin');
        }
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${options.port}`);
        if (!url.pathname.startsWith('/api/')) {
          if (options.staticDir) {
            serveStatic(options.staticDir, url.pathname, res);
            return;
          }
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        if (req.method !== 'GET' && req.headers['x-fb-cleaner'] !== '1') {
          sendJson(res, 403, { error: 'Pedido recusado.' });
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/overview') {
          sendJson(res, 200, overview(ctx));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/activities') {
          const year = reviewYear(url.searchParams.get('year'));
          sendJson(res, 200, { activities: listActivityCards(ctx, year) });
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/export') {
          if (req.headers['x-fb-cleaner'] !== '1') {
            sendJson(res, 403, { error: 'Pedido recusado.' });
            return;
          }
          const exported = exportActivities(ctx, url.searchParams.get('format') ?? 'json');
          res.writeHead(200, {
            'content-type': exported.contentType,
            'content-disposition': `attachment; filename="${exported.filename}"`,
            'cache-control': 'no-store',
          });
          res.end(exported.body);
          return;
        }
        if (req.method !== 'POST') {
          sendJson(res, 404, { error: 'Não encontrado.' });
          return;
        }
        const body = await readJson(req, url.pathname === '/api/scan' ? 12_000_000 : 1_000_000);
        if (url.pathname === '/api/account') {
          const parsed = accountSchema.parse(body);
          rejectDisabledProtection(parsed);
          const account = saveAccount(ctx, {
            name: parsed.name,
            profileUrl: parsed.profileUrl?.trim() ? parsed.profileUrl.trim() : null,
          });
          sendJson(res, 200, { account });
          return;
        }
        if (url.pathname === '/api/protection/person') {
          const parsed = personSchema.parse(body);
          rejectDisabledProtection(parsed);
          const person = addPerson(ctx, {
            name: parsed.name,
            relationship: parsed.relationship ?? null,
            profileUrl: parsed.profileUrl?.trim() ? parsed.profileUrl.trim() : null,
            profileId: parsed.profileId?.trim() ? parsed.profileId.trim() : null,
          });
          sendJson(res, 200, { id: person.id, name: person.name });
          return;
        }
        if (url.pathname === '/api/protection/keyword') {
          const parsed = keywordSchema.parse(body);
          rejectDisabledProtection(parsed);
          addKeyword(ctx, parsed.keyword);
          sendJson(res, 200, { ok: true });
          return;
        }
        if (url.pathname === '/api/protection/album') {
          const parsed = albumSchema.parse(body);
          rejectDisabledProtection(parsed);
          addAlbum(ctx, { url: parsed.url?.trim() || null, name: parsed.name?.trim() || null });
          sendJson(res, 200, { ok: true });
          return;
        }
        if (url.pathname === '/api/protection/post') {
          const parsed = postSchema.parse(body);
          rejectDisabledProtection(parsed);
          addPost(ctx, parsed.url);
          sendJson(res, 200, { ok: true });
          return;
        }
        if (url.pathname === '/api/scan') {
          const parsed = scanSchema.parse(body);
          rejectDisabledProtection(parsed);
          sendJson(
            res,
            200,
            await scanActivities(ctx, {
              ...dateRequest(parsed),
              ...(parsed.type ? { type: parsed.type } : {}),
              ...(parsed.fixturePath ? { fixturePath: parsed.fixturePath } : {}),
              ...(parsed.fixtureHtml !== undefined ? { fixtureHtml: parsed.fixtureHtml } : {}),
              ...(parsed.useSample ? { useSample: true } : {}),
            }),
          );
          return;
        }
        if (url.pathname === '/api/resume') {
          sendJson(res, 200, await resumeActivities(ctx));
          return;
        }
        if (url.pathname === '/api/review') {
          const parsed = reviewSchema.parse(body);
          rejectDisabledProtection(parsed);
          sendJson(
            res,
            200,
            decideActivity(ctx, {
              id: parsed.id,
              decision: parsed.decision,
              note: parsed.note ?? null,
            }),
          );
          return;
        }
        if (url.pathname === '/api/delete/preview') {
          const parsed = deleteSchema.parse(body);
          rejectDisabledProtection(parsed);
          sendJson(
            res,
            200,
            await previewDeletion(ctx, {
              ...dateRequest(parsed),
              type: parsed.type,
              limit: parsed.limit,
            }),
          );
          return;
        }
        sendJson(res, 404, { error: 'Não encontrado.' });
      } catch (error) {
        if (res.headersSent) {
          return;
        }
        if (error instanceof z.ZodError) {
          sendJson(res, 400, {
            error: 'Algum campo do formulário está inválido.',
            code: 'invalid_form',
          });
          return;
        }
        if (error instanceof AppError) {
          sendJson(res, error.exitCode === 1 ? 500 : 400, {
            error: error.message,
            code: errorCode(error),
          });
          return;
        }
        sendJson(res, 500, { error: 'Não consegui concluir esta ação.', code: 'generic' });
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
