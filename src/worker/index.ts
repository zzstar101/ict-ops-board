// Cloudflare Worker：静态资源（dist/client）+ 同源 API（Hono）+ 推送中枢 / 访问统计（Durable Objects）
import { DurableObject } from 'cloudflare:workers';
import { Hono, type MiddlewareHandler } from 'hono';
import { createApi, isForce } from '../server/app.ts';
import { configure, errMsg, getConfig, getSnapshot } from '../server/upstream.ts';
import type { HitContext } from '../server/visits.ts';
import { VisitStats, type KV } from '../server/visits.ts';
import type { HitEvent, OnlineInfo, StatsSummary } from '../shared/types.ts';

export type Env = Cloudflare.Env & {
  STATS_KEY?: string;
  CACHE_TTL_MS?: string;
  CONTEST_SLUG?: string;
  CONTEST_ID?: string;
  MAX_PROBLEM_PAGES?: string;
};

type HonoEnv = { Bindings: Env };

const TTL_SECONDS = 30;
const STALE_SECONDS = 300;
const CACHE_VERSION = '1';
const PUSH_INTERVAL_MS = 30_000;
const HUB_MAX_AGE_MS = PUSH_INTERVAL_MS * 3;

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const hubOf = (env: Env) => env.BOARD_HUB.get(env.BOARD_HUB.idFromName(`ict:${getConfig().contestSlug}`));
const statsOf = (env: Env) => env.BOARD_STATS.get(env.BOARD_STATS.idFromName(`ict:${getConfig().contestSlug}`));

export class BoardHub extends DurableObject<Env> {
  private gz: ArrayBuffer | null = null;
  private at = 0;
  private lastPush: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    configure({
      contestSlug: env.CONTEST_SLUG,
      contestId: env.CONTEST_ID,
      ttlMs: env.CACHE_TTL_MS,
      maxProblemPages: env.MAX_PROBLEM_PAGES,
    });
    const kv = ctx.storage.kv;
    this.gz = kv.get<ArrayBuffer>('gz') ?? null;
    this.at = kv.get<number>('at') ?? 0;
    this.lastPush = kv.get<number>('lastPush') ?? null;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return Response.json({ error: 'expected websocket' }, { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const fresh = this.gz && Date.now() - this.at < HUB_MAX_AGE_MS;
    if (fresh) server.send(this.gz!);
    await this.arm(fresh && Date.now() - this.at < PUSH_INTERVAL_MS ? PUSH_INTERVAL_MS : 300);
    return new Response(null, { status: 101, webSocket: client });
  }

  async latest(): Promise<{ gz: ArrayBuffer; at: number } | null> {
    return this.gz ? { gz: this.gz, at: this.at } : null;
  }

  async online(): Promise<OnlineInfo> {
    return { sockets: this.ctx.getWebSockets().length, lastPush: this.lastPush, intervalMs: PUSH_INTERVAL_MS };
  }

  private async arm(delay: number) {
    const cur = await this.ctx.storage.getAlarm();
    if (cur == null) await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  override async alarm() {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) return;
    try {
      const snap = await getSnapshot({ force: true });
      const text = JSON.stringify({ ...snap, push: { intervalMs: PUSH_INTERVAL_MS, clients: sockets.length } });
      this.gz = await gzip(text);
      this.at = Date.parse(snap.generatedAt);
      this.lastPush = Date.now();
      const kv = this.ctx.storage.kv;
      kv.put('gz', this.gz);
      kv.put('at', this.at);
      kv.put('lastPush', this.lastPush);
      for (const ws of sockets) {
        try {
          ws.send(this.gz);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.warn('[hub] upstream failed:', errMsg(err));
    }
    if (this.ctx.getWebSockets().length > 0) await this.ctx.storage.setAlarm(Date.now() + PUSH_INTERVAL_MS);
  }

  override async webSocketMessage() {}

  override async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* ignore */
    }
  }
}

export class BoardStats extends DurableObject<Env> {
  private visits: VisitStats;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const kv: KV = {
      get: async <T>(k: string) => ctx.storage.kv.get<T>(k),
      put: async (k, v) => ctx.storage.kv.put(k, v),
    };
    this.visits = new VisitStats(kv);
  }

  async hit(evt: HitEvent, hc: HitContext): Promise<void> {
    await this.visits.hit(evt, hc);
  }

  async summary(days: number, online: number): Promise<StatsSummary> {
    return this.visits.summary(days, online);
  }
}

const edgeCache =
  (ttlSeconds = TTL_SECONDS, staleSeconds = STALE_SECONDS): MiddlewareHandler<HonoEnv> =>
  async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const u = new URL(c.req.url);
    u.searchParams.delete('force');
    u.searchParams.delete('refresh');
    u.searchParams.set('_v', CACHE_VERSION);
    u.searchParams.sort();
    const key = new Request(u.toString(), { method: 'GET' });
    const cache = caches.default;

    if (!isForce(c)) {
      const hit = await cache.match(key);
      if (hit) {
        const age = Math.round((Date.now() - Number(hit.headers.get('x-data-at') || 0)) / 1000);
        if (age < staleSeconds) {
          if (age >= ttlSeconds) {
            const refreshUrl = new URL(u);
            refreshUrl.searchParams.set('force', '1');
            c.executionCtx.waitUntil(
              Promise.resolve(app.fetch(new Request(refreshUrl, { headers: c.req.raw.headers }), c.env, c.executionCtx)).then(
                () => undefined,
                () => undefined,
              ),
            );
          }
          const res = new Response(hit.body, hit);
          res.headers.set('X-Cache', age < ttlSeconds ? 'HIT' : 'STALE');
          res.headers.set('X-Data-Age', String(age));
          res.headers.set('Cache-Control', 'no-store');
          res.headers.delete('x-data-at');
          return res;
        }
      }
    }

    await next();
    if (c.res.status === 200) {
      const copy = new Response(c.res.clone().body, c.res);
      copy.headers.set('x-data-at', String(Date.now()));
      copy.headers.set('Cache-Control', `public, max-age=${staleSeconds}`);
      c.executionCtx.waitUntil(cache.put(key, copy));
      c.res.headers.set('X-Cache', isForce(c) ? 'BYPASS' : 'MISS');
    }
  };

const api = createApi<HonoEnv>({
  runtime: 'cloudflare-worker',
  pushIntervalMs: PUSH_INTERVAL_MS,
  online: (c) => hubOf(c.env).online(),
  stats: (c) => {
    if (!c.env.STATS_KEY) return null;
    const stub = statsOf(c.env);
    const cf = (c.req.raw as Request & { cf?: { country?: string } }).cf;
    return {
      key: c.env.STATS_KEY,
      backend: { hit: (e, h) => stub.hit(e, h), summary: (d, o) => stub.summary(d, o) },
      ctx: {
        ua: c.req.header('user-agent') || '',
        ip: c.req.header('cf-connecting-ip') || '',
        geo: cf?.country || '未知',
      },
    };
  },
});

const app = new Hono<HonoEnv>();

app.use('*', async (c, next) => {
  configure({
    contestSlug: c.env.CONTEST_SLUG,
    contestId: c.env.CONTEST_ID,
    ttlMs: c.env.CACHE_TTL_MS,
    maxProblemPages: c.env.MAX_PROBLEM_PAGES,
  });
  await next();
});

app.get('/api/stream', (c) => hubOf(c.env).fetch(c.req.raw));
app.get('/api/snapshot', edgeCache());
app.get('/api/board/:id', edgeCache());
app.route('/', api);
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app satisfies ExportedHandler<Env>;
