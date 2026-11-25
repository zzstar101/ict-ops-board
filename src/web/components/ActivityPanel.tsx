import { useMemo, useState } from 'react';
import { fmtScore, fmtTime, timeAgo } from '../../shared/format.ts';
import { recentActivity } from '../../shared/insights.ts';
import type { Snapshot } from '../../shared/types.ts';
import { useNow } from '../lib/hooks.ts';
import { changesStore } from '../lib/live.tsx';
import { useStars } from '../lib/stars.ts';
import { DifficultyBadge, EmptyState } from './ui.tsx';

const WINDOWS = [
  { label: '近 1 小时', ms: 3600_000 },
  { label: '近 6 小时', ms: 6 * 3600_000 },
  { label: '近 24 小时', ms: 24 * 3600_000 },
  { label: '近 7 天', ms: 7 * 86_400_000 },
] as const;

export function ActivityPanel({
  snap,
  onOpenTeam,
  onPickProblem,
}: {
  snap: Snapshot;
  onOpenTeam: (teamKey: string) => void;
  onPickProblem: (slug: string) => void;
}) {
  const [windowMs, setWindowMs] = useState<number>(24 * 3600_000);
  const [slug, setSlug] = useState('');
  const [onlyStarred, setOnlyStarred] = useState(false);
  const { set: starSet } = useStars();
  const liveChanges = changesStore.use();
  const now = useNow(30_000);

  const items = useMemo(() => {
    const list = recentActivity(snap, windowMs, slug, now);
    return (onlyStarred ? list.filter((x) => starSet.has(x.teamKey)) : list).slice(0, 150);
  }, [snap, windowMs, slug, onlyStarred, starSet, now]);

  const filteredLive = useMemo(
    () => (onlyStarred ? liveChanges.filter((c) => starSet.has(c.teamKey)) : liveChanges).slice(0, 30),
    [liveChanges, onlyStarred, starSet],
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w.ms}
              type="button"
              aria-pressed={windowMs === w.ms}
              onClick={() => setWindowMs(w.ms)}
              className="editorial-btn px-2.5 py-1 text-xs"
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="editorial-input py-1 text-xs"
            aria-label="按算子筛选动态"
          >
            <option value="">全部 10 道算子</option>
            {snap.problems.map((p) => (
              <option key={p.meta.slug} value={p.meta.slug}>
                {p.meta.title} (×{p.meta.difficulty})
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={onlyStarred}
            onClick={() => setOnlyStarred((v) => !v)}
            className="editorial-btn px-2.5 py-1 text-xs"
          >
            仅看关注
          </button>
        </div>
      </div>

      {/* Live WebSocket Diffs (tbest shifts, crown changes & genuine submissions) */}
      {filteredLive.length > 0 && (
        <section className="editorial-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2.5">
            <span className="text-xs font-semibold text-[var(--signal)]">● 本次会话实时动态（{filteredLive.length}）</span>
            <span className="text-[11px] text-[var(--ink-3)]">已过滤 tbest 被动重算噪音</span>
          </div>
          <div className="divide-y divide-[var(--rule)]">
            {filteredLive.map((c) => {
              const delta = c.prevScore != null ? c.score - c.prevScore : null;
              const isTbest = c.kind === 'tbest';
              const isCrown = c.kind === 'crown';
              return (
                <div
                  key={c.id}
                  onClick={() => (isTbest ? onPickProblem(c.boardId) : c.teamKey && onOpenTeam(c.teamKey))}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs hover:bg-[var(--surface-hover)]"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className={
                        isTbest
                          ? 'rounded border border-[var(--gold-border)] bg-[var(--gold-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--gold)]'
                          : isCrown
                            ? 'rounded border border-[var(--signal-border)] bg-[var(--signal-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--signal)]'
                            : 'rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] text-[var(--ink-2)]'
                      }
                    >
                      {isTbest ? '⚡ tbest' : isCrown ? '👑 易主' : c.boardTitle}
                    </span>
                    <span className="truncate font-medium text-[var(--ink)]">{c.name}</span>
                    {!isTbest && <span className="num text-[var(--ink-3)]">#{c.rank}</span>}
                    {c.detail && <span className="text-[11px] text-[var(--ink-2)]">· {c.detail}</span>}
                  </div>
                  <div className="num flex shrink-0 items-center gap-2">
                    {!isTbest && <span className="font-semibold text-[var(--ink)]">{fmtScore(c.score)}</span>}
                    {!isTbest && delta != null && Math.abs(delta) > 0.005 && (
                      <span className={delta > 0 ? 'font-semibold text-[var(--pass)]' : 'text-[var(--signal)]'}>
                        {delta > 0 ? `+${fmtScore(delta)}` : fmtScore(delta)}
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--ink-3)]">{timeAgo(c.detectedAt, now)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Best-Submission Timeline */}
      <section className="editorial-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2.5 text-xs text-[var(--ink-2)]">
          <span>
            近期各题有效成绩刷新（共 <strong className="num text-[var(--ink)]">{items.length}</strong> 条）
          </span>
          <span className="hidden text-[11px] text-[var(--ink-3)] sm:inline">按单题最新有效提交时刻倒序</span>
        </div>
        {!items.length ? (
          <EmptyState>所选时间窗口内暂无成绩刷新记录，可切到更长时间范围查看</EmptyState>
        ) : (
          <div className="divide-y divide-[var(--rule)]">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpenTeam(item.teamKey)}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[12.5px] hover:bg-[var(--surface-hover)]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickProblem(item.slug);
                    }}
                    className="cursor-pointer rounded border border-[var(--rule)] bg-[var(--paper)] px-2 py-0.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--signal)]"
                  >
                    {item.title}
                  </button>
                  <DifficultyBadge difficulty={item.difficulty} compact />
                  <span className="truncate font-medium text-[var(--ink)]">{item.name}</span>
                  <span className="hidden text-xs text-[var(--ink-3)] sm:inline">by {item.submitter}</span>
                </div>
                <div className="num flex shrink-0 items-center gap-3 text-xs">
                  <span className={item.isLeader ? 'font-bold text-[var(--signal)]' : 'text-[var(--ink-2)]'}>
                    #{item.rank} {item.isLeader ? '👑' : ''}
                  </span>
                  <span className="font-semibold text-[var(--ink)]">{fmtScore(item.score)}</span>
                  <span className="text-[11px] text-[var(--ink-3)]" title={fmtTime(item.submittedAt, true)}>
                    {timeAgo(item.atMs, now)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
