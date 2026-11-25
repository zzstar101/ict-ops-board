import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { fmtInt } from '../../shared/format.ts';
import type { StatsSummary } from '../../shared/types.ts';
import { fetchStats } from '../lib/api.ts';

const KEY_STORE = 'ict-ops:stats-key';

export function StatsPage() {
  const [key, setKey] = useState(() => (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY_STORE) || '' : ''));
  const [input, setInput] = useState(key);
  const [days, setDays] = useState(14);
  const [data, setData] = useState<StatsSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    fetchStats(key, days)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key, days]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = input.trim();
    sessionStorage.setItem(KEY_STORE, clean);
    setKey(clean);
  };

  return (
    <div className="min-h-dvh">
      <title>访问统计 - ICT 算子赛实时看板</title>
      <header className="border-b border-[var(--rule)] bg-[var(--surface)]">
        <div className="mx-auto flex h-13 max-w-[1040px] items-center justify-between px-4 sm:px-6">
          <Link to="/" search={{}} className="text-sm font-semibold text-[var(--ink)] hover:text-[var(--signal)]">
            ← 返回榜单
          </Link>
          <span className="num text-xs text-[var(--ink-3)]">匿名聚合统计</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1040px] space-y-5 px-4 py-8 sm:px-6">
        {!key || err ? (
          <form onSubmit={submit} className="editorial-panel mx-auto max-w-md space-y-3 p-5">
            <h1 className="text-base font-semibold text-[var(--ink)]">访问统计密钥</h1>
            <p className="text-xs text-[var(--ink-2)]">需配置服务端环境变量 <code className="num">STATS_KEY</code> 后可用。</p>
            {err && <div className="text-xs text-[var(--signal)]">鉴权或请求失败：{err}</div>}
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入 STATS_KEY"
              className="editorial-input w-full"
            />
            <button type="submit" className="editorial-btn w-full" aria-pressed="true">
              查看统计
            </button>
          </form>
        ) : loading && !data ? (
          <div className="editorial-panel p-8 text-center text-sm text-[var(--ink-2)]">加载中…</div>
        ) : data ? (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-[var(--ink)]">近 {data.days} 天访问概况</h1>
              <div className="flex gap-1.5">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days === d}
                    onClick={() => setDays(d)}
                    className="editorial-btn px-2.5 py-1 text-xs"
                  >
                    {d} 天
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="editorial-panel p-4">
                <div className="text-xs text-[var(--ink-2)]">当前在线 WS</div>
                <div className="num mt-1 text-2xl font-light">{fmtInt(data.online)}</div>
              </div>
              <div className="editorial-panel p-4">
                <div className="text-xs text-[var(--ink-2)]">今日 PV / UV</div>
                <div className="num mt-1 text-2xl font-light">
                  {fmtInt(data.today.pv)} / {fmtInt(data.today.uv)}
                </div>
              </div>
              <div className="editorial-panel p-4">
                <div className="text-xs text-[var(--ink-2)]">区间总 PV</div>
                <div className="num mt-1 text-2xl font-light">{fmtInt(data.totals.pv)}</div>
              </div>
              <div className="editorial-panel p-4">
                <div className="text-xs text-[var(--ink-2)]">队伍诊断 / CSV</div>
                <div className="num mt-1 text-2xl font-light">
                  {fmtInt(data.totals.team)} / {fmtInt(data.totals.csv)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="editorial-panel p-4">
                <h2 className="mb-2 text-xs font-semibold text-[var(--ink-2)]">热门榜单 / 视图</h2>
                <div className="space-y-1.5 text-xs">
                  {data.boards.map((b) => (
                    <div key={b.name} className="flex justify-between">
                      <span>{b.name}</span>
                      <span className="num text-[var(--ink-2)]">{fmtInt(b.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="editorial-panel p-4">
                <h2 className="mb-2 text-xs font-semibold text-[var(--ink-2)]">访问来源</h2>
                <div className="space-y-1.5 text-xs">
                  {data.refs.map((r) => (
                    <div key={r.name} className="flex justify-between">
                      <span>{r.name}</span>
                      <span className="num text-[var(--ink-2)]">{fmtInt(r.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
