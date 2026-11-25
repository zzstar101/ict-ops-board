import { useMemo } from 'react';
import { fmtInt, fmtPct, fmtScore } from '../../shared/format.ts';
import { computeCutoffs, scoreHistogram, TIER_RANKS } from '../../shared/insights.ts';
import type { Snapshot } from '../../shared/types.ts';
import { useStars } from '../lib/stars.ts';
import { cx } from './ui.tsx';

export function DistributionPanel({
  snap,
  onOpenTeam,
}: {
  snap: Snapshot;
  onOpenTeam: (teamKey: string) => void;
}) {
  const { keys } = useStars();
  const rows = snap.total.rows;
  const bins = useMemo(() => scoreHistogram(rows, 18), [rows]);
  const cutoffs = useMemo(() => computeCutoffs(rows, TIER_RANKS), [rows]);
  const maxBin = Math.max(1, ...bins.map((b) => b.count));

  const passDist = useMemo(() => {
    const totalOps = snap.problems.length || 10;
    const counts = Array.from({ length: totalOps + 1 }, (_, k) => ({
      pass: k,
      count: rows.filter((r) => r.passCount === k).length,
    }));
    return counts.reverse();
  }, [rows, snap.problems.length]);
  const maxPassCount = Math.max(1, ...passDist.map((d) => d.count));

  const starred = useMemo(
    () => keys.map((k) => rows.find((r) => r.teamKey === k)).filter((r): r is NonNullable<typeof r> => Boolean(r)),
    [keys, rows],
  );

  return (
    <div className="space-y-5">
      {/* Cutoffs Grid */}
      <section className="editorial-panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--ink)]">总榜关键名次分数线</h2>
          <span className="text-xs text-[var(--ink-3)]">按有效得分队伍计算</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
          {cutoffs.map((c) => (
            <div key={c.rank} className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5">
              <div className="num text-[11px] font-medium text-[var(--ink-3)]">Top {c.rank}</div>
              <div className="num mt-1 text-base font-semibold text-[var(--ink)]">{fmtScore(c.score)}</div>
              <div className="num mt-0.5 text-[10.5px] text-[var(--ink-3)]">{fmtInt(c.countAtOrAbove)} 队达线</div>
            </div>
          ))}
        </div>

        {starred.length > 0 && (
          <div className="mt-4 border-t border-[var(--rule)] pt-3">
            <div className="mb-2 text-xs font-medium text-[var(--ink-2)]">已关注队伍距各档分数线</div>
            <div className="flex flex-wrap gap-2">
              {starred.map((team) => {
                const next = cutoffs.filter((c) => c.rank < team.rank && c.score != null).slice(-1)[0];
                return (
                  <button
                    key={team.teamKey}
                    type="button"
                    onClick={() => onOpenTeam(team.teamKey)}
                    className="num cursor-pointer rounded-md border border-[var(--rule)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs text-[var(--ink)] hover:border-[var(--signal)]"
                  >
                    {team.name} (#{team.rank} · {fmtScore(team.score)})
                    {next && next.score != null && (
                      <span className="ml-1.5 text-[var(--signal)]">
                        距 Top {next.rank} 差 {fmtScore(Math.max(0, next.score - team.score))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Histogram + Pass Count Distribution */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="editorial-panel p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-[var(--ink)]">总分分布直方图</h3>
            <span className="num text-xs text-[var(--ink-3)]">有效得分 {rows.filter((r) => r.score > 0).length} 队</span>
          </div>
          <div className="flex h-52 items-end gap-1.5 border-b border-[var(--rule)] pb-2 pt-4">
            {bins.map((b) => {
              const pct = (b.count / maxBin) * 100;
              const isHigh = b.from >= (bins[bins.length - 3]?.from ?? 1500);
              return (
                <div key={b.label} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${b.label} 分：${b.count} 队`}>
                  <span className="num mb-1 text-[10px] text-[var(--ink-3)] opacity-0 transition-opacity group-hover:opacity-100">
                    {b.count}
                  </span>
                  <div
                    className={cx(
                      'w-full rounded-t-[2px] transition-opacity group-hover:opacity-85',
                      isHigh ? 'bg-[var(--signal)]' : 'bg-[var(--ink)]/75',
                    )}
                    style={{ height: `${Math.max(b.count > 0 ? 3 : 0, pct)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="num mt-1.5 flex justify-between text-[10.5px] text-[var(--ink-3)]">
            <span>0</span>
            <span>{bins[Math.floor(bins.length / 2)]?.from ?? ''}</span>
            <span>{bins[bins.length - 1]?.to ?? ''}</span>
          </div>
        </section>

        <section className="editorial-panel p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-[var(--ink)]">通关题数分布</h3>
            <span className="num text-xs text-[var(--ink-3)]">共 {fmtInt(rows.length)} 队</span>
          </div>
          <div className="space-y-2">
            {passDist.map((d) => (
              <div key={d.pass} className="flex items-center gap-2.5 text-xs">
                <span className="num w-11 shrink-0 text-right text-[var(--ink-2)]">{d.pass} 题</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-[var(--surface-muted)]">
                  <div
                    className={d.pass === snap.problems.length ? 'h-full bg-[var(--pass)]' : 'h-full bg-[var(--ink)]/70'}
                    style={{ width: `${(d.count / maxPassCount) * 100}%` }}
                  />
                </div>
                <span className="num w-18 shrink-0 text-right text-[11px] text-[var(--ink-2)]">
                  {fmtInt(d.count)} <span className="text-[var(--ink-3)]">({fmtPct(d.count, rows.length, 0)})</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
