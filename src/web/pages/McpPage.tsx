import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Footer } from '../components/Footer.tsx';
import { MCP_TOOLS, mcpEndpointUrl } from '../lib/mcp.ts';
import { cycleThemeMode, useThemeMode } from '../lib/theme.ts';

export function McpPage() {
  const endpoint = mcpEndpointUrl();
  const [copied, setCopied] = useState<string | null>(null);
  const theme = useThemeMode();

  const claudeCmd = `claude mcp add --transport http ict-ops-board ${endpoint}`;
  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        'ict-ops-board': {
          url: endpoint,
        },
      },
    },
    null,
    2,
  );

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((cur) => (cur === id ? null : cur)), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <title>MCP 接入 - ICT 算子赛实时看板</title>
      <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[var(--surface)]/92 backdrop-blur-md">
        <div className="mx-auto flex h-13 max-w-[1040px] items-center justify-between px-4 sm:px-6">
          <Link to="/" search={{}} className="text-sm font-semibold text-[var(--ink)] hover:text-[var(--signal)]">
            ← 返回 ICT 算子赛看板
          </Link>
          <button type="button" className="editorial-btn px-2.5 py-1 text-xs" onClick={cycleThemeMode}>
            外观：{theme === 'system' ? '自动' : theme === 'light' ? '浅色' : '暗色'}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1040px] flex-1 space-y-6 px-4 py-8 sm:px-6">
        <section className="border-b border-[var(--rule)] pb-6">
          <div className="kicker">STREAMABLE HTTP · READ-ONLY · NO API KEY</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">用 AI 直接查询 ICT 算子赛实时榜单</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">
            公开只读、免登录的 Streamable HTTP MCP 服务，适用于 Claude Code、Codex、Cursor 等客户端。可直接查询总榜、10 道 Ascend C 算子单题榜、5 个公开用例耗时 vs 全场最优 <span className="num">tbest</span>，以及指定队伍的逐题提分空间诊断。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="num rounded-md border border-[var(--rule)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--ink)]">
              {endpoint}
            </code>
            <button type="button" className="editorial-btn px-3 py-1.5 text-xs" onClick={() => copy('url', endpoint)}>
              {copied === 'url' ? '已复制' : '复制地址'}
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="editorial-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Claude Code CLI 一行接入</h2>
              <button type="button" className="editorial-btn px-2.5 py-1 text-xs" onClick={() => copy('cli', claudeCmd)}>
                {copied === 'cli' ? '已复制' : '复制'}
              </button>
            </div>
            <pre className="num mt-3 overflow-x-auto rounded-md bg-[var(--surface-muted)] p-3 text-xs text-[var(--ink)]">
              {claudeCmd}
            </pre>
          </div>

          <div className="editorial-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Cursor / 通用 MCP JSON 配置</h2>
              <button type="button" className="editorial-btn px-2.5 py-1 text-xs" onClick={() => copy('json', jsonConfig)}>
                {copied === 'json' ? '已复制' : '复制'}
              </button>
            </div>
            <pre className="num mt-3 overflow-x-auto rounded-md bg-[var(--surface-muted)] p-3 text-xs text-[var(--ink)]">
              {jsonConfig}
            </pre>
          </div>
        </section>

        <section className="editorial-panel overflow-hidden">
          <div className="border-b border-[var(--rule)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">提供的 5 个只读工具</h2>
          </div>
          <div className="divide-y divide-[var(--rule)]">
            {MCP_TOOLS.map((t) => (
              <div key={t.name} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="num rounded bg-[var(--signal-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--signal)]">
                    {t.name}
                  </code>
                  <span className="text-sm font-medium text-[var(--ink)]">{t.title}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="editorial-panel p-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">可以这样问 AI</h2>
          <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-[var(--ink-2)]">
            <li>「帮我查一下 <code className="num text-[var(--ink)]">bakubaku</code> 和 <code className="num text-[var(--ink)]">花花公子</code> 目前在 10 道算子题上的差距，哪道题最适合追分？」</li>
            <li>「列出当前 10 道算子的榜首归属，哪道权重 ×3 的题冠亚军分差最小？」</li>
            <li>「看看 <code className="num text-[var(--ink)]">ConcatD</code> 前 5 名在 5 个公开用例上的实测耗时与 tbest 倍率。」</li>
            <li>「总榜前 50 名的分数线是多少？目前有多少支队伍已经 10 题全通？」</li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}
