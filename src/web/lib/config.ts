// 运行模式：
//   server —— Bun 本地服务或 Cloudflare Worker 同源提供
//   pages  —— GitHub Pages 静态托管：优先连 LIVE_ORIGIN（配置时），失败自动降级到 ./data/snapshot.json
declare global {
  interface Window {
    __BOARD_CONFIG__?: { mode?: 'pages'; liveOrigin?: string };
  }
}

const injected = typeof window !== 'undefined' ? window.__BOARD_CONFIG__ : undefined;

export const MODE: 'server' | 'pages' = injected?.mode === 'pages' ? 'pages' : 'server';
export const LIVE_ORIGIN = (injected?.liveOrigin || 'https://ict.nerv-base.com').replace(/\/$/, '');
export const API_BASE = MODE === 'pages' ? LIVE_ORIGIN : '';

const host = typeof location !== 'undefined' ? location.hostname : '';
export const IS_LOCAL = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');

export function resolvePagesBasepath(pageHref: string, documentBaseURI = pageHref): string {
  return new URL('.', documentBaseURI).pathname.replace(/\/$/, '') || '/';
}

export const BASEPATH =
  typeof location !== 'undefined' && MODE === 'pages'
    ? resolvePagesBasepath(location.href, typeof document !== 'undefined' ? document.baseURI : location.href)
    : '/';

export const STATIC_SNAPSHOT_URL = MODE === 'pages' ? `${BASEPATH.replace(/\/$/, '')}/data/snapshot.json` : '';
