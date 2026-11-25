import { useMemo, useState } from 'react';
import { fmtInt, fmtRatio, fmtScore, fmtTime } from '../../shared/format.ts';
import { diagnoseTeam } from '../../shared/insights.ts';
import type { Snapshot } from '../../shared/types.ts';
import { useStars } from '../lib/stars.ts';
import { CrownPill, cx, DifficultyBadge, RankMark, StarButton } from './ui.tsx';

export function TeamDialog({
  snap,
  teamKey,
  onClose,
  onPickProblem,
}: {
  snap: Snapshot;
  teamKey: string;
  onClose: () => void;
  onPickProblem: (slug: string) => void;
}) {
  const [sortBy, setSortBy] = useState<'roi' | 'name'>('roi');
  const { isStarred, toggle } = useStars();
  const diag = useMemo(() => diagnoseTeam(snap, teamKey), [snap, teamKey]);

  const openRef = (el: HTMLDialogElement | null) => {
    if (el && !el.open) {
      el.showModal();
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
  };

  const rows = useMemo(() => {
    const list = [...diag.items];
    if (sortBy === 'roi') {
      list.sort((a, b) => b.maxTotalGain - a.maxTotalGain || b.difficulty - a.difficulty);
    }
    return list;
  }, [diag.items, sortBy]);

  const { total, nextTier, syncDelta } = diag;
  const totalBonusPotential = rows.reduce((s, r) => s + r.maxTotalGain, 0);

  return (
    <dialog
      ref={openRef}
      closedby="any"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="m-auto max-h-[min(92dvh,880px)] w-[min(920px,calc(100vw-1.5rem))] rounded-xl border border-[var(--rule-strong)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-2xl"
      aria-label={total ? `${total.name} 10 题诊断` : '队伍详情'}
    >
      {!total ? (
        <div className="p-8 text-center text-sm text-[var(--ink-2)]">
          当前快照中找不到该队伍
          <div className="mt-4">
            <form method="dialog">
              <button className="editorial-btn">关闭</button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex max-h-[inherit] flex-col">
          {/* Header */}
          <header className="flex items-start justify-between gap-3 border-b border-[var(--rule)] px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <RankMark rank={total.rank} />
                <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--ink)]">{total.name}</h2>
                <StarButton on={isStarred(total.teamKey)} onClick={() => toggle(total.teamKey)} label={total.name} />
                <CrownPill bonus={total.leaderBonus} count={total.leaderCount} />
              </div>
              <div className="num mt-1 text-xs text-[var(--ink-3)]">
                {total.displayId != null ? `Team ID ${total.displayId}` : total.teamId} · 累计提交 {fmtInt(total.submissionCount)} 次 · 已通过 {total.passCount} / {snap.problems.length} 题
              </div>
            </div>
            <form method="dialog" className="contents">
              <button data-autofocus className="editorial-btn px-2.5 py-1 text-xs" aria-label="关闭">
                ✕
              </button>
            </form>
          </header>

          {/* Body */}
          <div className="overflow-y-auto px-5 py-4">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 border-b border-[var(--rule)] pb-4 sm:grid-cols-4">
              <div>
                <div className="text-[11px] text-[var(--ink-3)]">官方总分</div>
                <div className="num mt-0.5 text-xl font-semibold text-[var(--ink)]">{fmtScore(total.score)}</div>
                <div className="num text-[11px] text-[var(--ink-3)]">
                  加权 {fmtScore(total.weightedScore)} + 榜首 {total.leaderBonus}
                  {Math.abs(syncDelta) >= 0.05 && (
                    <span className="ml-1 text-[var(--gold)]" title="抓取总榜与 10 题期间恰逢 tbest 动态重算产生的瞬时差">
                      (同步差 {syncDelta > 0 ? '+' : ''}{fmtScore(syncDelta)})
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--ink-3)]">下一档差距</div>
                <div className="num mt-0.5 text-xl font-semibold text-[var(--signal)]">
                  {nextTier ? `差 ${fmtScore(nextTier.gap)}` : total.rank === 1 ? '当前第 1' : '—'}
                </div>
                <div className="num text-[11px] text-[var(--ink-3)]">
                  {nextTier ? `追平 #${nextTier.targetRank} (${fmtScore(nextTier.targetScore)})` : '已居榜首'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--ink-3)]">单题榜首数</div>
                <div className="num mt-0.5 text-xl font-semibold text-[var(--ink)]">
                  {total.leaderCount} <span className="text-xs font-normal text-[var(--ink-3)]">/ {snap.problems.length}</span>
                </div>
                <div className="num text-[11px] text-[var(--ink-3)]">榜首加分 +{total.leaderBonus}</div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--ink-3)]">全题追平榜首空间</div>
                <div className="num mt-0.5 text-xl font-semibold text-[var(--ink)]">+{fmtScore(totalBonusPotential)}</div>
                <div className="text-[11px] text-[var(--ink-3)]">含反超榜首奖励</div>
              </div>
            </div>

            {/* Table Header */}
            <div className="mt-4 mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-2)]">10 道算子逐题提分诊断</h3>
              <div className="inline-flex rounded-md border border-[var(--rule)] bg-[var(--surface-muted)] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSortBy('roi')}
                  className={cx(
                    'cursor-pointer rounded px-2 py-0.5 font-medium',
                    sortBy === 'roi' ? 'bg-[var(--surface)] text-[var(--ink)]' : 'text-[var(--ink-2)]',
                  )}
                >
                  按提分空间
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('name')}
                  className={cx(
                    'cursor-pointer rounded px-2 py-0.5 font-medium',
                    sortBy === 'name' ? 'bg-[var(--surface)] text-[var(--ink)]' : 'text-[var(--ink-2)]',
                  )}
                >
                  按题名顺序
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--ink-3)]">
                    <th className="py-2 pr-2">算子题</th>
                    <th className="py-2 px-2">权重</th>
                    <th className="py-2 px-2">单题名次</th>
                    <th className="py-2 px-2 text-right">单题分 / 榜首分</th>
                    <th className="py-2 px-2 text-right">加权贡献</th>
                    <th className="py-2 px-2 text-right">追平榜首增量</th>
                    <th className="py-2 px-2 text-right" title="公开 5 用例均效率 avg(100×tbest/t) 与隐藏偏差">公开效率 / 偏差</th>
                    <th className="py-2 pl-2 text-right">更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.slug} className="border-b border-[var(--rule)] last:border-b-0 hover:bg-[var(--surface-hover)]">
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onPickProblem(item.slug);
                          }}
                          className="cursor-pointer font-medium text-[var(--ink)] hover:text-[var(--signal)] hover:underline"
                        >
                          {item.title}
                        </button>
                      </td>
                      <td className="py-2 px-2">
                        <DifficultyBadge difficulty={item.difficulty} compact />
                      </td>
                      <td className="py-2 px-2">
                        {item.teamRank != null ? (
                          <span className={cx('num text-xs', item.isLeader ? 'font-bold text-[var(--signal)]' : 'text-[var(--ink-2)]')}>
                            #{item.teamRank} {item.isLeader ? '👑' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--ink-3)]">未上榜</span>
                        )}
                      </td>
                      <td className="num py-2 px-2 text-right">
                        <span className={item.teamScore != null ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'}>
                          {fmtScore(item.teamScore)}
                        </span>
                        <span className="text-[11px] text-[var(--ink-3)]"> / {fmtScore(item.leaderScore)}</span>
                      </td>
                      <td className="num py-2 px-2 text-right text-[var(--ink-2)]">
                        {fmtScore(item.weightedScore)}
                        {item.isLeader && <span className="ml-1 text-[10.5px] text-[var(--gold)]">+{item.crownBonus}</span>}
                      </td>
                      <td className="num py-2 px-2 text-right">
                        {item.isLeader ? (
                          <span className="text-[11px] font-medium text-[var(--pass)]">已是榜首</span>
                        ) : (
                          <span className="font-semibold text-[var(--signal)]">+{fmtScore(item.maxTotalGain)}</span>
                        )}
                      </td>
                      <td className="num py-2 px-2 text-right text-xs">
                        {item.visibleEffPct != null ? (
                          <div>
                            <span className="text-[var(--ink)]">{item.visibleEffPct.toFixed(1)}%</span>
                            <span
                              className={cx(
                                'ml-1 text-[10.5px]',
                                item.hiddenDelta != null && item.hiddenDelta >= -8
                                  ? 'text-[var(--pass)]'
                                  : item.hiddenDelta != null && item.hiddenDelta <= -18
                                    ? 'text-[var(--signal)]/85'
                                    : 'text-[var(--ink-3)]',
                              )}
                            >
                              ({item.hiddenDelta != null ? `${item.hiddenDelta > 0 ? '+' : ''}${item.hiddenDelta.toFixed(1)}` : fmtRatio(item.avgTestcaseRatio)})
                            </span>
                          </div>
                        ) : (
                          <span className="text-[var(--ink-3)]">—</span>
                        )}
                      </td>
                      <td className="num py-2 pl-2 text-right text-[11.5px] text-[var(--ink-3)]">
                        {fmtTime(item.submittedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
              「追平榜首增量」= (该题榜首分 − 本队当前分) × 难度系数 + 榜首奖励(10 × 难度)。因每道题按 50 个用例的全场最优 <span className="num">tbest</span> 动态重算，若优化出更快的 <span className="num">tbest</span> 不仅本队涨分，还会同步压低同题对手分（双向收益）。
            </p>
          </div>
        </div>
      )}
    </dialog>
  );
}
