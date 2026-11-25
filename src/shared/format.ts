// 统一的日期 / 分数 / 耗时格式化（北京时间 UTC+8，不依赖系统本地时区）。

export const TZ_OFFSET_MS = 8 * 3600_000;

export function toMs(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 北京时间：MM-DD HH:mm */
export function fmtTime(v: string | number | null | undefined, withSeconds = false): string {
  const ms = toMs(v);
  if (ms == null) return '—';
  const d = new Date(ms + TZ_OFFSET_MS);
  const base = `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return withSeconds ? `${base}:${pad2(d.getUTCSeconds())}` : base;
}

/** 北京时间完整日期：YYYY-MM-DD HH:mm */
export function fmtFullTime(v: string | number | null | undefined): string {
  const ms = toMs(v);
  if (ms == null) return '—';
  const d = new Date(ms + TZ_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** 相对时间（几秒前 / 几分钟前 / 几小时前 / 几天前） */
export function timeAgo(v: string | number | null | undefined, now = Date.now()): string {
  const ms = toMs(v);
  if (ms == null) return '—';
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 5) return '刚刚';
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}

export function fmtScore(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString('zh-CN');
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 100_000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toLocaleString('zh-CN');
}

export function fmtPct(num: number, den: number, digits = 1): string {
  if (!den || !Number.isFinite(num) || !Number.isFinite(den)) return '—';
  return `${((num / den) * 100).toFixed(digits)}%`;
}

/** 用例耗时格式化（单位 μs；极大值自动切换 ms） */
export function fmtUs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 10_000) return `${(v / 1000).toFixed(2)} ms`;
  if (v >= 1_000) return `${v.toFixed(1)} μs`;
  return `${v.toFixed(2)} μs`;
}

export function fmtRatio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}×`;
}

/** 赛程进度计算 */
export function contestProgress(startIso: string, endIso: string, now = Date.now()) {
  const start = toMs(startIso) ?? now;
  const end = toMs(endIso) ?? now;
  const total = Math.max(1, end - start);
  const elapsed = Math.min(total, Math.max(0, now - start));
  const pct = (elapsed / total) * 100;
  const remainMs = Math.max(0, end - now);
  const remainDays = Math.ceil(remainMs / 86_400_000);
  const status: 'upcoming' | 'active' | 'ended' = now < start ? 'upcoming' : now > end ? 'ended' : 'active';
  return { pct, remainMs, remainDays, status };
}
