// 公开只读 MCP 工具：5 个有界、免认证的查榜与分析工具。
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  computeCutoffs,
  diagnoseTeam,
  nearSweepTeams,
  nextTierForRow,
  operatorBattles,
  searchProblemRows,
  searchTotalRows,
} from '../shared/insights.ts';
import type { Snapshot } from '../shared/types.ts';
import { getSnapshot } from './upstream.ts';

export interface McpDataSource {
  getSnapshot(): Promise<Snapshot>;
  now?(): number;
}

export const defaultMcpDataSource: McpDataSource = {
  getSnapshot: () => getSnapshot(),
  now: () => Date.now(),
};

const STALE_MS = 180_000;
const boardIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .describe('榜单 ID：total 表示赛事总榜，或传算子题 slug（先调用 ict_list_boards 发现，如 concatd、layernormv3）');
const teamIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe('队伍标识：teamId、teamObjectId、数字 displayId 或精确队名');
const outputSchema = z.object({ ok: z.boolean(), status: z.string() }).passthrough();
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

type Payload = Record<string, unknown> & { ok: boolean; status: string };

const safeIso = (at: number | null | undefined): string | null =>
  at != null && Number.isFinite(at) && at > 0 && Math.abs(at) < 8.64e15 ? new Date(at).toISOString() : null;

function buildMeta(fetchedAt: number | null | undefined, stale: boolean, error: string | null, now: number, generatedAt?: string) {
  const iso = safeIso(fetchedAt);
  const ageSeconds = iso ? Math.max(0, Math.round((now - fetchedAt!) / 1000)) : null;
  const warnings: string[] = [];
  if (stale || error) warnings.push('上游抓取异常，当前返回最近一次成功缓存。');
  if (!iso) warnings.push('榜单缓存时间未知。');
  if (ageSeconds != null && ageSeconds > STALE_MS / 1000) warnings.push(`缓存已超过 ${STALE_MS / 1000} 秒。`);
  return {
    fetchedAt: iso,
    ...(generatedAt ? { generatedAt } : {}),
    stale: stale || Boolean(error) || !iso || (ageSeconds != null && ageSeconds > STALE_MS / 1000),
    ageSeconds,
    staleAfterSeconds: STALE_MS / 1000,
    warnings,
  };
}

function reply(payload: Payload): CallToolResult {
  return {
    structuredContent: payload,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...(!payload.ok ? { isError: true } : {}),
  };
}

async function safely(action: () => Promise<Payload>, now: () => number): Promise<CallToolResult> {
  try {
    return reply({ ...(await action()), checkedAt: safeIso(now()) });
  } catch {
    return reply({ ok: false, status: 'upstream_error', checkedAt: safeIso(now()), message: '公开榜单数据暂不可用' });
  }
}

function findTeamKey(snap: Snapshot, raw: string): string | null {
  const needle = raw.trim();
  const lower = needle.toLowerCase();
  const exact = snap.total.rows.find(
    (r) =>
      r.teamKey === needle ||
      r.teamId === needle ||
      r.teamObjectId === needle ||
      (r.displayId != null && String(r.displayId) === needle) ||
      r.name.toLowerCase() === lower,
  );
  if (exact) return exact.teamKey;
  for (const pb of snap.problems) {
    const row = pb.rows.find(
      (r) =>
        r.teamKey === needle ||
        r.teamId === needle ||
        r.teamObjectId === needle ||
        (r.displayId != null && String(r.displayId) === needle) ||
        r.name.toLowerCase() === lower,
    );
    if (row) return row.teamKey;
  }
  return null;
}

export function registerIctBoardTools(server: McpServer, source: McpDataSource = defaultMcpDataSource): void {
  const now = () => source.now?.() ?? Date.now();
  const run = (action: () => Promise<Payload>) => safely(action, now);

  server.registerTool(
    'ict_list_boards',
    {
      title: '发现 ICT 算子赛榜单',
      description: '列出赛事元信息、总榜及全部 10 道算子题的 boardId（slug）、难度权重（×1/×2/×3）、榜首奖励（+10×难度）、当前榜首与数据时效。',
      inputSchema: z.object({}).strict(),
      outputSchema,
      annotations,
    },
    () =>
      run(async () => {
        const snap = await source.getSnapshot();
        const at = now();
        const boards = [
          {
            boardId: 'total',
            kind: 'total',
            title: `${snap.contest.title} · 总榜`,
            scoringFormula: 'Σ(difficulty × score) + Σ_{rank=1}(difficulty × 10)',
            rankedTeams: snap.total.rows.length,
            reportedTotal: snap.total.reportedTotal,
            leader: snap.total.rows[0] ? { name: snap.total.rows[0].name, score: snap.total.rows[0].score, leaderCount: snap.total.rows[0].leaderCount } : null,
            meta: buildMeta(snap.total.fetchedAt, snap.total.stale, snap.total.error, at, snap.generatedAt),
          },
          ...snap.problems.map((pb) => ({
            boardId: pb.meta.slug,
            problemId: pb.meta.id,
            kind: 'problem',
            title: pb.meta.title,
            difficulty: pb.meta.difficulty,
            crownBonus: pb.meta.difficulty * 10,
            rankedTeams: pb.rows.length,
            reportedTotal: pb.reportedTotal,
            truncated: pb.truncated,
            passCount: pb.meta.passCount,
            attemptCount: pb.meta.attemptCount,
            submissionCount: pb.meta.submissionCount,
            leader: pb.rows[0] ? { name: pb.rows[0].name, score: pb.rows[0].score, submittedAt: pb.rows[0].submittedAt } : null,
            meta: buildMeta(pb.fetchedAt, pb.stale, pb.error, at, snap.generatedAt),
          })),
        ];
        return {
          ok: true,
          status: snap.problems.some((p) => p.error) || snap.total.error ? 'partial' : 'ok',
          contest: snap.contest,
          boards,
          readOnly: true,
          authentication: 'none',
        };
      }),
  );

  server.registerTool(
    'ict_query_leaderboard',
    {
      title: '筛选分页查询榜单',
      description: '查询总榜（boardId="total"）或任意单题算子榜（如 concatd），支持队名/提交者/ID 关键词筛选与分页（limit 1..100）。',
      inputSchema: z
        .object({
          boardId: boardIdSchema,
          query: z.string().trim().max(120).optional().describe('关键词，空格分词且须全部命中'),
          onlyFullPass: z.boolean().optional().describe('仅总榜生效：只看 10 题全通队伍'),
          onlyLeaders: z.boolean().optional().describe('仅总榜生效：只看至少手握 1 题榜首的队伍'),
          offset: z.number().int().min(0).max(100_000).default(0),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .strict(),
      outputSchema,
      annotations,
    },
    (args) =>
      run(async () => {
        const snap = await source.getSnapshot();
        const at = now();
        const id = args.boardId.toLowerCase();
        if (id === 'total') {
          let rows = searchTotalRows(snap.total.rows, args.query);
          if (args.onlyFullPass) rows = rows.filter((r) => r.passCount >= snap.problems.length);
          if (args.onlyLeaders) rows = rows.filter((r) => r.leaderCount > 0);
          const page = rows.slice(args.offset, args.offset + args.limit);
          return {
            ok: true,
            status: page.length ? 'ok' : 'empty',
            boardId: 'total',
            meta: buildMeta(snap.total.fetchedAt, snap.total.stale, snap.total.error, at, snap.generatedAt),
            total: rows.length,
            offset: args.offset,
            limit: args.limit,
            hasMore: args.offset + page.length < rows.length,
            rows: page.map((r) => ({
              rank: r.rank,
              teamKey: r.teamKey,
              displayId: r.displayId,
              name: r.name,
              score: r.score,
              weightedScore: r.weightedScore,
              leaderBonus: r.leaderBonus,
              leaderCount: r.leaderCount,
              passCount: r.passCount,
              attemptCount: r.attemptCount,
              submissionCount: r.submissionCount,
              latestSubmitAt: r.latestSubmitAt,
            })),
          };
        }

        const pb = snap.problems.find((p) => p.meta.slug === id || p.meta.id.toLowerCase() === id);
        if (!pb) return { ok: false, status: 'not_found', boardId: args.boardId, message: '未找到该算子题，请先调用 ict_list_boards' };
        const rows = searchProblemRows(pb.rows, args.query);
        const page = rows.slice(args.offset, args.offset + args.limit);
        return {
          ok: true,
          status: page.length ? 'ok' : 'empty',
          boardId: pb.meta.slug,
          problem: {
            title: pb.meta.title,
            difficulty: pb.meta.difficulty,
            crownBonus: pb.meta.difficulty * 10,
            visibleTestcases: pb.meta.visibleTestcases,
          },
          meta: buildMeta(pb.fetchedAt, pb.stale, pb.error, at, snap.generatedAt),
          total: rows.length,
          offset: args.offset,
          limit: args.limit,
          hasMore: args.offset + page.length < rows.length,
          rows: page.map((r) => ({
            rank: r.rank,
            teamKey: r.teamKey,
            displayId: r.displayId,
            name: r.name,
            submitter: r.submitter,
            score: r.score,
            submittedAt: r.submittedAt,
            testcases: r.testcases,
          })),
        };
      }),
  );

  server.registerTool(
    'ict_get_team',
    {
      title: '队伍 10 题画像与提分诊断',
      description: '按 teamId / displayId / 精确队名查询一支队伍在总榜和全部 10 道算子题上的详细得分、榜首奖励与逐题提分空间（含反超榜首可获总分增量）。',
      inputSchema: z.object({ team: teamIdSchema }).strict(),
      outputSchema,
      annotations,
    },
    ({ team }) =>
      run(async () => {
        const snap = await source.getSnapshot();
        const at = now();
        const key = findTeamKey(snap, team);
        if (!key) return { ok: false, status: 'not_found', team, message: '当前公开榜单中未找到该队伍' };
        const diag = diagnoseTeam(snap, key);
        const topOpportunities = [...diag.items]
          .filter((x) => !x.isLeader && x.maxTotalGain > 0)
          .sort((a, b) => b.maxTotalGain - a.maxTotalGain)
          .slice(0, 3);
        return {
          ok: true,
          status: 'ok',
          meta: buildMeta(snap.total.fetchedAt, snap.total.stale, snap.total.error, at, snap.generatedAt),
          total: diag.total,
          syncDelta: diag.syncDelta,
          nextTier: diag.nextTier,
          problems: diag.items,
          topOpportunities,
        };
      }),
  );

  server.registerTool(
    'ict_analyze_cutoff',
    {
      title: '分析分数线与冲刺形势',
      description: '计算总榜或单题榜的指定名次分数线（默认第 10 / 50 / 100 名），可选指定队伍计算差距；总榜附带 10 题全通人数与 8~9 题冲刺队伍列表。',
      inputSchema: z
        .object({
          boardId: boardIdSchema.default('total'),
          rank: z.number().int().min(1).max(10_000).default(50),
          team: teamIdSchema.optional(),
        })
        .strict(),
      outputSchema,
      annotations,
    },
    (args) =>
      run(async () => {
        const snap = await source.getSnapshot();
        const at = now();
        const id = args.boardId.toLowerCase();
        const teamKey = args.team ? findTeamKey(snap, args.team) : null;

        if (id === 'total') {
          const cutoffs = computeCutoffs(snap.total.rows, [1, 3, 10, 20, 50, 100, args.rank]);
          const targetCut = cutoffs.find((c) => c.rank === args.rank) ?? null;
          const targetTeam = teamKey ? snap.total.rows.find((r) => r.teamKey === teamKey) ?? null : null;
          const fullPassCount = snap.total.rows.filter((r) => r.passCount >= snap.problems.length).length;
          return {
            ok: true,
            status: 'ok',
            boardId: 'total',
            meta: buildMeta(snap.total.fetchedAt, snap.total.stale, snap.total.error, at, snap.generatedAt),
            targetRank: args.rank,
            cutoffScore: targetCut?.score ?? null,
            cutoffs,
            fullPassCount,
            nearSweepCount: nearSweepTeams(snap, snap.problems.length - 2).length,
            team: targetTeam ? { name: targetTeam.name, rank: targetTeam.rank, score: targetTeam.score, passCount: targetTeam.passCount } : null,
            gapToCutoff:
              targetCut?.score != null && targetTeam != null
                ? Math.max(0, Math.round((targetCut.score - targetTeam.score) * 100) / 100)
                : null,
            nextTier: targetTeam ? nextTierForRow(targetTeam, snap.total.rows) : null,
          };
        }

        const pb = snap.problems.find((p) => p.meta.slug === id || p.meta.id.toLowerCase() === id);
        if (!pb) return { ok: false, status: 'not_found', boardId: args.boardId, message: '未找到该算子题' };
        const cutoffs = computeCutoffs(pb.rows, [1, 3, 10, 20, 50, 100, args.rank]);
        const targetCut = cutoffs.find((c) => c.rank === args.rank) ?? null;
        const targetTeam = teamKey ? pb.rows.find((r) => r.teamKey === teamKey) ?? null : null;
        return {
          ok: true,
          status: 'ok',
          boardId: pb.meta.slug,
          title: pb.meta.title,
          difficulty: pb.meta.difficulty,
          meta: buildMeta(pb.fetchedAt, pb.stale, pb.error, at, snap.generatedAt),
          targetRank: args.rank,
          cutoffScore: targetCut?.score ?? null,
          cutoffs,
          team: targetTeam ? { name: targetTeam.name, rank: targetTeam.rank, score: targetTeam.score } : null,
          gapToCutoff:
            targetCut?.score != null && targetTeam != null
              ? Math.max(0, Math.round((targetCut.score - targetTeam.score) * 100) / 100)
              : null,
        };
      }),
  );

  server.registerTool(
    'ict_analyze_problem',
    {
      title: '算子榜首战局与公开用例 tbest 分析',
      description: '分析全部 10 道算子的榜首归属、冠亚军分差、通过率；传入特定 boardId 时返回该题 5 个公开用例的全场最优耗时 tbest 与前 10 名实测倍率。',
      inputSchema: z.object({ boardId: z.string().trim().max(60).optional().describe('可选算子 slug；省略时返回全部 10 题战局总览') }).strict(),
      outputSchema,
      annotations,
    },
    ({ boardId }) =>
      run(async () => {
        const snap = await source.getSnapshot();
        const at = now();
        if (!boardId) {
          const battles = operatorBattles(snap.problems).map((b) => ({
            slug: b.slug,
            title: b.title,
            difficulty: b.difficulty,
            crownBonus: b.crownBonus,
            rankedCount: b.rankedCount,
            passRate: Math.round(b.passRate * 1000) / 10,
            submissionCount: b.submissionCount,
            leader: b.leader ? { name: b.leader.name, score: b.leader.score } : null,
            runnerUp: b.runnerUp ? { name: b.runnerUp.name, score: b.runnerUp.score } : null,
            leadMargin: b.leadMargin,
            headroomTo100: b.headroomTo100,
            top10Cutoff: b.top10Cutoff,
            medianScore: b.medianScore,
          }));
          return {
            ok: true,
            status: 'ok',
            meta: buildMeta(snap.total.fetchedAt, snap.total.stale, snap.total.error, at, snap.generatedAt),
            battles,
          };
        }
        const id = boardId.toLowerCase();
        const pb = snap.problems.find((p) => p.meta.slug === id || p.meta.id.toLowerCase() === id);
        if (!pb) return { ok: false, status: 'not_found', boardId, message: '未找到该算子题' };
        return {
          ok: true,
          status: 'ok',
          meta: buildMeta(pb.fetchedAt, pb.stale, pb.error, at, snap.generatedAt),
          problem: pb.meta,
          top10: pb.rows.slice(0, 10),
        };
      }),
  );
}
