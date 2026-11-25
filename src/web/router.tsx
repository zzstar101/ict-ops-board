import { createRootRoute, createRoute, createRouter, Outlet, useRouterState } from '@tanstack/react-router';
import { BASEPATH } from './lib/config.ts';
import { LiveProvider } from './lib/live.tsx';
import { BoardPage } from './pages/BoardPage.tsx';
import { McpPage } from './pages/McpPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';

export const TABS = ['total', 'problem', 'analysis', 'dist', 'activity'] as const;
export type Tab = (typeof TABS)[number];

export interface BoardSearch {
  tab?: Tab;
  /** 单题算子 slug，例如 concatd */
  op?: string;
  /** 搜索关键词 */
  q?: string;
  /** 打开诊断弹窗的队伍 teamKey */
  team?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);

function AppLayout() {
  const isMcp = useRouterState({ select: (s) => s.matches.some((m) => m.routeId === '/mcp') });
  return isMcp ? (
    <Outlet />
  ) : (
    <LiveProvider>
      <Outlet />
    </LiveProvider>
  );
}

const rootRoute = createRootRoute({ component: AppLayout });

export const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: Record<string, unknown>): BoardSearch => {
    const tab = TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined;
    return {
      tab: tab && tab !== 'total' ? tab : undefined,
      op: str(s.op),
      q: str(s.q),
      team: str(s.team),
    };
  },
  component: BoardPage,
});

export const mcpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mcp',
  component: McpPage,
});

export const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stats',
  component: StatsPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([boardRoute, mcpRoute, statsRoute]),
  basepath: BASEPATH,
  defaultPreload: false,
  scrollRestoration: true,
  defaultNotFoundComponent: () => (
    <div className="mx-auto max-w-md p-10 text-center text-sm text-[var(--ink-2)]">
      页面不存在，
      <a className="text-[var(--signal)] underline" href={BASEPATH}>
        回到榜单
      </a>
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
