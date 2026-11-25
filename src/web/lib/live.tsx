import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { diffSnapshots, type LiveChange } from '../../shared/insights.ts';
import type { Snapshot } from '../../shared/types.ts';
import { fetchSnapshot, streamUrl, type SnapshotResult } from './api.ts';
import { MODE } from './config.ts';
import { createStore } from './store.ts';

export type StreamState = 'connecting' | 'open' | 'off';

export interface LiveValue {
  data: SnapshotResult | undefined;
  error: Error | null;
  isFetching: boolean;
  stream: StreamState;
  refresh: () => void;
}

const LiveContext = createContext<LiveValue | null>(null);

export const useLive = () => {
  const v = use(LiveContext);
  if (!v) throw new Error('useLive outside LiveProvider');
  return v;
};

export const changesStore = createStore<LiveChange[]>([]);
export const CHANGE_TTL_MS = 30 * 60_000;

const QUERY_KEY = ['ict-snapshot'];
const MAX_WS_RETRIES = 3;

async function decodeFrame(data: ArrayBuffer | string): Promise<Snapshot> {
  if (typeof data === 'string') return JSON.parse(data) as Snapshot;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return (await new Response(stream).json()) as Snapshot;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [stream, setStream] = useState<StreamState>('off');
  const forceNext = useRef(false);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const force = forceNext.current;
      forceNext.current = false;
      return fetchSnapshot(force);
    },
    refetchInterval: (q) => (stream === 'open' || q.state.data?.source === 'static' ? 60_000 : 30_000),
    staleTime: 10_000,
    retry: 2,
    retryDelay: (n) => Math.min(8_000, 1_000 * 2 ** n),
    structuralSharing: false,
  });

  useEffect(() => {
    const wsUrl = streamUrl();
    if (!wsUrl || typeof WebSocket === 'undefined' || typeof DecompressionStream === 'undefined') return;
    let ws: WebSocket | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const ac = new AbortController();

    const connect = () => {
      timer = undefined;
      if (disposed || ws) return;
      setStream('connecting');
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        tries = 0;
        setStream('open');
      };
      ws.onmessage = async (ev) => {
        try {
          const snap = await decodeFrame(ev.data as ArrayBuffer | string);
          const cur = qc.getQueryData<SnapshotResult>(QUERY_KEY);
          if (cur && Date.parse(snap.generatedAt) < Date.parse(cur.snap.generatedAt)) return;
          qc.setQueryData<SnapshotResult>(QUERY_KEY, { snap, source: 'push', receivedAt: Date.now() });
        } catch (err) {
          console.warn('[stream] bad frame', err);
        }
      };
      ws.onclose = () => {
        ws = null;
        if (disposed) return;
        setStream('off');
        if (++tries <= MAX_WS_RETRIES) timer = setTimeout(connect, 2_000 * 2 ** tries);
      };
      ws.onerror = () => ws?.close();
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(timer);
        timer = undefined;
        const s = ws;
        ws = null;
        s?.close();
        setStream('off');
      } else if (!ws && !timer) {
        tries = 0;
        connect();
      }
    };

    timer = setTimeout(connect, 0);
    document.addEventListener('visibilitychange', onVis, { signal: ac.signal });
    return () => {
      disposed = true;
      clearTimeout(timer);
      ac.abort();
      ws?.close();
    };
  }, [qc]);

  const prevSnap = useRef<Snapshot | null>(null);
  const snap = query.data?.snap;
  useEffect(() => {
    if (!snap) return;
    const prev = prevSnap.current;
    if (prev && Date.parse(snap.generatedAt) <= Date.parse(prev.generatedAt)) return;
    prevSnap.current = snap;
    if (!prev) return;
    const now = Date.now();
    const changes = diffSnapshots(prev, snap, now);
    if (!changes.length) return;
    changesStore.set((list) => [...changes, ...list.filter((c) => now - c.detectedAt < 6 * 3600_000)].slice(0, 400));
  }, [snap]);

  const refresh = useCallback(() => {
    forceNext.current = MODE !== 'pages';
    void qc.invalidateQueries({ queryKey: QUERY_KEY });
  }, [qc]);

  const value = useMemo<LiveValue>(
    () => ({ data: query.data, error: query.error, isFetching: query.isFetching, stream, refresh }),
    [query.data, query.error, query.isFetching, stream, refresh],
  );
  return <LiveContext value={value}>{children}</LiveContext>;
}
