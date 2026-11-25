import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { ActivityPanel } from '../components/ActivityPanel.tsx';
import { AnalysisPanel } from '../components/AnalysisPanel.tsx';
import { DistributionPanel } from '../components/DistributionPanel.tsx';
import { Footer } from '../components/Footer.tsx';
import { Header } from '../components/Header.tsx';
import { HeroStrip } from '../components/HeroStrip.tsx';
import { ProblemBoardView } from '../components/ProblemBoardView.tsx';
import { StarBar } from '../components/StarBar.tsx';
import { TeamDialog } from '../components/TeamDialog.tsx';
import { TotalBoardTable } from '../components/TotalBoardTable.tsx';
import { EmptyState } from '../components/ui.tsx';
import { hit } from '../lib/api.ts';
import { useLive } from '../lib/live.tsx';
import { boardRoute, type BoardSearch, type Tab } from '../router.tsx';

export function BoardPage() {
  const search = boardRoute.useSearch();
  const navigate = useNavigate({ from: '/' });
  const { data, error } = useLive();
  const snap = data?.snap;

  const setSearch = useCallback(
    (patch: Partial<BoardSearch>, replace = true) => {
      void navigate({ search: (prev: BoardSearch) => ({ ...prev, ...patch }), replace });
    },
    [navigate],
  );

  const tab: Tab = search.tab ?? 'total';
  const activeProblemSlug = search.op || snap?.problems[0]?.meta.slug || '';

  useEffect(() => {
    hit({ k: 'pv', r: typeof document !== 'undefined' ? document.referrer : '' });
  }, []);

  useEffect(() => {
    hit({ k: 'board', t: tab === 'problem' ? activeProblemSlug || 'problem' : tab });
  }, [tab, activeProblemSlug]);

  const openTeam = useCallback(
    (key: string) => {
      hit({ k: 'team', t: key.slice(0, 24) });
      setSearch({ team: key }, false);
    },
    [setSearch],
  );

  const pickProblem = useCallback(
    (slug: string) => {
      setSearch({ tab: 'problem', op: slug, q: undefined }, false);
    },
    [setSearch],
  );

  const pageTitle = snap
    ? tab === 'problem'
      ? `${snap.problems.find((p) => p.meta.slug === activeProblemSlug)?.meta.title || '单题榜'} - ICT 算子赛实时看板`
      : `${snap.contest.title} - ICT 算子赛实时看板`
    : 'ICT 算子赛实时看板';

  const navTabs: { id: Tab; label: string }[] = [
    { id: 'total', label: '总榜总览' },
    { id: 'problem', label: `单题算子榜 (${snap?.problems.length ?? 10})` },
    { id: 'analysis', label: '榜首与提分分析' },
    { id: 'dist', label: '分数分布' },
    { id: 'activity', label: '近期动态' },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <title>{pageTitle}</title>
      <Header />

      {!snap ? (
        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-6">
          <div className="editorial-panel p-6">
            {error ? (
              <EmptyState>
                <div className="font-medium text-[var(--signal)]">数据加载失败：{error.message}</div>
                <div className="mt-1 text-xs text-[var(--ink-3)]">稍后会自动重试，也可以点击右上角手动刷新</div>
              </EmptyState>
            ) : (
              <LoadingSkeleton />
            )}
          </div>
        </main>
      ) : (
        <>
          <HeroStrip snap={snap} onOpenTeam={openTeam} />

          {/* Swiss Underline Navigation Bar */}
          <div className="border-b border-[var(--rule)] bg-[var(--surface)]">
            <nav
              className="mx-auto flex max-w-[1360px] gap-6 overflow-x-auto px-4 sm:px-6"
              role="tablist"
              aria-label="看板视图"
            >
              {navTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className="editorial-tab"
                  onClick={() => setSearch({ tab: t.id === 'total' ? undefined : t.id, q: undefined }, false)}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <main className="mx-auto w-full max-w-[1360px] flex-1 space-y-5 px-4 py-5 sm:px-6">
            {snap.total.error && (
              <div className="rounded-lg border border-[var(--gold-border)] bg-[var(--gold-soft)] px-4 py-2.5 text-xs text-[var(--gold)]">
                {snap.total.stale ? '上游刷新波动，当前展示上一份缓存：' : '总榜抓取失败：'}
                {snap.total.error}
              </div>
            )}

            <StarBar snap={snap} onOpenTeam={openTeam} />

            {tab === 'total' && (
              <TotalBoardTable
                snap={snap}
                query={search.q || ''}
                onQuery={(q) => setSearch({ q: q || undefined })}
                onOpenTeam={openTeam}
                onPickProblem={pickProblem}
              />
            )}

            {tab === 'problem' && (
              <ProblemBoardView
                snap={snap}
                slug={activeProblemSlug}
                query={search.q || ''}
                onPickProblem={(slug) => setSearch({ op: slug, q: undefined }, false)}
                onQuery={(q) => setSearch({ q: q || undefined })}
                onOpenTeam={openTeam}
              />
            )}

            {tab === 'analysis' && (
              <AnalysisPanel snap={snap} onOpenTeam={openTeam} onPickProblem={pickProblem} />
            )}

            {tab === 'dist' && <DistributionPanel snap={snap} onOpenTeam={openTeam} />}

            {tab === 'activity' && (
              <ActivityPanel snap={snap} onOpenTeam={openTeam} onPickProblem={pickProblem} />
            )}
          </main>

          {search.team && (
            <TeamDialog
              snap={snap}
              teamKey={search.team}
              onClose={() => setSearch({ team: undefined })}
              onPickProblem={pickProblem}
            />
          )}
        </>
      )}

      <Footer />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-4" aria-busy="true" aria-label="正在加载">
      <div className="h-5 w-1/3 rounded bg-[var(--surface-muted)]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded bg-[var(--surface-muted)]" />
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-10 rounded bg-[var(--surface-muted)]" />
      ))}
      <p className="pt-2 text-center text-xs text-[var(--ink-3)]">
        正在从 CANNJudge 拉取总榜与全部 10 道算子单题榜（首次约需数秒）…
      </p>
    </div>
  );
}
