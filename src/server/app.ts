// Hono API（Bun 本地服务与 Cloudflare Worker 共用）
import { Hono, type Context, type Env } from 'hono';
import { cors } from 'hono/cors';
import type { HealthInfo, HitEvent, OnlineInfo, Snapshot, StatsSummary } from '../shared/types.ts';
import { contentDisposition, csvFilename, problemRowsToCsv, totalRowsToCsv } from './csv.ts';
import { handleMcpRequest } from './mcp.ts';
import { defaultMcpDataSource, type McpDataSource } from './mcp-tools.ts';
import { errMsg, getConfig, getSingleBoard, getSnapshot } from './upstream.ts';
import { clampDays, parseHit, type HitContext } from './visits.ts';

export interface StatsBackend {
  hit(evt: HitEvent, ctx: HitContext): Promise<void>;
  summary(days: number, online: number): Promise<StatsSummary>;
}

export interface ApiOptions<E extends Env> {
  runtime: HealthInfo['runtime'];
  pushIntervalMs: number | null;
  snapshot?: (c: Context<E>, force: boolean) => Promise<{ snap: Snapshot; via: string }>;
  stats?: (c: Context<E>) => { backend: StatsBackend; key: string; ctx: HitContext } | null;
  online?: (c: Context<E>) => Promise<OnlineInfo>;
  mcpSource?: McpDataSource | ((c: Context<E>) => McpDataSource);
}

export const isForce = (c: Context) => c.req.query('force') === '1' || c.req.query('refresh') === '1';

function safeEqual(a: string, b: string) {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function statsKeyOf(c: Context) {
  const auth = c.req.header('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : c.req.query('key') || '';
}

export function createApi<E extends Env = Env>(opts: ApiOptions<E>) {
  const api = new Hono<E>().basePath('/api');

  api.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type', 'authorization', 'mcp-protocol-version', 'mcp-session-id', 'mcp-method', 'mcp-name', 'last-event-id'],
      exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
      maxAge: 86400,
    }),
  );
  api.use('*', async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  api.all('/mcp', (c) => {
    const src = typeof opts.mcpSource === 'function' ? opts.mcpSource(c) : (opts.mcpSource ?? defaultMcpDataSource);
    return handleMcpRequest(c.req.raw, src);
  });

  api.get('/health', (c) => {
    const cfg = getConfig();
    return c.json<HealthInfo>({
      ok: true,
      contestSlug: cfg.contestSlug,
      contestId: cfg.contestId,
      cacheTtlMs: cfg.ttlMs,
      at: new Date().toISOString(),
      runtime: opts.runtime,
      push: opts.pushIntervalMs ? { intervalMs: opts.pushIntervalMs } : null,
      stats: Boolean(opts.stats?.(c)),
    });
  });

  api.get('/snapshot', async (c) => {
    const force = isForce(c);
    const { snap, via } = opts.snapshot ? await opts.snapshot(c, force) : { snap: await getSnapshot({ force }), via: 'upstream' };
    if (!snap.total.rows.length && snap.problems.every((p) => !p.rows.length)) {
      return c.json({ error: 'upstream failure', detail: snap.total.error || snap.problems.map((p) => p.error).find(Boolean) || 'empty' }, 502);
    }
    c.header('X-Source', via);
    return c.json(snap);
  });

  api.get('/board/:id', async (c) => {
    const id = c.req.param('id').trim().toLowerCase();
    const force = isForce(c);
    if (opts.snapshot) {
      const { snap } = await opts.snapshot(c, force);
      if (id === 'total') return c.json({ kind: 'total', contest: snap.contest, total: snap.total, problems: snap.problems });
      const hit = snap.problems.find((p) => p.meta.slug === id || p.meta.id.toLowerCase() === id);
      if (!hit) return c.json({ error: 'board not found' }, 404);
      return c.json({ kind: 'problem', contest: snap.contest, problem: hit });
    }
    const res = await getSingleBoard(id, { force });
    if (!res) return c.json({ error: 'board not found' }, 404);
    return c.json(res);
  });

  api.get('/export.csv', async (c) => {
    const id = (c.req.query('board') || 'total').trim().toLowerCase();
    const force = isForce(c);
    if (opts.snapshot) {
      const { snap } = await opts.snapshot(c, force);
      if (id === 'total') {
        const name = csvFilename('total');
        return c.body(totalRowsToCsv(snap.total.rows, snap.problems), 200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': contentDisposition(name),
        });
      }
      const hit = snap.problems.find((p) => p.meta.slug === id || p.meta.id.toLowerCase() === id);
      if (!hit) return c.json({ error: 'board not found' }, 404);
      const name = csvFilename(hit.meta.slug);
      return c.body(problemRowsToCsv(hit), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': contentDisposition(name),
      });
    }
    const res = await getSingleBoard(id, { force });
    if (!res) return c.json({ error: 'board not found' }, 404);
    const csv = res.kind === 'total' ? totalRowsToCsv(res.total.rows, res.problems) : problemRowsToCsv(res.problem);
    const name = csvFilename(res.kind === 'total' ? 'total' : res.problem.meta.slug);
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(name),
    });
  });

  api.get('/online', async (c) => {
    if (!opts.online) return c.json<OnlineInfo>({ sockets: 0, lastPush: null, intervalMs: opts.pushIntervalMs ?? 0 });
    return c.json(await opts.online(c));
  });

  api.post('/hit', async (c) => {
    const s = opts.stats?.(c);
    if (!s) return c.body(null, 204);
    let body: unknown;
    try {
      body = JSON.parse(await c.req.text());
    } catch {
      return c.json({ ok: false }, 400);
    }
    const evt = parseHit(body);
    if (!evt) return c.json({ ok: false }, 400);
    await s.backend.hit(evt, s.ctx);
    return c.body(null, 204);
  });

  api.get('/stats', async (c) => {
    const s = opts.stats?.(c);
    if (!s || !safeEqual(statsKeyOf(c), s.key)) return c.json({ error: 'not found' }, 404);
    const online = opts.online ? ((await opts.online(c).catch(() => null))?.sockets ?? 0) : 0;
    return c.json(await s.backend.summary(clampDays(c.req.query('days')), online));
  });

  api.notFound((c) => c.json({ error: 'unknown endpoint' }, 404));
  api.onError((err, c) => {
    console.error('[api]', c.req.path, err);
    return c.json({ error: 'upstream failure', detail: errMsg(err) }, 502);
  });

  return api;
}
