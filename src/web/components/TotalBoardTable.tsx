import { useMemo, useState } from 'react';
import { fmtInt, fmtScore, timeAgo } from '../../shared/format.ts';
import { searchTotalRows } from '../../shared/insights.ts';
import type { ProblemBoard, Snapshot, TotalRow } from '../../shared/types.ts';
import { csvUrl, hit } from '../lib/api.ts';
import { CHANGE_TTL_MS, changesStore } from '../lib/live.tsx';
import { useStars } from '../lib/stars.ts';
import { CrownPill, cx, EmptyState, RankMark, StarButton } from './ui.tsx';

type TotalFilter = 'all' | 'full' | 'leaders' | 'starred';
type ViewMode = 'spark' | 'matrix';

export function TotalBoardTable({
  snap,
  query,
  onQuery,
  onOpenTeam,
  onPickProblem,
}: {
  snap: Snapshot;
  query: string;
  onQuery: (q: string) => void;
  onOpenTeam: (teamKey: string) => void;
  onPickProblem: (slug: string) => void;
}) {
  const [filter, setFilter] = useState<TotalFilter>('all');
  const [mode, setMode] = useState<ViewMode>('spark');
  const [limit, setLimit] = useState(120);
  const { set: starSet, toggle } = useStars();
  const changes = changesStore.use();

  const recentDiffs = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, { scoreDelta: number; rankDelta: number }>();
    for (const c of changes) {
      if (c.boardId !== 'total' || c.kind === 'tbest' || now - c.detectedAt > CHANGE_TTL_MS) continue;
      if (map.has(c.teamKey)) continue;
      map.set(c.teamKey, {
        scoreDelta: c.prevScore != null ? c.score - c.prevScore : c.score,
        rankDelta: c.prevRank != null ? c.prevRank - c.rank : 0,
      });
    }
    return map;
  }, [changes]);

  const filtered = useMemo(() => {
    let rows = searchTotalRows(snap.total.rows, query);
    if (filter === 'full') rows = rows.filter((r) => r.passCount >= snap.problems.length);
    else if (filter === 'leaders') rows = rows.filter((r) => r.leaderCount > 0);
    else if (filter === 'starred') rows = rows.filter((r) => starSet.has(r.teamKey));
    return rows;
  }, [snap.total.rows, snap.problems.length, query, filter, starSet]);

  const shown = filtered.slice(0, limit);
  const topScore = snap.total.rows[0]?.score ?? 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              onQuery(e.target.value);
              setLimit(120);
            }}
            placeholder="搜索队名 / 队伍 ID（空格多词）"
            className="editorial-input w-56 sm:w-64"
            aria-label="搜索队伍"
          />
          <div className="inline-flex flex-wrap items-center gap-1">
            {(
              [
                ['all', '全部'],
                ['full', '10题全通'],
                ['leaders', '手握榜首'],
                ['starred', `已关注${starSet.size ? ` (${starSet.size})` : ''}`],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filter === k}
                onClick={() => {
                  setFilter(k);
                  setLimit(120);
                }}
                className="editorial-btn px-2.5 py-1 text-xs"
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--rule)] bg-[var(--surface-muted)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('spark')}
              className={cx(
                'cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors',
                mode === 'spark' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-2)] hover:text-[var(--ink)]',
              )}
            >
              轮廓视图
            </button>
            <button
              type="button"
              onClick={() => setMode('matrix')}
              className={cx(
                'cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors',
                mode === 'matrix' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-2)] hover:text-[var(--ink)]',
              )}
            >
              10题矩阵
            </button>
          </div>
          <a
            href={csvUrl('total')}
            download
            onClick={() => hit({ k: 'csv', t: 'total' })}
            className="editorial-btn px-2.5 py-1 text-xs"
            title="导出完整总榜与 10 道算子得分（UTF-8 CSV）"
          >
            CSV
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="editorial-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2 text-xs text-[var(--ink-2)]">
          <span>
            共 <strong className="num text-[var(--ink)]">{fmtInt(filtered.length)}</strong> 支队伍
            {mode === 'spark' ? ' · 柱条为 10 题得分轮廓（红=单题第 1）' : ' · 点击表头算子名进入单题耗时榜'}
          </span>
          <span className="hidden text-[11px] text-[var(--ink-3)] sm:inline">点击任意队伍查看 10 题提分诊断</span>
        </div>

        {!shown.length ? (
          <EmptyState>没有符合条件的队伍</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            {mode === 'spark' ? (
              <table className="w-full min-w-[680px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--ink-3)]">
                    <th className="w-10 py-2.5 pl-3 pr-1"></th>
                    <th className="w-14 py-2.5 px-2">名次</th>
                    <th className="py-2.5 px-2">队伍</th>
                    <th className="py-2.5 px-2 text-right">加权总分</th>
                    <th className="py-2.5 px-3">10 题得分轮廓</th>
                    <th className="py-2.5 px-2 text-right">通过</th>
                    <th className="py-2.5 px-2 text-right">提交</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">距上一档</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => {
                    const prev = i > 0 ? shown[i - 1] : null;
                    const diff = recentDiffs.get(r.teamKey);
                    const starred = starSet.has(r.teamKey);
                    const gapLabel =
                      r.rank === 1
                        ? shown[1]
                          ? `领先 +${fmtScore(r.score - shown[1].score)}`
                          : '领跑'
                        : prev && filter === 'all' && !query
                          ? `-${fmtScore(Math.max(0, prev.score - r.score))}`
                          : `-${fmtScore(Math.max(0, topScore - r.score))}`;

                    return (
                      <tr
                        key={r.teamKey}
                        onClick={() => onOpenTeam(r.teamKey)}
                        className={cx(
                          'cv-row cursor-pointer border-b border-[var(--rule)] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]',
                          starred && 'bg-[var(--signal-soft)]/50',
                          diff && 'flash-row',
                        )}
                      >
                        <td className="py-2.5 pl-3 pr-1">
                          <StarButton on={starred} onClick={() => toggle(r.teamKey)} label={r.name} />
                        </td>
                        <td className="py-2.5 px-2">
                          <RankMark rank={r.rank} />
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-[var(--ink)]">{r.name}</span>
                            <CrownPill bonus={r.leaderBonus} count={r.leaderCount} />
                            {diff && diff.scoreDelta > 0 && (
                              <span className="num rounded bg-[var(--pass-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--pass)]">
                                +{fmtScore(diff.scoreDelta)}
                              </span>
                            )}
                          </div>
                          <div className="num mt-0.5 text-[11px] text-[var(--ink-3)]">
                            {r.displayId != null ? `ID ${r.displayId}` : ''}
                            {r.latestSubmitAt ? `${r.displayId != null ? ' · ' : ''}更新于 ${timeAgo(r.latestSubmitAt)}` : ''}
                          </div>
                        </td>
                        <td className="num py-2.5 px-2 text-right">
                          <div className="text-[14px] font-semibold text-[var(--ink)]">{fmtScore(r.score)}</div>
                          {r.leaderBonus > 0 && (
                            <div className="text-[10.5px] text-[var(--ink-3)]">加权 {fmtScore(r.weightedScore)}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <Sparkbar row={r} problems={snap.problems} />
                        </td>
                        <td className="num py-2.5 px-2 text-right">
                          <span className={r.passCount >= snap.problems.length ? 'font-semibold text-[var(--pass)]' : 'text-[var(--ink-2)]'}>
                            {r.passCount}/{snap.problems.length}
                          </span>
                        </td>
                        <td className="num py-2.5 px-2 text-right text-xs text-[var(--ink-2)]">{fmtInt(r.submissionCount)}</td>
                        <td
                          className={cx(
                            'num py-2.5 pl-2 pr-4 text-right text-xs',
                            r.rank === 1 ? 'font-medium text-[var(--signal)]' : 'text-[var(--ink-3)]',
                          )}
                        >
                          {gapLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[1040px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--rule)] text-[10.5px] font-medium text-[var(--ink-3)]">
                    <th className="sticky left-0 z-10 w-10 bg-[var(--surface)] py-2.5 pl-3 pr-1"></th>
                    <th className="sticky left-10 z-10 w-12 bg-[var(--surface)] py-2.5 px-1.5">#</th>
                    <th className="sticky left-22 z-10 min-w-[155px] border-r border-[var(--rule)] bg-[var(--surface)] py-2.5 px-2">队伍</th>
                    <th className="py-2.5 px-2 text-right">总分</th>
                    {snap.problems.map((pb) => (
                      <th key={pb.meta.slug} className="py-2 px-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => onPickProblem(pb.meta.slug)}
                          className="cursor-pointer transition-colors hover:text-[var(--signal)]"
                          title={`查看 ${pb.meta.title} 单题榜（权重 ×${pb.meta.difficulty}）`}
                        >
                          <div className="max-w-[74px] truncate font-medium text-[var(--ink-2)]">{pb.meta.title}</div>
                          <div className="num text-[10px] text-[var(--ink-3)]">×{pb.meta.difficulty}</div>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const starred = starSet.has(r.teamKey);
                    return (
                      <tr
                        key={r.teamKey}
                        onClick={() => onOpenTeam(r.teamKey)}
                        className={cx(
                          'cv-row cursor-pointer border-b border-[var(--rule)] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]',
                          starred && 'bg-[var(--signal-soft)]/45',
                        )}
                      >
                        <td className="sticky left-0 z-10 bg-[var(--surface)] py-2 pl-3 pr-1">
                          <StarButton on={starred} onClick={() => toggle(r.teamKey)} label={r.name} />
                        </td>
                        <td className="sticky left-10 z-10 bg-[var(--surface)] py-2 px-1.5">
                          <RankMark rank={r.rank} />
                        </td>
                        <td className="sticky left-22 z-10 max-w-[190px] truncate border-r border-[var(--rule)] bg-[var(--surface)] py-2 px-2">
                          <span className="font-medium text-[var(--ink)]">{r.name}</span>
                          {r.leaderBonus > 0 && <span className="ml-1.5"><CrownPill bonus={r.leaderBonus} /></span>}
                        </td>
                        <td className="num py-2 px-2 text-right font-semibold text-[var(--ink)]">{fmtScore(r.score)}</td>
                        {snap.problems.map((pb) => {
                          const cell = r.problems[pb.meta.slug];
                          if (!cell) {
                            return (
                              <td key={pb.meta.slug} className="num py-2 px-1 text-center text-[11px] text-[var(--ink-3)]/60">
                                —
                              </td>
                            );
                          }
                          return (
                            <td key={pb.meta.slug} className="py-2 px-1 text-center">
                              <span
                                className={cx(
                                  'num inline-block min-w-[44px] rounded px-1.5 py-0.5 text-[11.5px]',
                                  cell.isLeader
                                    ? 'border border-[var(--signal-border)] bg-[var(--signal-soft)] font-bold text-[var(--signal)]'
                                    : cell.score >= 80
                                      ? 'bg-[var(--surface-muted)] font-semibold text-[var(--ink)]'
                                      : 'text-[var(--ink-2)]',
                                )}
                                title={`${pb.meta.title}: ${fmtScore(cell.score)} 分（单题 #${cell.rank}，加权 ${fmtScore(cell.score * pb.meta.difficulty)}）`}
                              >
                                {cell.score.toFixed(1)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {filtered.length > limit && (
          <div className="border-t border-[var(--rule)] px-4 py-3 text-center">
            <button
              type="button"
              className="editorial-btn px-4 py-1.5 text-xs"
              onClick={() => setLimit((n) => n + 150)}
            >
              加载更多（已显示 {shown.length} / {filtered.length}）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Sparkbar({ row, problems }: { row: TotalRow; problems: ProblemBoard[] }) {
  const scores = problems.map((p) => row.problems[p.meta.slug]?.score ?? 0);
  const passed = scores.filter((s) => s > 0);
  const avg = passed.length ? passed.reduce((a, b) => a + b, 0) / passed.length : null;

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-5 items-end gap-[3px]" aria-label="10 道算子得分柱状轮廓">
        {problems.map((pb) => {
          const cell = row.problems[pb.meta.slug];
          const score = cell?.score ?? 0;
          const h = score > 0 ? Math.max(3, Math.round((Math.min(100, score) / 100) * 20)) : 2;
          return (
            <span
              key={pb.meta.slug}
              style={{ height: `${h}px` }}
              title={`${pb.meta.title} (×${pb.meta.difficulty}): ${cell ? `${fmtScore(cell.score)} 分 · #${cell.rank}${cell.isLeader ? ' 👑榜首' : ''}` : '暂无通过成绩'}`}
              className={cx(
                'block w-[7px] rounded-t-[1.5px] transition-opacity',
                cell?.isLeader
                  ? 'bg-[var(--signal)]'
                  : score >= 78
                    ? 'bg-[var(--ink)]'
                    : score > 0
                      ? 'bg-[var(--rule-strong)]'
                      : 'bg-[var(--rule)]/70',
              )}
            />
          );
        })}
      </div>
      <span className="num text-[11px] text-[var(--ink-3)]">{avg != null ? `均 ${avg.toFixed(1)}` : '—'}</span>
    </div>
  );
}
