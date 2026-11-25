import { Link } from '@tanstack/react-router';
import { fmtTime, timeAgo } from '../../shared/format.ts';
import { useNow } from '../lib/hooks.ts';
import { useLive } from '../lib/live.tsx';
import { cycleThemeMode, useThemeMode } from '../lib/theme.ts';
import { cx } from './ui.tsx';

export function Header() {
  const { data, error, isFetching, stream, refresh } = useLive();
  const theme = useThemeMode();
  const now = useNow(1000);
  const gen = data ? Date.parse(data.snap.generatedAt) : null;

  let tone: 'live' | 'poll' | 'warn' | 'err' = 'poll';
  let label = '连接中';
  let hint = '正在拉取 CANNJudge 公开榜单…';

  if (data) {
    if (data.source === 'static') {
      tone = 'warn';
      label = '静态快照';
      hint = '实时服务不可达，当前展示 GitHub Actions 定时抓取的静态快照';
    } else if (stream === 'open') {
      tone = 'live';
      label = '实时推送';
      hint = `WebSocket 已连接，服务端每 ${(data.snap.push?.intervalMs ?? 30_000) / 1000} 秒刷新推送`;
    } else {
      tone = 'poll';
      label = '自动刷新';
      hint = '每 30 秒自动轮询更新';
    }
    if (error) {
      tone = 'warn';
      label = '刷新受阻';
      hint = `最近一次刷新失败（${error.message}），暂保留上一份快照`;
    }
  } else if (error) {
    tone = 'err';
    label = '连接失败';
    hint = error.message;
  }

  const dotClass = {
    live: 'bg-[var(--pass)] pulse-live',
    poll: 'bg-[var(--ink-2)]',
    warn: 'bg-[var(--gold)]',
    err: 'bg-[var(--signal)]',
  }[tone];

  const themeLabel = theme === 'system' ? '自动' : theme === 'light' ? '浅色' : '暗色';

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[var(--surface)]/92 backdrop-blur-md">
      <div className="mx-auto flex h-13 max-w-[1360px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" search={{}} className="flex min-w-0 items-center gap-2.5">
          <svg viewBox="0 0 28 28" className="size-7 shrink-0" fill="none" aria-hidden>
            <rect width="28" height="28" rx="6" className="fill-[var(--ink)]" />
            <rect x="6" y="15" width="3" height="7" rx="0.6" className="fill-[var(--ink-3)]" />
            <rect x="11" y="10" width="3" height="12" rx="0.6" className="fill-[var(--paper)]" />
            <rect x="16" y="6" width="3" height="16" rx="0.6" className="fill-[var(--signal)]" />
            <rect x="21" y="12" width="3" height="10" rx="0.6" className="fill-[var(--paper)]" />
          </svg>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold tracking-tight text-[var(--ink)]">
              ICT 算子赛实时看板
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <Link to="/mcp" className="editorial-btn px-2.5 py-1 text-xs" activeProps={{ 'aria-current': 'page' }}>
            <span className="num">MCP</span>
          </Link>

          <button
            type="button"
            className="editorial-btn px-2.5 py-1 text-xs"
            onClick={cycleThemeMode}
            title={`当前外观：${themeLabel}（点击切换 自动 / 浅色 / 暗色）`}
          >
            <span className="hidden sm:inline">{themeLabel}</span>
            <span className="sm:hidden">{theme === 'dark' ? '暗' : theme === 'light' ? '浅' : '自'}</span>
          </button>

          <div
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs text-[var(--ink-2)]"
            title={hint}
          >
            <span className={cx('size-1.5 rounded-full', dotClass)} />
            <span className="font-medium text-[var(--ink)]">{label}</span>
            {gen != null && (
              <span className="num hidden text-[11px] text-[var(--ink-3)] md:inline" title={`快照生成于 ${fmtTime(gen, true)}（北京时间）`}>
                · {timeAgo(gen, now)}
              </span>
            )}
          </div>

          <button
            type="button"
            className="editorial-btn px-2.5 py-1 text-xs"
            onClick={refresh}
            disabled={isFetching}
            title="立即刷新（跳过缓存）"
          >
            <svg viewBox="0 0 20 20" className={cx('size-3.5', isFetching && 'animate-spin')} fill="none" aria-hidden>
              <path
                d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.2h-3.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hidden sm:inline">刷新</span>
          </button>
        </div>
      </div>
    </header>
  );
}
