// 纯函数分析模块：搜索、分数线、直方图、动态 tbest 效率分析、榜首争夺、提分 ROI 诊断、实时变化检测与近期动态。
import { toMs } from './format.ts';
import type { ProblemBoard, ProblemRow, Snapshot, TotalRow } from './types.ts';

export const TIER_RANKS = [1, 3, 10, 20, 50, 100, 200, 500] as const;

/** 多关键词搜索（空格分词，AND 匹配） */
export function searchTotalRows(rows: TotalRow[], query: string | undefined): TotalRow[] {
  const tokens = (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return rows;
  return rows.filter((r) => {
    const hay = `${r.name} ${r.displayId ?? ''} ${r.teamId}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

export function searchProblemRows(rows: ProblemRow[], query: string | undefined): ProblemRow[] {
  const tokens = (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return rows;
  return rows.filter((r) => {
    const hay = `${r.name} ${r.submitter} ${r.displayId ?? ''} ${r.teamId}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

/**
 * 基于公开 5 个用例的动态 tbest 均效率：avg(100 × tbest / time) = avg(100 / ratio)。
 * 因为每个用例满分为 100（达到当前全场最优 tbest），对比公开均效率与 50 用例综合得分
 * 可以直接看出该队在 45 个隐藏用例上的泛化表现（hiddenDelta = score - visibleEffPct）。
 */
export function visibleEfficiencyOf(row: ProblemRow): {
  /** 公开用例折算效率（0..100%） */
  visibleEffPct: number | null;
  /** 综合得分 − 公开均效率（负值越大说明隐藏用例明显拖后腿，接近 0 或为正说明隐藏用例泛化极强） */
  hiddenDelta: number | null;
  /** 公开用例平均耗时倍率（time / tbest） */
  avgRatio: number | null;
} {
  const ratios = row.testcases.map((t) => t.ratio).filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
  if (!ratios.length) return { visibleEffPct: null, hiddenDelta: null, avgRatio: null };
  const eff = ratios.reduce((s, r) => s + Math.min(100, 100 / r), 0) / ratios.length;
  const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const visibleEffPct = Math.round(eff * 10) / 10;
  const hiddenDelta = Math.round((row.score - visibleEffPct) * 10) / 10;
  return { visibleEffPct, hiddenDelta, avgRatio: Math.round(avgRatio * 1000) / 1000 };
}

export interface Cutoff {
  rank: number;
  score: number | null;
  countAtOrAbove: number;
}

export function computeCutoffs<T extends { score: number }>(rows: T[], ranks: readonly number[] = TIER_RANKS): Cutoff[] {
  const valid = rows.filter((r) => Number.isFinite(r.score) && r.score > 0);
  return ranks.map((rank) => {
    const target = valid[rank - 1];
    if (!target) return { rank, score: null, countAtOrAbove: valid.length };
    const score = target.score;
    const countAtOrAbove = valid.filter((r) => r.score >= score - 1e-9).length;
    return { rank, score, countAtOrAbove };
  });
}

export interface NextTierInfo {
  targetRank: number;
  targetScore: number;
  gap: number;
}

export function nextTierForRow<T extends { rank: number; score: number }>(
  row: T,
  rows: T[],
  tiers: readonly number[] = TIER_RANKS,
): NextTierInfo | null {
  if (row.rank <= 1) return null;
  const targets = [...tiers].filter((t) => t < row.rank).sort((a, b) => b - a);
  const targetRank = targets[0] ?? 1;
  const target = rows[targetRank - 1];
  if (!target) return null;
  const gap = Math.max(0, Math.round((target.score - row.score) * 100) / 100);
  return { targetRank, targetScore: target.score, gap };
}

export interface HistBin {
  from: number;
  to: number;
  count: number;
  label: string;
}

export function scoreHistogram<T extends { score: number }>(rows: T[], binCount = 16): HistBin[] {
  const scores = rows.map((r) => r.score).filter((s) => Number.isFinite(s) && s > 0);
  if (!scores.length) return [];
  const max = Math.max(...scores);
  const stepRaw = max / binCount;
  const step = stepRaw <= 10 ? Math.max(5, Math.ceil(stepRaw / 5) * 5) : Math.ceil(stepRaw / 25) * 25;
  const upper = Math.ceil(max / step) * step;
  const bins: HistBin[] = [];
  for (let from = 0; from < upper; from += step) {
    bins.push({ from, to: from + step, count: 0, label: `${from}–${from + step}` });
  }
  for (const s of scores) {
    const idx = Math.min(bins.length - 1, Math.floor(s / step));
    if (bins[idx]) bins[idx]!.count += 1;
  }
  return bins;
}

/** 10 道算子的榜首争夺与动态 tbest 碎片余量总览 */
export interface OperatorBattle {
  slug: string;
  problemId: string;
  title: string;
  difficulty: number;
  crownBonus: number;
  rankedCount: number;
  attemptCount: number;
  passCount: number;
  passRate: number;
  submissionCount: number;
  leader: ProblemRow | null;
  runnerUp: ProblemRow | null;
  leadMargin: number | null;
  /** 100 − #1得分：反映 50 个用例 tbest 在各队间的分散程度（越大说明仍有综合泛化提升空间） */
  headroomTo100: number | null;
  top10Cutoff: number | null;
  medianScore: number | null;
  sourceUrl: string;
}

export function operatorBattles(problems: ProblemBoard[]): OperatorBattle[] {
  return problems.map((pb) => {
    const leader = pb.rows[0] ?? null;
    const runnerUp = pb.rows[1] ?? null;
    const leadMargin = leader && runnerUp ? Math.round((leader.score - runnerUp.score) * 100) / 100 : null;
    const headroomTo100 = leader ? Math.max(0, Math.round((100 - leader.score) * 100) / 100) : null;
    const top10Cutoff = pb.rows[9]?.score ?? null;
    const validScores = pb.rows.map((r) => r.score).filter((s) => s > 0);
    const medianScore = validScores.length ? validScores[Math.floor(validScores.length / 2)]! : null;
    return {
      slug: pb.meta.slug,
      problemId: pb.meta.id,
      title: pb.meta.title,
      difficulty: pb.meta.difficulty,
      crownBonus: pb.meta.difficulty * 10,
      rankedCount: pb.reportedTotal || pb.rows.length,
      attemptCount: pb.meta.attemptCount,
      passCount: pb.meta.passCount,
      passRate: pb.meta.attemptCount > 0 ? pb.meta.passCount / pb.meta.attemptCount : 0,
      submissionCount: pb.meta.submissionCount,
      leader,
      runnerUp,
      leadMargin,
      headroomTo100,
      top10Cutoff,
      medianScore,
      sourceUrl: pb.meta.sourceUrl,
    };
  });
}

/** 单支队伍的逐题提分 ROI 诊断 */
export interface ProblemDiagnosis {
  slug: string;
  title: string;
  difficulty: number;
  crownBonus: number;
  teamScore: number | null;
  teamRank: number | null;
  weightedScore: number;
  isLeader: boolean;
  leaderName: string | null;
  leaderScore: number | null;
  gapToFirst: number | null;
  /** 若追平/反超单题第 1 可获得的总分增量（含榜首奖励 +difficulty*10；实际若同时压低 tbest 会额外拉开对手） */
  maxTotalGain: number;
  weightPerPoint: number;
  avgTestcaseRatio: number | null;
  /** 公开 5 用例均效率 (avg 100 * tbest / time) */
  visibleEffPct: number | null;
  /** 综合得分 − 公开均效率（透视 45 个隐藏用例泛化偏差） */
  hiddenDelta: number | null;
  submittedAt: string | null;
  submitter: string | null;
  sourceUrl: string;
}

export function diagnoseTeam(snap: Snapshot, teamKey: string): {
  total: TotalRow | null;
  items: ProblemDiagnosis[];
  nextTier: NextTierInfo | null;
  /** 官方总分与按当前单题榜核算值（weightedScore + leaderBonus）之间的瞬时动态重算差 */
  syncDelta: number;
} {
  const total = snap.total.rows.find((r) => r.teamKey === teamKey || r.teamId === teamKey || r.teamObjectId === teamKey) ?? null;
  const resolvedKey = total?.teamKey ?? teamKey;

  const items: ProblemDiagnosis[] = snap.problems.map((pb) => {
    const row = pb.rows.find((r) => r.teamKey === resolvedKey || r.teamId === resolvedKey || r.teamObjectId === resolvedKey) ?? null;
    const leader = pb.rows[0] ?? null;
    const diff = pb.meta.difficulty;
    const crownBonus = diff * 10;
    const score = row?.score ?? null;
    const isLeader = row != null && row.rank === 1;
    const gapToFirst = leader ? Math.max(0, Math.round((leader.score - (score ?? 0)) * 100) / 100) : null;
    const maxTotalGain =
      leader == null
        ? 0
        : isLeader
          ? 0
          : Math.round(((leader.score - (score ?? 0)) * diff + crownBonus) * 100) / 100;
    const eff = row ? visibleEfficiencyOf(row) : { visibleEffPct: null, hiddenDelta: null, avgRatio: null };
    return {
      slug: pb.meta.slug,
      title: pb.meta.title,
      difficulty: diff,
      crownBonus,
      teamScore: score,
      teamRank: row?.rank ?? null,
      weightedScore: score != null ? Math.round(score * diff * 100) / 100 : 0,
      isLeader,
      leaderName: leader?.name ?? null,
      leaderScore: leader?.score ?? null,
      gapToFirst,
      maxTotalGain,
      weightPerPoint: diff,
      avgTestcaseRatio: eff.avgRatio,
      visibleEffPct: eff.visibleEffPct,
      hiddenDelta: eff.hiddenDelta,
      submittedAt: row?.submittedAt ?? null,
      submitter: row?.submitter ?? null,
      sourceUrl: pb.meta.sourceUrl,
    };
  });

  const nextTier = total ? nextTierForRow(total, snap.total.rows) : null;
  const syncDelta = total ? Math.round((total.score - (total.weightedScore + total.leaderBonus)) * 100) / 100 : 0;
  return { total, items, nextTier, syncDelta };
}

/** 冲刺 10 题全通的队伍（已过 8 或 9 题） */
export interface NearSweepTeam {
  team: TotalRow;
  missingSlugs: { slug: string; title: string; difficulty: number }[];
}

export function nearSweepTeams(snap: Snapshot, minPass = 8): NearSweepTeam[] {
  const totalProbCount = snap.problems.length;
  if (totalProbCount < 2) return [];
  return snap.total.rows
    .filter((r) => r.passCount >= minPass && r.passCount < totalProbCount)
    .map((team) => ({
      team,
      missingSlugs: snap.problems
        .filter((pb) => !team.problems[pb.meta.slug])
        .map((pb) => ({ slug: pb.meta.slug, title: pb.meta.title, difficulty: pb.meta.difficulty })),
    }))
    .sort((a, b) => b.team.passCount - a.team.passCount || b.team.score - a.team.score);
}

/**
 * 实时变化事件：严格区分「真实提交刷分」「单题榜首易主」与「tbest 破纪录引发全场重算」，
 * 避免某用例 tbest 刷新导致全题几百支未提交队伍被动掉分刷屏。
 */
export type LiveChangeKind = 'submit' | 'crown' | 'tbest';

export interface LiveChange {
  id: string;
  kind: LiveChangeKind;
  boardId: string;
  boardTitle: string;
  teamKey: string;
  name: string;
  rank: number;
  prevRank: number | null;
  score: number;
  prevScore: number | null;
  /** 附加说明（如 tbest 刷新详情 / 榜首奖励转移） */
  detail?: string;
  detectedAt: number;
}

export function diffSnapshots(prev: Snapshot, next: Snapshot, now = Date.now()): LiveChange[] {
  const out: LiveChange[] = [];
  const prevProbs = new Map(prev.problems.map((p) => [p.meta.slug, p]));
  const problemsWithTbestShift = new Set<string>();

  // 1) 单题榜分析：检测公开 tbest 刷新、隐含隐藏用例 tbest 重算、榜首易主、以及真实提交
  for (const pb of next.problems) {
    const oldPb = prevProbs.get(pb.meta.slug);
    if (!oldPb) continue;

    // 1a) 公开 5 用例 tbest 直接变化
    const visibleShifts: string[] = [];
    for (let i = 0; i < pb.meta.visibleTestcases.length; i++) {
      const nTc = pb.meta.visibleTestcases[i];
      const oTc = oldPb.meta.visibleTestcases[i];
      if (nTc?.tbest != null && oTc?.tbest != null && nTc.tbest < oTc.tbest - 1e-6) {
        const dropPct = ((oTc.tbest - nTc.tbest) / oTc.tbest) * 100;
        visibleShifts.push(`Case ${nTc.index}: ${oTc.tbest.toFixed(2)}→${nTc.tbest.toFixed(2)}μs (-${dropPct.toFixed(1)}%)`);
      }
    }

    // 1b) 榜首易主检测
    const oldLeader = oldPb.rows[0];
    const newLeader = pb.rows[0];
    if (oldLeader && newLeader && oldLeader.teamKey !== newLeader.teamKey) {
      out.push({
        id: `crown:${pb.meta.slug}:${newLeader.teamKey}:${now}`,
        kind: 'crown',
        boardId: pb.meta.slug,
        boardTitle: pb.meta.title,
        teamKey: newLeader.teamKey,
        name: newLeader.name,
        rank: 1,
        prevRank: oldPb.rows.find((r) => r.teamKey === newLeader.teamKey)?.rank ?? null,
        score: newLeader.score,
        prevScore: oldLeader.score,
        detail: `反超 ${oldLeader.name} 夺得榜首（+${pb.meta.difficulty * 10} 奖励）`,
        detectedAt: now,
      });
    }

    // 1c) 逐队区分「真提交」vs「未提交但被动掉分（隐藏用例 tbest 被卷低）」
    const oldMap = new Map(oldPb.rows.map((r) => [r.teamKey, r]));
    const passiveDrops: number[] = [];

    for (const r of pb.rows) {
      const old = oldMap.get(r.teamKey);
      if (!old) {
        out.push({
          id: `sub:${pb.meta.slug}:${r.teamKey}:${now}`,
          kind: 'submit',
          boardId: pb.meta.slug,
          boardTitle: pb.meta.title,
          teamKey: r.teamKey,
          name: r.name,
          rank: r.rank,
          prevRank: null,
          score: r.score,
          prevScore: null,
          detail: '新上榜',
          detectedAt: now,
        });
        continue;
      }

      const submittedChanged = Boolean(r.submittedAt && r.submittedAt !== old.submittedAt);
      const scoreDelta = r.score - old.score;

      if (submittedChanged || scoreDelta > 0.005) {
        out.push({
          id: `sub:${pb.meta.slug}:${r.teamKey}:${now}`,
          kind: 'submit',
          boardId: pb.meta.slug,
          boardTitle: pb.meta.title,
          teamKey: r.teamKey,
          name: r.name,
          rank: r.rank,
          prevRank: old.rank,
          score: r.score,
          prevScore: old.score,
          detectedAt: now,
        });
      } else if (scoreDelta < -0.005) {
        // submittedAt 没变却掉分 → 必然是该题某个用例 tbest 刷新引发的被动重算
        passiveDrops.push(scoreDelta);
      }
    }

    if (visibleShifts.length > 0 || passiveDrops.length >= 3) {
      problemsWithTbestShift.add(pb.meta.slug);
      passiveDrops.sort((a, b) => a - b);
      const medDrop = passiveDrops.length ? passiveDrops[Math.floor(passiveDrops.length / 2)]! : null;
      const detailParts: string[] = [];
      if (visibleShifts.length) detailParts.push(visibleShifts.join('；'));
      if (passiveDrops.length) {
        detailParts.push(`触发 ${passiveDrops.length} 队被动重算${medDrop != null ? `（中位 ${medDrop.toFixed(2)} 分）` : ''}`);
      }
      out.push({
        id: `tbest:${pb.meta.slug}:${now}`,
        kind: 'tbest',
        boardId: pb.meta.slug,
        boardTitle: pb.meta.title,
        teamKey: newLeader?.teamKey ?? '',
        name: `${pb.meta.title} · tbest 纪录刷新`,
        rank: 1,
        prevRank: null,
        score: newLeader?.score ?? 0,
        prevScore: oldLeader?.score ?? null,
        detail: detailParts.join(' · '),
        detectedAt: now,
      });
    }
  }

  // 2) 总榜分析：过滤因 tbest 导致的纯被动掉分，仅保留真实提交 / 涨分 / 新上榜
  const prevTotal = new Map(prev.total.rows.map((r) => [r.teamKey, r]));
  for (const r of next.total.rows) {
    const old = prevTotal.get(r.teamKey);
    if (!old) {
      if (r.score > 0) {
        out.push({
          id: `total:${r.teamKey}:${now}`,
          kind: 'submit',
          boardId: 'total',
          boardTitle: '总榜',
          teamKey: r.teamKey,
          name: r.name,
          rank: r.rank,
          prevRank: null,
          score: r.score,
          prevScore: null,
          detail: '新上总榜',
          detectedAt: now,
        });
      }
      continue;
    }

    const scoreDelta = r.score - old.score;
    const didSubmit =
      r.submissionCount > old.submissionCount ||
      (r.latestSubmitAt != null && r.latestSubmitAt !== old.latestSubmitAt) ||
      r.passCount > old.passCount;
    const crownSwung = r.leaderBonus !== old.leaderBonus;

    // 只有真正涨分、有新提交、或榜首奖励变动才记录总榜变更；忽略纯 tbest 被动重算掉分
    if (scoreDelta > 0.01 || (didSubmit && Math.abs(scoreDelta) > 0.01) || crownSwung) {
      // 如果没有任何新提交且是因为 tbest 重算导致的纯掉分，跳过
      if (!didSubmit && !crownSwung && scoreDelta < 0 && problemsWithTbestShift.size > 0) continue;
      out.push({
        id: `total:${r.teamKey}:${now}`,
        kind: crownSwung && !didSubmit ? 'crown' : 'submit',
        boardId: 'total',
        boardTitle: '总榜',
        teamKey: r.teamKey,
        name: r.name,
        rank: r.rank,
        prevRank: old.rank,
        score: r.score,
        prevScore: old.score,
        detail: crownSwung ? `榜首奖励 ${old.leaderBonus} → ${r.leaderBonus}` : undefined,
        detectedAt: now,
      });
    }
  }

  const priority: Record<LiveChangeKind, number> = { crown: 0, tbest: 1, submit: 2 };
  return out
    .sort((a, b) => priority[a.kind] - priority[b.kind] || a.rank - b.rank || b.score - a.score)
    .slice(0, 100);
}

/** 从单题榜的 submittedAt 聚合出近期刷新动态 */
export interface RecentActivityItem {
  id: string;
  slug: string;
  title: string;
  difficulty: number;
  teamKey: string;
  name: string;
  submitter: string;
  rank: number;
  score: number;
  isLeader: boolean;
  atMs: number;
  submittedAt: string;
}

export function recentActivity(snap: Snapshot, windowMs: number, slugFilter = '', now = Date.now()): RecentActivityItem[] {
  const cutoff = now - windowMs;
  const items: RecentActivityItem[] = [];
  for (const pb of snap.problems) {
    if (slugFilter && pb.meta.slug !== slugFilter) continue;
    for (const r of pb.rows) {
      const ms = toMs(r.submittedAt);
      if (ms == null || ms < cutoff) continue;
      items.push({
        id: `${pb.meta.slug}:${r.teamKey}:${ms}`,
        slug: pb.meta.slug,
        title: pb.meta.title,
        difficulty: pb.meta.difficulty,
        teamKey: r.teamKey,
        name: r.name,
        submitter: r.submitter,
        rank: r.rank,
        score: r.score,
        isLeader: r.rank === 1,
        atMs: ms,
        submittedAt: r.submittedAt!,
      });
    }
  }
  items.sort((a, b) => b.atMs - a.atMs || a.rank - b.rank);
  return items;
}
