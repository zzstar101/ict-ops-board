import { useMemo } from 'react';
import { fmtInt, fmtPct, fmtScore } from '../../shared/format.ts';
import { nearSweepTeams, operatorBattles } from '../../shared/insights.ts';
import type { Snapshot } from '../../shared/types.ts';
import { CrownPill, DifficultyBadge, RankMark } from './ui.tsx';

export function AnalysisPanel({
  snap,
  onOpenTeam,
  onPickProblem,
}: {
  snap: Snapshot;
  onOpenTeam: (teamKey: string) => void;
  onPickProblem: (slug: string) => void;
}) {
  const battles = useMemo(() => operatorBattles(snap.problems), [snap.problems]);
  const crownHolders = useMemo(
    () =>
      snap.total.rows
        .filter((r) => r.leaderCount > 0)
        .sort((a, b) => b.leaderBonus - a.leaderBonus || b.leaderCount - a.leaderCount || b.score - a.score),
    [snap.total.rows],
  );
  const nearSweep = useMemo(() => nearSweepTeams(snap, Math.max(1, snap.problems.length - 2)).slice(0, 30), [snap]);

  return (
    <div className="space-y-6">
      {/* 10 Operator Crown Battle Table */}
      <section className="editorial-panel overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">十题榜首争夺与权重总览</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-2)]">
              每道算子当前第 1 名独享 <span className="num text-[var(--ink)]">+10 × 难度系数</span> 榜首奖励；因 50 用例各自按全场最优 <span className="num">tbest</span> 计分，「距满分余量 (100−#1)」越大说明各 shape 最优越分散、综合泛化提升空间越大。
            </p>
          </div>
          <span className="num text-xs text-[var(--ink-3)]">点击算子名看用例耗时</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--ink-3)]">
                <th className="py-2.5 pl-4 pr-2">算子题目</th>
                <th className="py-2.5 px-2">权重 / 榜首奖</th>
                <th className="py-2.5 px-2">当前榜首 (#1)</th>
                <th className="py-2.5 px-2">紧随其后 (#2)</th>
                <th className="py-2.5 px-2 text-right">领先分差</th>
                <th className="py-2.5 px-2 text-right" title="100 − 当前榜首分：越大代表 50 个用例的 tbest 越分散，泛化优化空间越大">距满分余量</th>
                <th className="py-2.5 px-2 text-right">Top 10 线</th>
                <th className="py-2.5 px-2 text-right">通过率</th>
                <th className="py-2.5 pl-2 pr-4 text-right">提交数</th>
              </tr>
            </thead>
            <tbody>
              {battles.map((b) => (
                <tr key={b.slug} className="border-b border-[var(--rule)] last:border-b-0 hover:bg-[var(--surface-hover)]">
                  <td className="py-2.5 pl-4 pr-2">
                    <button
                      type="button"
                      onClick={() => onPickProblem(b.slug)}
                      className="cursor-pointer font-semibold text-[var(--ink)] hover:text-[var(--signal)] hover:underline"
                    >
                      {b.title}
                    </button>
                  </td>
                  <td className="py-2.5 px-2">
                    <DifficultyBadge difficulty={b.difficulty} />
                  </td>
                  <td className="py-2.5 px-2">
                    {b.leader ? (
                      <button
                        type="button"
                        onClick={() => onOpenTeam(b.leader!.teamKey)}
                        className="cursor-pointer text-left hover:underline"
                      >
                        <span className="font-medium text-[var(--ink)]">{b.leader.name}</span>
                        <span className="num ml-1.5 font-semibold text-[var(--signal)]">{fmtScore(b.leader.score)}</span>
                      </button>
                    ) : (
                      <span className="text-[var(--ink-3)]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {b.runnerUp ? (
                      <button
                        type="button"
                        onClick={() => onOpenTeam(b.runnerUp!.teamKey)}
                        className="cursor-pointer text-left text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
                      >
                        <span>{b.runnerUp.name}</span>
                        <span className="num ml-1.5 text-[var(--ink-3)]">{fmtScore(b.runnerUp.score)}</span>
                      </button>
                    ) : (
                      <span className="text-[var(--ink-3)]">—</span>
                    )}
                  </td>
                  <td className="num py-2.5 px-2 text-right">
                    {b.leadMargin != null ? (
                      <span className={b.leadMargin <= 1.5 ? 'font-semibold text-[var(--signal)]' : 'text-[var(--ink-2)]'}>
                        +{fmtScore(b.leadMargin)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num py-2.5 px-2 text-right">
                    {b.headroomTo100 != null ? (
                      <span className={b.headroomTo100 >= 20 ? 'font-medium text-[var(--gold)]' : 'text-[var(--ink-2)]'}>
                        {fmtScore(b.headroomTo100)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num py-2.5 px-2 text-right text-[var(--ink-2)]">{fmtScore(b.top10Cutoff)}</td>
                  <td className="num py-2.5 px-2 text-right text-[var(--ink-2)]">{fmtPct(b.passCount, b.attemptCount)}</td>
                  <td className="num py-2.5 pl-2 pr-4 text-right text-[var(--ink-3)]">{fmtInt(b.submissionCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom 2-col: Crown Holders + Near-Sweep Teams */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="editorial-panel overflow-hidden">
          <div className="border-b border-[var(--rule)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--ink)]">榜首奖励归属榜</h3>
            <p className="mt-0.5 text-xs text-[var(--ink-2)]">共 {crownHolders.length} 支队伍瓜分 10 道题的榜首加分</p>
          </div>
          <div className="divide-y divide-[var(--rule)]">
            {crownHolders.map((t) => {
              const ledOps = snap.problems.filter((p) => t.problems[p.meta.slug]?.isLeader);
              return (
                <div
                  key={t.teamKey}
                  onClick={() => onOpenTeam(t.teamKey)}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--surface-hover)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RankMark rank={t.rank} />
                      <span className="truncate text-[13px] font-semibold text-[var(--ink)]">{t.name}</span>
                      <CrownPill bonus={t.leaderBonus} count={t.leaderCount} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 pl-8">
                      {ledOps.map((p) => (
                        <span
                          key={p.meta.slug}
                          className="num rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10.5px] text-[var(--ink-2)]"
                        >
                          {p.meta.title} ×{p.meta.difficulty}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="num shrink-0 text-right">
                    <div className="text-sm font-semibold text-[var(--ink)]">{fmtScore(t.score)}</div>
                    <div className="text-[10.5px] text-[var(--ink-3)]">基础 {fmtScore(t.weightedScore)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="editorial-panel overflow-hidden">
          <div className="border-b border-[var(--rule)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--ink)]">冲刺 10 题全通观察</h3>
            <p className="mt-0.5 text-xs text-[var(--ink-2)]">已过 8–9 题、仅差 1–2 道算子即可全通的队伍（按总分排前 30）</p>
          </div>
          <div className="max-h-[420px] divide-y divide-[var(--rule)] overflow-y-auto">
            {nearSweep.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--ink-3)]">暂无 8–9 题队伍</div>
            ) : (
              nearSweep.map(({ team, missingSlugs }) => (
                <div
                  key={team.teamKey}
                  onClick={() => onOpenTeam(team.teamKey)}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--surface-hover)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RankMark rank={team.rank} />
                      <span className="truncate text-[13px] font-medium text-[var(--ink)]">{team.name}</span>
                      <span className="num text-[11px] text-[var(--ink-3)]">{team.passCount}/10</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 pl-8 text-[10.5px] text-[var(--ink-2)]">
                      <span className="text-[var(--ink-3)]">待破：</span>
                      {missingSlugs.map((m) => (
                        <span key={m.slug} className="num rounded border border-[var(--rule)] px-1.5 py-0.5">
                          {m.title} ×{m.difficulty}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="num shrink-0 text-sm font-semibold text-[var(--ink)]">{fmtScore(team.score)}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
