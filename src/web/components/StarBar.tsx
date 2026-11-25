import { fmtScore } from '../../shared/format.ts';
import { nextTierForRow } from '../../shared/insights.ts';
import type { Snapshot } from '../../shared/types.ts';
import { useStars } from '../lib/stars.ts';
import { CrownPill } from './ui.tsx';

export function StarBar({ snap, onOpenTeam }: { snap: Snapshot; onOpenTeam: (key: string) => void }) {
  const { keys, toggle, clear } = useStars();
  if (!keys.length) return null;

  const starredRows = keys
    .map((k) => snap.total.rows.find((r) => r.teamKey === k))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (!starredRows.length) return null;
  const topScore = snap.total.rows[0]?.score ?? 0;

  return (
    <section className="editorial-panel px-4 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--ink-2)]">
          <span className="text-[var(--signal)]">★</span>
          <span>已关注队伍（{starredRows.length}）</span>
          <span className="hidden text-[11px] text-[var(--ink-3)] sm:inline">· 仅保存在本地浏览器，点击查看 10 题提分诊断</span>
        </div>
        <button
          type="button"
          onClick={clear}
          className="cursor-pointer text-[11px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
        >
          清空
        </button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {starredRows.map((r) => {
          const tier = nextTierForRow(r, snap.total.rows);
          const gapTop = Math.max(0, topScore - r.score);
          return (
            <div
              key={r.teamKey}
              onClick={() => onOpenTeam(r.teamKey)}
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 transition-colors hover:border-[var(--rule-strong)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="num text-xs font-bold text-[var(--signal)]">#{r.rank}</span>
                  <span className="truncate text-[13px] font-semibold text-[var(--ink)] group-hover:underline">
                    {r.name}
                  </span>
                  <CrownPill bonus={r.leaderBonus} count={r.leaderCount} />
                </div>
                <div className="num mt-0.5 text-[11px] text-[var(--ink-3)]">
                  通过 {r.passCount}/{snap.problems.length}
                  {tier ? ` · 距 #${tier.targetRank} 差 ${fmtScore(tier.gap)}` : r.rank === 1 ? ' · 当前领跑全场' : ''}
                  {r.rank > 1 && gapTop > 0 && tier?.targetRank !== 1 ? ` · 距榜首 ${fmtScore(gapTop)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="num text-base font-semibold text-[var(--ink)]">{fmtScore(r.score)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(r.teamKey);
                  }}
                  aria-label={`取消关注 ${r.name}`}
                  className="cursor-pointer px-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
