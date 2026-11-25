import { useMemo, useState } from 'react';
import { fmtInt, fmtPct, fmtRatio, fmtScore, fmtTime, fmtUs } from '../../shared/format.ts';
import { searchProblemRows, visibleEfficiencyOf } from '../../shared/insights.ts';
import type { ProblemBoard, Snapshot } from '../../shared/types.ts';
import { csvUrl, hit } from '../lib/api.ts';
import { useStars } from '../lib/stars.ts';
import { CrownPill, cx, DifficultyBadge, EmptyState, RankMark, StarButton } from './ui.tsx';

export function ProblemBoardView({
  snap,
  slug,
  query,
  onPickProblem,
  onQuery,
  onOpenTeam,
}: {
  snap: Snapshot;
  slug: string;
  query: string;
  onPickProblem: (slug: string) => void;
  onQuery: (q: string) => void;
  onOpenTeam: (teamKey: string) => void;
}) {
  const [limit, setLimit] = useState(100);
  const { set: starSet, toggle } = useStars();

  const board: ProblemBoard | undefined = useMemo(
    () => snap.problems.find((p) => p.meta.slug === slug) ?? snap.problems[0],
    [snap.problems, slug],
  );

  const filtered = useMemo(
    () => (board ? searchProblemRows(board.rows, query) : []),
    [board, query],
  );

  if (!board) return <EmptyState>暂无算子题目数据</EmptyState>;

  const shown = filtered.slice(0, limit);
  const { meta } = board;
  const visible = meta.visibleTestcases;
  const leader = board.rows[0] ?? null;

  return (
    <div className="space-y-4">
      {/* 10-Operator Selector Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {snap.problems.map((pb) => {
          const active = pb.meta.slug === board.meta.slug;
          const top = pb.rows[0];
          const passPct = pb.meta.attemptCount ? Math.min(100, (pb.meta.passCount / pb.meta.attemptCount) * 100) : 0;
          return (
            <button
              key={pb.meta.slug}
              type="button"
              onClick={() => {
                onPickProblem(pb.meta.slug);
                setLimit(100);
              }}
              className={cx(
                'cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-[var(--signal)] bg-[var(--surface)] shadow-[inset_0_0_0_1px_var(--signal)]'
                  : 'border-[var(--rule)] bg-[var(--surface)] hover:border-[var(--rule-strong)]',
              )}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate text-xs font-semibold text-[var(--ink)]">{pb.meta.title}</span>
                <DifficultyBadge difficulty={pb.meta.difficulty} compact />
              </div>
              <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div
                  className={active ? 'h-full bg-[var(--signal)]' : 'h-full bg-[var(--ink-2)]'}
                  style={{ width: `${passPct}%` }}
                />
              </div>
              <div className="num mt-1.5 flex items-center justify-between text-[10.5px] text-[var(--ink-3)]">
                <span className="text-[var(--ink-2)]">{top ? fmtScore(top.score) : '—'}</span>
                <span>{fmtInt(pb.reportedTotal || pb.rows.length)} 队</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Problem Editorial Header */}
      <div className="editorial-panel px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">{meta.title}</h2>
              <DifficultyBadge difficulty={meta.difficulty} />
              <span className="num text-xs text-[var(--ink-3)]">
                公开 {visible.length} / 共 {meta.totalTestcases} 用例 · CANN {meta.cannVersion || '9.1.0'}
              </span>
            </div>
            <div className="num mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
              <span>
                榜首 <strong className="text-[var(--ink)]">{leader ? `${leader.name} (${fmtScore(leader.score)})` : '—'}</strong>
              </span>
              <span>
                通过率 <strong className="text-[var(--ink)]">{fmtPct(meta.passCount, meta.attemptCount)}</strong>（{fmtInt(meta.passCount)} / {fmtInt(meta.attemptCount)}）
              </span>
              <span>
                提交 <strong className="text-[var(--ink)]">{fmtInt(meta.submissionCount)}</strong> 次
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={meta.sourceUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => hit({ k: 'out', t: meta.slug })}
              className="editorial-btn px-2.5 py-1 text-xs"
            >
              原题页 ↗
            </a>
            <a
              href={csvUrl(meta.slug)}
              download
              onClick={() => hit({ k: 'csv', t: meta.slug })}
              className="editorial-btn px-2.5 py-1 text-xs"
            >
              CSV
            </a>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setLimit(100);
          }}
          placeholder="搜索队名 / 提交者昵称 / ID"
          className="editorial-input w-64"
          aria-label="搜索单题排行榜"
        />
        <div className="num text-xs text-[var(--ink-3)]">
          单题分随 50 用例全场最优 tbest 动态重算 · 倍率 ≤1.05× <span className="text-[var(--pass)]">绿标</span>
        </div>
      </div>

      {/* Problem Ranking Table */}
      <div className="editorial-panel overflow-hidden">
        {board.error && (
          <div className="border-b border-[var(--rule)] bg-[var(--gold-soft)] px-4 py-2 text-xs text-[var(--gold)]">
            {board.stale ? '该题刷新受阻，暂显示上一版缓存：' : '该题抓取失败：'}
            {board.error}
          </div>
        )}
        {!shown.length ? (
          <EmptyState>没有找到匹配的记录</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--ink-3)]">
                  <th className="w-10 py-2.5 pl-3 pr-1"></th>
                  <th className="w-14 py-2.5 px-2">名次</th>
                  <th className="py-2.5 px-2">队伍 / 最新提交者</th>
                  <th className="py-2.5 px-2 text-right">得分</th>
                  <th className="py-2.5 px-2 text-right" title="公开 5 用例平均效率 avg(100×tbest/t) 及与 50 用例总分的偏差（透视 45 个隐藏用例泛化表现）">
                    <div className="text-[var(--ink-2)]">公开效率</div>
                    <div className="num text-[10px] font-normal text-[var(--ink-3)]">隐藏偏差</div>
                  </th>
                  {visible.map((tc) => (
                    <th key={tc.id} className="py-2 px-2 text-right">
                      <div className="text-[var(--ink-2)]">Case {tc.index}</div>
                      <div className="num text-[10px] font-normal text-[var(--ink-3)]">
                        best {tc.tbest != null ? fmtUs(tc.tbest) : '—'}
                      </div>
                    </th>
                  ))}
                  <th className="py-2.5 pl-2 pr-4 text-right">提交时间</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const starred = starSet.has(r.teamKey);
                  const eff = visibleEfficiencyOf(r);
                  return (
                    <tr
                      key={`${r.teamKey}-${r.rank}`}
                      onClick={() => onOpenTeam(r.teamKey)}
                      className={cx(
                        'cv-row cursor-pointer border-b border-[var(--rule)] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]',
                        starred && 'bg-[var(--signal-soft)]/50',
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
                          {r.rank === 1 && <CrownPill bonus={meta.difficulty * 10} />}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                          {r.submitter}
                          {r.displayId != null && <span className="num ml-1.5">· ID {r.displayId}</span>}
                        </div>
                      </td>
                      <td className="num py-2.5 px-2 text-right">
                        <div className="text-[13.5px] font-semibold text-[var(--ink)]">{fmtScore(r.score)}</div>
                        <div className="text-[10.5px] text-[var(--ink-3)]">加权 {fmtScore(r.score * meta.difficulty)}</div>
                      </td>
                      <td className="num py-2.5 px-2 text-right" title="公开 5 用例均效率 avg(100×tbest/t)；下方为「综合得分 − 公开效率」，负值越小说明 45 个隐藏用例泛化越好">
                        <div className="text-[12px] text-[var(--ink)]">
                          {eff.visibleEffPct != null ? `${eff.visibleEffPct.toFixed(1)}%` : '—'}
                        </div>
                        <div
                          className={cx(
                            'text-[10.5px]',
                            eff.hiddenDelta == null
                              ? 'text-[var(--ink-3)]'
                              : eff.hiddenDelta >= -8
                                ? 'text-[var(--pass)]'
                                : eff.hiddenDelta <= -18
                                  ? 'text-[var(--signal)]/85'
                                  : 'text-[var(--ink-3)]',
                          )}
                        >
                          {eff.hiddenDelta != null ? `${eff.hiddenDelta > 0 ? '+' : ''}${eff.hiddenDelta.toFixed(1)}` : '—'}
                        </div>
                      </td>
                      {visible.map((tc, idx) => {
                        const m = r.testcases[idx];
                        const nearBest = m?.ratio != null && m.ratio <= 1.05;
                        const slow = m?.ratio != null && m.ratio >= 2.0;
                        return (
                          <td key={tc.id} className="num py-2.5 px-2 text-right">
                            <div className="text-[12px] text-[var(--ink)]">{fmtUs(m?.time)}</div>
                            <div
                              className={cx(
                                'text-[10.5px]',
                                nearBest
                                  ? 'font-semibold text-[var(--pass)]'
                                  : slow
                                    ? 'text-[var(--signal)]/80'
                                    : 'text-[var(--ink-3)]',
                              )}
                            >
                              {fmtRatio(m?.ratio)}
                            </div>
                          </td>
                        );
                      })}
                      <td className="num py-2.5 pl-2 pr-4 text-right text-xs text-[var(--ink-2)]">
                        {fmtTime(r.submittedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > limit && (
          <div className="border-t border-[var(--rule)] px-4 py-3 text-center">
            <button type="button" className="editorial-btn px-4 py-1.5 text-xs" onClick={() => setLimit((n) => n + 150)}>
              加载更多（已显示 {shown.length} / {filtered.length}）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
