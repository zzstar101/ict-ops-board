import { Link } from '@tanstack/react-router';

export function Footer() {
  return (
    <footer className="mt-10 border-t border-[var(--rule)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-[var(--ink-3)] sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-[var(--ink-2)]">ICT 算子赛实时看板</span>
          <span>·</span>
          <span>
            数据来源{' '}
            <a
              href="https://cannjudge.cn/public/ictcompetition"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-[var(--rule-strong)] underline-offset-4 hover:text-[var(--ink)]"
            >
              cannjudge.cn/public/ictcompetition
            </a>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/mcp" className="hover:text-[var(--ink)]">
            MCP 接入文档
          </Link>
          <span>MIT License</span>
        </div>
      </div>
    </footer>
  );
}
