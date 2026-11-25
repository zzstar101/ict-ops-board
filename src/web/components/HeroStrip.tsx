import { contestProgress, fmtCompact, fmtFullTime, fmtInt, fmtScore } from '../../shared/format.ts';
import type { Snapshot } from '../../shared/types.ts';
import { useNow } from '../lib/hooks.ts';

export function HeroStrip({ snap, onOpenTeam }: { snap: Snapshot; onOpenTeam: (key: string) => void }) {
  const now = useNow(60_000);
  const { contest, total, problems } = snap;
  const topTeam = total.rows[0] ?? null;
  const fullPassCount = total.rows.filter((r) => r.passCount >= problems.length && problems.length > 0).length;
  const scoredCount = total.rows.filter((r) => r.score > 0).length;
  const prog = contestProgress(contest.startTime, contest.endTime, now);
  const cannVer = problems[0]?.meta.cannVersion || '9.1.0';
  const totalWeight = problems.reduce((s, p) => s + p.meta.difficulty, 0);

  return (
    <section className="border-b border-[var(--rule)] bg-[var(--surface)]">
      <div className="mx-auto max-w-[1360px] px-4 pt-6 pb-5 sm:px-6 sm:pt-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="kicker">
            HUAWEI ICT COMPETITION · ASCEND C FINALS · CANN {cannVer}
          </div>
          <div className="num flex items-center gap-3 text-[11.5px] text-[var(--ink-3)]">
            <span>总权重 ×{totalWeight} + 榜首奖 +{totalWeight * 10}</span>
            {contest.dailyLimit != null && <span className="hidden sm:inline">每日上限 {contest.dailyLimit} 次</span>}
            <a
              href={contest.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-[var(--rule-strong)] underline-offset-4 transition-colors hover:text-[var(--ink)]"
            >
              官方原页 ↗
            </a>
          </div>
        </div>

        <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
              {contest.title}
            </h1>
            <p className="mt-1 text-xs text-[var(--ink-2)]">
              总分 = <span className="num text-[var(--ink)]">Σ(难度系数 × 单题得分) + Σ(单题第 1 名 × 10 × 难度)</span> · 单题分随各用例全场最优 <span className="num text-[var(--ink)]">tbest</span> 动态重算
            </p>
          </div>
          <div className="w-full sm:w-56">
            <div className="num flex items-center justify-between text-[11px] text-[var(--ink-2)]">
              <span>{prog.status === 'active' ? `距截榜剩余 ${prog.remainDays} 天` : prog.status === 'ended' ? '赛事已结束' : '尚未开赛'}</span>
              <span>{prog.pct.toFixed(0)}%</span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div className="h-full bg-[var(--signal)] transition-all" style={{ width: `${Math.min(100, Math.max(2, prog.pct))}%` }} />
            </div>
            <div className="num mt-1 flex justify-between text-[10px] text-[var(--ink-3)]">
              <span>{fmtFullTime(contest.startTime).slice(0, 10)}</span>
              <span>{fmtFullTime(contest.endTime).slice(0, 10)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--rule)] pt-4 lg:grid-cols-4">
          <div>
            <div className="text-xs text-[var(--ink-2)]">当前最高总分</div>
            <div className="num mt-1 flex items-baseline gap-1 text-2xl font-light tracking-tight text-[var(--ink)] sm:text-[28px]">
              {topTeam ? (
                <>
                  <span>{Math.floor(topTeam.score).toLocaleString('zh-CN')}</span>
                  <span className="text-base text-[var(--ink-3)]">.{(topTeam.score % 1).toFixed(2).slice(2)}</span>
                </>
              ) : (
                '—'
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-[var(--ink-2)]">
              {topTeam ? (
                <button
                  type="button"
                  onClick={() => onOpenTeam(topTeam.teamKey)}
                  className="cursor-pointer font-medium text-[var(--signal)] hover:underline"
                >
                  {topTeam.name}
                </button>
              ) : (
                '暂无'
              )}
              {topTeam && topTeam.leaderBonus > 0 && (
                <span className="num ml-1.5 text-[11px] text-[var(--ink-3)]">含 +{topTeam.leaderBonus} 榜首奖</span>
              )}
            </div>
          </div>

          <div className="border-l border-[var(--rule)] pl-5 max-lg:border-l max-lg:pl-4">
            <div className="text-xs text-[var(--ink-2)]">上榜 / 报名队伍</div>
            <div className="num mt-1 flex items-baseline gap-1.5 text-2xl font-light tracking-tight text-[var(--ink)] sm:text-[28px]">
              <span>{fmtInt(total.rows.length)}</span>
              {contest.participantCount > 0 && (
                <span className="text-sm text-[var(--ink-3)]">/ {fmtInt(contest.participantCount)}</span>
              )}
            </div>
            <div className="num mt-0.5 text-xs text-[var(--ink-3)]">有效得分 {fmtInt(scoredCount)} 队</div>
          </div>

          <div className="lg:border-l lg:border-[var(--rule)] lg:pl-5">
            <div className="text-xs text-[var(--ink-2)]">10 题全通队伍</div>
            <div className="num mt-1 flex items-baseline gap-1.5 text-2xl font-light tracking-tight text-[var(--ink)] sm:text-[28px]">
              <span>{fmtInt(fullPassCount)}</span>
              <span className="text-sm text-[var(--ink-3)]">队</span>
            </div>
            <div className="num mt-0.5 text-xs text-[var(--ink-3)]">
              占上榜队伍 {total.rows.length ? ((fullPassCount / total.rows.length) * 100).toFixed(1) : '0.0'}%
            </div>
          </div>

          <div className="border-l border-[var(--rule)] pl-5 max-lg:pl-4">
            <div className="text-xs text-[var(--ink-2)]">累计评测提交</div>
            <div className="num mt-1 text-2xl font-light tracking-tight text-[var(--ink)] sm:text-[28px]">
              {fmtCompact(contest.submissionCount)}
            </div>
            <div className="num mt-0.5 text-xs text-[var(--ink-3)]">
              均 {total.rows.length ? fmtScore(contest.submissionCount / total.rows.length, 0) : '—'} 次 / 上榜队
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
