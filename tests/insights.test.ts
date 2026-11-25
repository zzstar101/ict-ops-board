import { describe, expect, test } from 'bun:test';
import { computeCutoffs, diagnoseTeam, diffSnapshots, nearSweepTeams, operatorBattles, recentActivity, scoreHistogram, searchTotalRows, visibleEfficiencyOf } from '../src/shared/insights.ts';
import { enrichTotalWithProblems, rankProblemRows, rankTotalRows } from '../src/server/upstream.ts';
import type { ProblemBoard, Snapshot, TotalRow } from '../src/shared/types.ts';

function makeProblem(slug: string, title: string, difficulty: number, rows: { key: string; name: string; score: number; at?: string }[]): ProblemBoard {
  return {
    meta: {
      id: `pid-${slug}`,
      slug,
      title,
      difficulty,
      cannVersion: '9.1.0',
      totalTestcases: 50,
      visibleTestcases: [{ id: 'tc1', index: 1, caseId: 1, tbest: 3.5 }],
      attemptCount: 100,
      passCount: 80,
      wrongCount: 10,
      failCount: 2,
      submissionCount: 500,
      sourceUrl: `https://cannjudge.cn/public/ictcompetition/${slug}`,
    },
    rows: rankProblemRows(
      rows.map((r) => ({
        rank: 0,
        teamKey: r.key,
        teamId: r.key,
        teamObjectId: r.key,
        displayId: 100,
        name: r.name,
        submitter: 'dev',
        submitterId: 1,
        score: r.score,
        status: 'Pass',
        submittedAt: r.at ?? '2026-11-24T10:00:00.000Z',
        testcases: [{ time: 3.6, ratio: 1.029 }],
      })),
    ),
    reportedTotal: rows.length,
    truncated: false,
    error: null,
    stale: false,
    fetchedAt: Date.parse('2026-11-25T09:00:00.000Z'),
  };
}

function makeSnapshot(): Snapshot {
  const p1 = makeProblem('concatd', 'ConcatD', 3, [
    { key: 't1', name: 'Alpha', score: 80, at: '2026-11-25T08:00:00.000Z' },
    { key: 't2', name: 'Beta', score: 75, at: '2026-11-25T07:00:00.000Z' },
  ]);
  const p2 = makeProblem('layernormv3', 'LayerNormV3', 2, [
    { key: 't2', name: 'Beta', score: 90, at: '2026-11-25T08:30:00.000Z' },
    { key: 't1', name: 'Alpha', score: 85, at: '2026-11-25T06:00:00.000Z' },
  ]);
  const rawTotal: TotalRow[] = rankTotalRows([
    {
      rank: 0,
      teamKey: 't1',
      teamId: 't1',
      teamObjectId: 't1',
      displayId: 1,
      name: 'Alpha',
      score: 440, // 80*3 + 85*2 + 30 (ConcatD crown)
      weightedScore: 0,
      leaderBonus: 0,
      leaderCount: 0,
      passCount: 2,
      attemptCount: 2,
      submissionCount: 20,
      latestSubmitAt: null,
      problems: {},
    },
    {
      rank: 0,
      teamKey: 't2',
      teamId: 't2',
      teamObjectId: 't2',
      displayId: 2,
      name: 'Beta',
      score: 425, // 75*3 + 90*2 + 20 (LayerNormV3 crown)
      weightedScore: 0,
      leaderBonus: 0,
      leaderCount: 0,
      passCount: 2,
      attemptCount: 2,
      submissionCount: 30,
      latestSubmitAt: null,
      problems: {},
    },
    {
      rank: 0,
      teamKey: 't3',
      teamId: 't3',
      teamObjectId: 't3',
      displayId: 3,
      name: 'Gamma',
      score: 120,
      weightedScore: 0,
      leaderBonus: 0,
      leaderCount: 0,
      passCount: 1,
      attemptCount: 2,
      submissionCount: 10,
      latestSubmitAt: null,
      problems: {},
    },
  ]);

  const enriched = enrichTotalWithProblems(rawTotal, [p1, p2]);
  return {
    contest: {
      id: 'cid',
      slug: 'ictcompetition',
      title: 'ICT Test',
      desc: '',
      startTime: '2026-11-01T16:00:00.000Z',
      endTime: '2027-03-04T15:59:00.000Z',
      organizationMode: 'huawei_team',
      scoringRule: 'difficulty_weighted',
      dailyLimit: 50,
      visibleTestcaseCount: 5,
      participantCount: 100,
      submissionCount: 1000,
      problemCount: 2,
      sourceUrl: 'https://cannjudge.cn/public/ictcompetition',
    },
    generatedAt: '2026-11-25T09:00:00.000Z',
    total: { rows: enriched, reportedTotal: enriched.length, error: null, stale: false, fetchedAt: Date.parse('2026-11-25T09:00:00.000Z') },
    problems: [p1, p2],
  };
}

describe('ICT scoring enrichment & insights', () => {
  test('computes weighted score and +10*difficulty crown bonus accurately', () => {
    const snap = makeSnapshot();
    const alpha = snap.total.rows.find((r) => r.teamKey === 't1')!;
    const beta = snap.total.rows.find((r) => r.teamKey === 't2')!;
    expect(alpha.weightedScore).toBe(410);
    expect(alpha.leaderBonus).toBe(30);
    expect(alpha.leaderCount).toBe(1);
    expect(alpha.weightedScore + alpha.leaderBonus).toBe(alpha.score);

    expect(beta.weightedScore).toBe(405);
    expect(beta.leaderBonus).toBe(20);
    expect(beta.leaderCount).toBe(1);
    expect(beta.weightedScore + beta.leaderBonus).toBe(beta.score);
  });

  test('diagnoseTeam calculates maxTotalGain including crown swing', () => {
    const snap = makeSnapshot();
    const diag = diagnoseTeam(snap, 't2');
    const concat = diag.items.find((x) => x.slug === 'concatd')!;
    const ln = diag.items.find((x) => x.slug === 'layernormv3')!;
    // Beta has 75 vs Alpha 80 on ConcatD (x3): (80-75)*3 + 30 = 45
    expect(concat.gapToFirst).toBe(5);
    expect(concat.maxTotalGain).toBe(45);
    expect(ln.isLeader).toBe(true);
    expect(ln.maxTotalGain).toBe(0);
  });

  test('operatorBattles, cutoffs, histogram, search, nearSweep & activity work', () => {
    const snap = makeSnapshot();
    const battles = operatorBattles(snap.problems);
    expect(battles).toHaveLength(2);
    expect(battles[0]!.leadMargin).toBe(5);
    expect(computeCutoffs(snap.total.rows, [1, 2])[1]!.score).toBe(425);
    expect(scoreHistogram(snap.total.rows, 6).reduce((s, b) => s + b.count, 0)).toBe(3);
    expect(searchTotalRows(snap.total.rows, 'bet')).toHaveLength(1);
    expect(nearSweepTeams(snap, 1)).toHaveLength(1);
    const act = recentActivity(snap, 4 * 3600_000, '', Date.parse('2026-11-25T09:00:00.000Z'));
    expect(act[0]!.slug).toBe('layernormv3');
    expect(act[0]!.name).toBe('Beta');
  });

  test('diffSnapshots detects genuine submissions, crown changes, and tbest shifts without passive-drop spam', () => {
    const prev = makeSnapshot();
    // 1) Genuine score improvement
    const next = structuredClone(prev);
    next.total.rows[1]!.score = 455;
    next.total.rows[1]!.submissionCount += 1;
    next.total.rows = rankTotalRows(next.total.rows);
    const diffs = diffSnapshots(prev, next, Date.parse('2026-11-25T09:05:00.000Z'));
    expect(diffs.some((d) => d.kind === 'submit' && d.boardId === 'total' && d.teamKey === 't2' && d.score === 455)).toBe(true);

    // 2) Visible tbest shift + passive score decay (submittedAt unchanged) must emit a single tbest event, not per-team drops
    const afterTbest = structuredClone(prev);
    afterTbest.problems[0]!.meta.visibleTestcases[0]!.tbest = 3.2;
    for (const r of afterTbest.problems[0]!.rows) {
      r.score = Math.round((r.score - 1.5) * 100) / 100;
    }
    for (const r of afterTbest.total.rows) {
      r.score = Math.round((r.score - 4.5) * 100) / 100;
    }
    const tbestDiffs = diffSnapshots(prev, afterTbest, Date.parse('2026-11-25T09:10:00.000Z'));
    expect(tbestDiffs.some((d) => d.kind === 'tbest' && d.boardId === 'concatd')).toBe(true);
    expect(tbestDiffs.filter((d) => d.kind === 'submit')).toHaveLength(0);

    // 3) visibleEfficiencyOf & headroomTo100
    const eff = visibleEfficiencyOf(prev.problems[0]!.rows[0]!);
    expect(eff.visibleEffPct).toBeCloseTo(97.2, 0);
    expect(operatorBattles(prev.problems)[0]!.headroomTo100).toBe(20);
  });
});
