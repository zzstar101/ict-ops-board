// 上游 CANNJudge 公开接口抓取 + 字段归一化 + 跨题关联 + TTL/stale-while-error 缓存
// （Bun 本地服务、Cloudflare Worker、GitHub Pages 静态构建共用）。
//
// 公开接口（免登录，2026-11-25 验证）：
//   公共小组  GET /api/groups/name/public
//   赛事列表  GET /api/contests/group/:groupId
//   赛事详情  GET /api/contests/:contestId
//   赛事汇总  GET /api/submissions/contest/:contestId/stats?group=summary
//   题目列表  GET /api/problems/contest/:contestId
//   单题汇总  GET /api/submissions/contest/:contestId/stats?group=problem
//   赛事总榜  GET /api/submissions/contest/:contestId/stats
//   单题榜单  GET /api/problems/:problemId/ranking?page=P&size=100
import type {
  ContestMeta,
  ProblemBoard,
  ProblemMeta,
  ProblemRow,
  Snapshot,
  TeamProblemCell,
  TestcaseMetric,
  TotalBoard,
  TotalRow,
  VisibleTestcase,
} from '../shared/types.ts';

const ORIGIN = 'https://cannjudge.cn';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DEFAULT_CONTEST_SLUG = 'ictcompetition';
const DEFAULT_CONTEST_ID = '6a9e2d04bf41025d60f21804';
const PAGE_SIZE = 100;

export interface UpstreamConfig {
  contestSlug: string;
  contestId: string;
  /** 缓存 TTL（毫秒） */
  ttlMs: number;
  /** 单次请求超时（毫秒） */
  timeoutMs: number;
  /** 单题最多抓取页数（每页 100 条；默认 12 页覆盖最多 1,200 支队伍） */
  maxProblemPages: number;
  /** 并行抓取并发度 */
  concurrency: number;
}

const envOf = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const numOr = (v: unknown, d: number) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const strOr = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim() : d);

const config: UpstreamConfig = {
  contestSlug: strOr(envOf().CONTEST_SLUG, DEFAULT_CONTEST_SLUG),
  contestId: strOr(envOf().CONTEST_ID, DEFAULT_CONTEST_ID),
  ttlMs: numOr(envOf().CACHE_TTL_MS, 25_000),
  timeoutMs: numOr(envOf().UPSTREAM_TIMEOUT_MS, 15_000),
  maxProblemPages: numOr(envOf().MAX_PROBLEM_PAGES, 12),
  concurrency: numOr(envOf().UPSTREAM_CONCURRENCY, 8),
};

export function configure(opts: Partial<Record<keyof UpstreamConfig, unknown>>) {
  if (opts.contestSlug != null) config.contestSlug = strOr(opts.contestSlug, config.contestSlug);
  if (opts.contestId != null) config.contestId = strOr(opts.contestId, config.contestId);
  if (opts.ttlMs != null) config.ttlMs = numOr(opts.ttlMs, config.ttlMs);
  if (opts.timeoutMs != null) config.timeoutMs = numOr(opts.timeoutMs, config.timeoutMs);
  if (opts.maxProblemPages != null) config.maxProblemPages = numOr(opts.maxProblemPages, config.maxProblemPages);
  if (opts.concurrency != null) config.concurrency = Math.max(1, numOr(opts.concurrency, config.concurrency));
}

export const getConfig = (): Readonly<UpstreamConfig> => config;

export type FetchFn = (input: URL | string | Request, init?: RequestInit) => Promise<Response>;
let fetchImpl: FetchFn = (input, init) => fetch(input, init);
export function setFetch(f: FetchFn) {
  fetchImpl = f;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function getJson<T = any>(path: string, params?: Record<string, string | number>, tries = 3): Promise<T> {
  const url = new URL(ORIGIN + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchImpl(url, {
        headers: {
          'User-Agent': UA,
          Referer: `${ORIGIN}/public/${config.contestSlug}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw new Error(`${path} failed: ${errMsg(lastErr)}`);
}

/** 限制并发的异步 map */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 根据 slug 解析 contestId（配置已有 24 位 ObjectId 时直接使用） */
async function resolveContestId(): Promise<string> {
  if (/^[0-9a-fA-F]{24}$/.test(config.contestId)) return config.contestId;
  const group = await getJson<{ _id?: string; id?: string }>('/api/groups/name/public');
  const groupId = str(group?._id || group?.id);
  if (!groupId) throw new Error('public group not found');
  const contests = await getJson<any[]>(`/api/contests/group/${groupId}`);
  const hit = (Array.isArray(contests) ? contests : []).find(
    (c) => str(c?.name).toLowerCase() === config.contestSlug.toLowerCase(),
  );
  const id = str(hit?._id || hit?.id);
  if (!id) throw new Error(`contest "${config.contestSlug}" not found`);
  return id;
}

function teamIdentityOf(rawTeam: any): { teamKey: string; teamId: string; teamObjectId: string; displayId: number | null; name: string } {
  const teamObj = rawTeam && typeof rawTeam === 'object' ? rawTeam : {};
  const teamId = str(teamObj.team_id);
  const teamObjectId = str(teamObj._id || teamObj.id);
  const displayId = num(teamObj.ID);
  const name = str(teamObj.team_name) || (displayId != null ? `Team #${displayId}` : '未命名队伍');
  const teamKey = teamId || teamObjectId || (displayId != null ? `id:${displayId}` : name);
  return { teamKey, teamId, teamObjectId, displayId, name };
}

/** 竞赛排名（同分并列：1, 1, 3…；总榜同分时按通过题数降序、提交数升序稳定排） */
export function rankTotalRows(rows: TotalRow[]): TotalRow[] {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || b.passCount - a.passCount || a.submissionCount - b.submissionCount || a.name.localeCompare(b.name, 'zh-CN'),
  );
  let prevScore: number | null = null;
  let prevRank = 0;
  sorted.forEach((r, i) => {
    if (i > 0 && Math.abs(r.score - prevScore!) < 1e-6) r.rank = prevRank;
    else prevRank = r.rank = i + 1;
    prevScore = r.score;
  });
  return sorted;
}

export function rankProblemRows(rows: ProblemRow[]): ProblemRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score;
    const ta = a.submittedAt ? Date.parse(a.submittedAt) : Number.MAX_SAFE_INTEGER;
    const tb = b.submittedAt ? Date.parse(b.submittedAt) : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  let prevScore: number | null = null;
  let prevRank = 0;
  sorted.forEach((r, i) => {
    if (i > 0 && Math.abs(r.score - prevScore!) < 1e-6) r.rank = prevRank;
    else prevRank = r.rank = i + 1;
    prevScore = r.score;
  });
  return sorted;
}

interface ContestBundle {
  contest: ContestMeta;
  problems: ProblemMeta[];
}

async function fetchContestBundle(): Promise<ContestBundle> {
  const contestId = await resolveContestId();
  const [detail, summary, rawProblems, rawProbStats] = await Promise.all([
    getJson<any>(`/api/contests/${contestId}`),
    getJson<any>(`/api/submissions/contest/${contestId}/stats`, { group: 'summary' }).catch(() => ({})),
    getJson<any[]>(`/api/problems/contest/${contestId}`),
    getJson<any[]>(`/api/submissions/contest/${contestId}/stats`, { group: 'problem' }).catch(() => []),
  ]);

  const slug = str(detail?.name) || config.contestSlug;
  const statByProb = new Map<string, any>();
  for (const s of Array.isArray(rawProbStats) ? rawProbStats : []) {
    const pid = str(s?.problem_id);
    if (pid) statByProb.set(pid, s);
  }

  const ordered = [...(Array.isArray(rawProblems) ? rawProblems : [])].sort((a, b) =>
    str(a?.title || a?.name).localeCompare(str(b?.title || b?.name), 'en', { sensitivity: 'base' }),
  );

  const problems: ProblemMeta[] = ordered.map((p) => {
    const id = str(p?._id || p?.id);
    const pSlug = str(p?.name || p?.canonical_name || id).toLowerCase();
    const title = str(p?.title || p?.name || id);
    const st = statByProb.get(id) ?? {};
    return {
      id,
      slug: pSlug,
      title,
      difficulty: Math.max(1, Math.round(num(p?.difficulty) ?? 1)),
      cannVersion: str(p?.cann_version),
      totalTestcases: Array.isArray(p?.testcases) ? p.testcases.length : 50,
      visibleTestcases: [],
      attemptCount: num(st.attemptCount) ?? 0,
      passCount: num(st.passUserCount ?? st.passCount) ?? 0,
      wrongCount: num(st.wrongCount) ?? 0,
      failCount: num(st.failCount) ?? 0,
      submissionCount: num(st.submissionCount) ?? 0,
      sourceUrl: `${ORIGIN}/public/${slug}/${pSlug}`,
    };
  });

  const contest: ContestMeta = {
    id: contestId,
    slug,
    title: str(detail?.title) || '第十一届华为ICT大赛｜昇腾AI算子开发赛道（决赛）',
    desc: str(detail?.desc),
    startTime: str(detail?.start_time),
    endTime: str(detail?.end_time),
    organizationMode: str(detail?.organization_mode) || 'huawei_team',
    scoringRule: str(detail?.scoring_rule) || 'difficulty_weighted',
    dailyLimit: num(detail?.effective_daily_limit ?? detail?.submission_daily_limit),
    visibleTestcaseCount: num(detail?.visible_testcase_count) ?? 5,
    participantCount: num(summary?.participantCount) ?? 0,
    submissionCount: num(summary?.submissionCount) ?? 0,
    problemCount: num(summary?.problemCount) ?? problems.length,
    sourceUrl: `${ORIGIN}/public/${slug}`,
  };

  return { contest, problems };
}

async function fetchRawTotalRows(contestId: string): Promise<{ rows: TotalRow[]; reportedTotal: number }> {
  const data = await getJson<any[]>(`/api/submissions/contest/${contestId}/stats`);
  const list = Array.isArray(data) ? data : [];
  const rows: TotalRow[] = list.map((item) => {
    const id = teamIdentityOf(item?.team);
    const teamId = id.teamId || str(item?.team_id);
    const teamObjectId = id.teamObjectId || str(item?.team_object_id);
    const teamKey = teamId || teamObjectId || id.teamKey;
    return {
      rank: 0,
      teamKey,
      teamId,
      teamObjectId,
      displayId: id.displayId,
      name: id.name,
      score: Math.round((num(item?.score) ?? 0) * 100) / 100,
      weightedScore: 0,
      leaderBonus: 0,
      leaderCount: 0,
      passCount: num(item?.passCount) ?? 0,
      attemptCount: num(item?.attemptCount) ?? 0,
      submissionCount: num(item?.submissionCount) ?? 0,
      latestSubmitAt: null,
      problems: {},
    };
  });
  return { rows: rankTotalRows(rows), reportedTotal: list.length };
}

interface ProblemRankingPayload {
  rows: ProblemRow[];
  visibleTestcases: VisibleTestcase[];
  totalTestcases: number;
  reportedTotal: number;
  truncated: boolean;
}

function parseVisibleTestcases(rawTestcases: unknown): VisibleTestcase[] {
  if (!Array.isArray(rawTestcases)) return [];
  const visible: VisibleTestcase[] = [];
  for (const tc of rawTestcases) {
    if (!tc || typeof tc !== 'object' || (tc as any).hidden) continue;
    const id = str((tc as any)._id || (tc as any).id);
    if (!id) continue;
    visible.push({
      id,
      index: visible.length + 1,
      caseId: num((tc as any).ID),
      tbest: num((tc as any).tbest),
    });
  }
  return visible;
}

function normalizeProblemRow(item: any, visibleTestcases: VisibleTestcase[]): ProblemRow {
  const id = teamIdentityOf(item?.team);
  const sub = item?.submitter || item?.user || {};
  const resultList = Array.isArray(item?.result) ? item.result : [];
  const byId = new Map<string, any>();
  for (const res of resultList) {
    const tid = str(res?.testcase_id);
    if (tid) byId.set(tid, res);
  }
  const testcases: TestcaseMetric[] = visibleTestcases.map((vc) => {
    const hit = byId.get(vc.id);
    const rawTime = num(hit?.time);
    const time = rawTime != null ? Math.round(rawTime * 1000) / 1000 : null;
    const ratio = rawTime != null && vc.tbest != null && vc.tbest > 0 ? Math.round((rawTime / vc.tbest) * 1000) / 1000 : null;
    const st = str(hit?.testcase_status) || 'Unknown';
    return st === 'Pass' ? { time, ratio } : { status: st, time, ratio };
  });
  const status = str(item?.status || item?.submission?.status) || 'Pass';
  const row: ProblemRow = {
    rank: num(item?.rank) ?? 0,
    teamKey: id.teamKey,
    displayId: id.displayId,
    name: id.name,
    submitter: str(sub?.nickname || sub?.group_nickname) || (sub?.ID != null ? `#${sub.ID}` : '—'),
    score: Math.round((num(item?.score) ?? 0) * 100) / 100,
    submittedAt: str(item?.create_time || item?.submission?.create_time) || null,
    testcases,
  };
  if (id.teamId && id.teamId !== id.teamKey) row.teamId = id.teamId;
  if (id.teamObjectId && id.teamObjectId !== id.teamKey) row.teamObjectId = id.teamObjectId;
  if (status !== 'Pass') row.status = status;
  return row;
}

async function fetchProblemRanking(problemId: string, maxPages = config.maxProblemPages): Promise<ProblemRankingPayload> {
  const first = await getJson<any>(`/api/problems/${encodeURIComponent(problemId)}/ranking`, {
    page: 1,
    size: PAGE_SIZE,
  });
  const visibleTestcases = parseVisibleTestcases(first?.testcases);
  const totalTestcases = num(first?.total_testcase_count) ?? (Array.isArray(first?.testcases) ? first.testcases.length : 50);
  const reportedTotal = num(first?.total) ?? (Array.isArray(first?.rows) ? first.rows.length : 0);
  const totalPages = Math.max(1, num(first?.pages) ?? Math.ceil(reportedTotal / PAGE_SIZE));
  const targetPages = Math.min(totalPages, Math.max(1, maxPages));

  const allRaw: any[] = Array.isArray(first?.rows) ? [...first.rows] : [];
  if (targetPages > 1) {
    const restPages = Array.from({ length: targetPages - 1 }, (_, i) => i + 2);
    const pages = await mapPool(restPages, Math.min(4, config.concurrency), (page) =>
      getJson<any>(`/api/problems/${encodeURIComponent(problemId)}/ranking`, { page, size: PAGE_SIZE }),
    );
    for (const p of pages) {
      if (Array.isArray(p?.rows)) allRaw.push(...p.rows);
    }
  }

  // 按 teamKey 去重（分页刷新期间可能出现边界行重复）
  const seen = new Set<string>();
  const normalized: ProblemRow[] = [];
  for (const item of allRaw) {
    const row = normalizeProblemRow(item, visibleTestcases);
    if (seen.has(row.teamKey)) continue;
    seen.add(row.teamKey);
    normalized.push(row);
  }

  return {
    rows: rankProblemRows(normalized),
    visibleTestcases,
    totalTestcases,
    reportedTotal,
    truncated: reportedTotal > normalized.length,
  };
}

// ---------------------------------------------------------------- TTL 缓存层

export interface Cached<T> {
  value: T;
  stale: boolean;
  error: string | null;
  at: number;
}

interface Entry<T> {
  at: number;
  promise: Promise<Cached<T>>;
}

const cache = new Map<string, Entry<any>>();
const lastGood = new Map<string, { value: any; at: number }>();

export function clearCache() {
  cache.clear();
  lastGood.clear();
}

export function cached<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<Cached<T>> {
  const hit = cache.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (hit && now - hit.at < ttl) return hit.promise;
  const entry: Entry<T> = { at: now, promise: null as unknown as Promise<Cached<T>> };
  entry.promise = loader().then(
    (value) => {
      const at = Date.now();
      lastGood.set(key, { value, at });
      return { value, stale: false, error: null, at };
    },
    (err) => {
      const prev = lastGood.get(key);
      if (!prev) {
        if (cache.get(key) === entry) cache.delete(key);
        throw err;
      }
      entry.at = Date.now() - Math.max(0, ttl - 3_000);
      return { value: prev.value as T, stale: true, error: errMsg(err), at: prev.at };
    },
  );
  cache.set(key, entry);
  return entry.promise;
}

const getContestBundle = (force = false) => cached('contest:bundle', fetchContestBundle, force ? 0 : 60_000);
const getTotalCached = (contestId: string, force = false) =>
  cached(`total:${contestId}`, () => fetchRawTotalRows(contestId), force ? 0 : config.ttlMs);
const getProblemCached = (problemId: string, force = false) =>
  cached(`problem:${problemId}`, () => fetchProblemRanking(problemId), force ? 0 : Math.max(config.ttlMs, 30_000));

/** 把 10 道算子单题榜交叉回填到总榜行（计算加权分、榜首奖励、每题成绩格、最新提交时刻） */
export function enrichTotalWithProblems(totalRows: TotalRow[], problemBoards: ProblemBoard[]): TotalRow[] {
  const byTeam = new Map<
    string,
    {
      problems: Record<string, TeamProblemCell>;
      weightedScore: number;
      leaderBonus: number;
      leaderCount: number;
      latestMs: number;
      latestIso: string | null;
    }
  >();

  for (const pb of problemBoards) {
    const diff = pb.meta.difficulty;
    for (const r of pb.rows) {
      let acc = byTeam.get(r.teamKey);
      if (!acc) {
        acc = { problems: {}, weightedScore: 0, leaderBonus: 0, leaderCount: 0, latestMs: 0, latestIso: null };
        byTeam.set(r.teamKey, acc);
      }
      const isLeader = r.rank === 1 && r.score > 0;
      const cell: TeamProblemCell = {
        rank: r.rank,
        score: r.score,
      };
      if (isLeader) cell.isLeader = true;
      if (r.submittedAt) cell.updatedAt = r.submittedAt;
      acc.problems[pb.meta.slug] = cell;
      acc.weightedScore += r.score * diff;
      if (isLeader) {
        acc.leaderCount += 1;
        acc.leaderBonus += diff * 10;
      }
      const ms = r.submittedAt ? Date.parse(r.submittedAt) : 0;
      if (ms > acc.latestMs) {
        acc.latestMs = ms;
        acc.latestIso = r.submittedAt;
      }
    }
  }

  return totalRows.map((row) => {
    const acc = byTeam.get(row.teamKey);
    if (!acc) return { ...row, problems: {} };
    return {
      ...row,
      weightedScore: Math.round(acc.weightedScore * 100) / 100,
      leaderBonus: acc.leaderBonus,
      leaderCount: acc.leaderCount,
      latestSubmitAt: acc.latestIso,
      problems: acc.problems,
    };
  });
}

/** 获取完整快照（总榜 + 全部 10 道算子单题榜，并完成交叉关联） */
export async function getSnapshot({ force = false } = {}): Promise<Snapshot> {
  const bundleCached = await getContestBundle(force);
  const { contest, problems: probMetas } = bundleCached.value;

  const totalPromise = getTotalCached(contest.id, force).catch(
    (err): Cached<{ rows: TotalRow[]; reportedTotal: number }> => ({
      value: { rows: [], reportedTotal: 0 },
      stale: false,
      error: errMsg(err),
      at: 0,
    }),
  );

  const problemResults = await mapPool(probMetas, Math.min(4, config.concurrency), async (meta) => {
    try {
      const res = await getProblemCached(meta.id, force);
      return {
        meta: {
          ...meta,
          visibleTestcases: res.value.visibleTestcases,
          totalTestcases: res.value.totalTestcases,
        },
        rows: res.value.rows,
        reportedTotal: res.value.reportedTotal,
        truncated: res.value.truncated,
        error: res.error,
        stale: res.stale,
        fetchedAt: res.at,
      } satisfies ProblemBoard;
    } catch (err) {
      return {
        meta,
        rows: [],
        reportedTotal: 0,
        truncated: false,
        error: errMsg(err),
        stale: false,
        fetchedAt: 0,
      } satisfies ProblemBoard;
    }
  });

  const totalRes = await totalPromise;
  const enrichedTotalRows = enrichTotalWithProblems(totalRes.value.rows, problemResults);

  const totalBoard: TotalBoard = {
    rows: enrichedTotalRows,
    reportedTotal: totalRes.value.reportedTotal,
    error: totalRes.error,
    stale: totalRes.stale,
    fetchedAt: totalRes.at,
  };

  return {
    contest,
    generatedAt: new Date().toISOString(),
    total: totalBoard,
    problems: problemResults,
  };
}

/** 单榜读取（用于 /api/board/:id 与 CSV 导出） */
export async function getSingleBoard(
  boardId: string,
  { force = false } = {},
): Promise<{ kind: 'total'; contest: ContestMeta; total: TotalBoard; problems: ProblemBoard[] } | { kind: 'problem'; contest: ContestMeta; problem: ProblemBoard } | null> {
  const clean = boardId.trim().toLowerCase();
  const snap = await getSnapshot({ force });
  if (clean === 'total') {
    return { kind: 'total', contest: snap.contest, total: snap.total, problems: snap.problems };
  }
  const hit = snap.problems.find((p) => p.meta.slug === clean || p.meta.id.toLowerCase() === clean);
  if (!hit) return null;
  return { kind: 'problem', contest: snap.contest, problem: hit };
}
