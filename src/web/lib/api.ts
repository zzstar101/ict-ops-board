import type { HitEvent, Snapshot, StatsSummary } from '../../shared/types.ts';
import { API_BASE, IS_LOCAL, MODE, STATIC_SNAPSHOT_URL } from './config.ts';

export type SnapshotSource = 'live' | 'push' | 'static';

export interface SnapshotResult {
  snap: Snapshot;
  source: SnapshotSource;
  receivedAt: number;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, init?: RequestInit, timeoutMs = 25_000): Promise<T> {
  const res = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new HttpError(res.status, msg);
  }
  return (await res.json()) as T;
}

export async function fetchSnapshot(force = false): Promise<SnapshotResult> {
  if (MODE === 'pages' && !API_BASE) {
    const snap = await getJson<Snapshot>(`${STATIC_SNAPSHOT_URL}?t=${Date.now()}`, { cache: 'no-store' });
    return { snap, source: 'static', receivedAt: Date.now() };
  }
  const url = `${API_BASE}/api/snapshot${force ? '?force=1' : ''}`;
  try {
    const snap = await getJson<Snapshot>(url, { cache: 'no-store' }, MODE === 'pages' ? 12_000 : 25_000);
    return { snap, source: 'live', receivedAt: Date.now() };
  } catch (err) {
    if (MODE !== 'pages') throw err;
    const snap = await getJson<Snapshot>(`${STATIC_SNAPSHOT_URL}?t=${Date.now()}`, { cache: 'no-store' });
    return { snap, source: 'static', receivedAt: Date.now() };
  }
}

export function csvUrl(boardId: string) {
  const u = new URLSearchParams({ board: boardId });
  return `${API_BASE}/api/export.csv?${u}`;
}

export function streamUrl(): string | null {
  if (MODE === 'pages' && !API_BASE) return null;
  const base = API_BASE || location.origin;
  return base.replace(/^http/, 'ws') + '/api/stream';
}

export function fetchStats(key: string, days: number) {
  return getJson<StatsSummary>(`${API_BASE}/api/stats?days=${days}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
}

export function hit(evt: HitEvent) {
  if (IS_LOCAL || (MODE === 'pages' && !API_BASE)) return;
  try {
    const body = JSON.stringify(evt);
    const url = `${API_BASE}/api/hit`;
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) {
      void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
