// GitHub Pages 静态构建：前端 + 完整榜单快照（CI 每 10 分钟抓一次）
//   bun scripts/build-pages.ts   → dist/pages
import { cp, mkdir, rm } from 'node:fs/promises';
import { errMsg, getSnapshot } from '../src/server/upstream.ts';
import type { Snapshot } from '../src/shared/types.ts';
import { buildClient } from './build.ts';
import { renderPagesHtml } from './pages-html.ts';

const OUT = 'dist/pages';
const LIVE_ORIGIN = process.env.LIVE_ORIGIN ?? 'https://ict.nerv-base.com';

await buildClient('dist/client');
await rm(OUT, { recursive: true, force: true });
await cp('dist/client', OUT, { recursive: true });

const htmlPath = `${OUT}/index.html`;
const html = await Bun.file(htmlPath).text();
const patched = renderPagesHtml(html, LIVE_ORIGIN);
await Bun.write(htmlPath, patched);
await mkdir(`${OUT}/mcp`, { recursive: true });
await Bun.write(`${OUT}/mcp/index.html`, renderPagesHtml(html, LIVE_ORIGIN, 1));
await Bun.write(`${OUT}/404.html`, patched);
await Bun.write(`${OUT}/.nojekyll`, '');

const t0 = performance.now();
let snap: Snapshot;
try {
  snap = await getSnapshot({ force: true });
} catch (err) {
  console.error('✘ snapshot failed:', errMsg(err));
  process.exit(1);
}
const fetchMs = Math.round(performance.now() - t0);
const broken = [
  ...(snap.total.error ? [{ id: 'total', title: '总榜', error: snap.total.error }] : []),
  ...snap.problems.filter((p) => p.error).map((p) => ({ id: p.meta.slug, title: p.meta.title, error: p.error })),
];

if (!snap.total.rows.length) {
  console.error('✘ total board is empty, aborting deploy', snap.total.error ?? '');
  process.exit(1);
}

snap.static = {
  builtAt: new Date().toISOString(),
  builtBy: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
  fetchMs,
  brokenBoards: broken,
};
await mkdir(`${OUT}/data`, { recursive: true });
await Bun.write(`${OUT}/data/snapshot.json`, JSON.stringify(snap));

const probRows = snap.problems.reduce((n, p) => n + p.rows.length, 0);
console.log(
  `✔ snapshot: total=${snap.total.rows.length} teams, ${snap.problems.length} problems (${probRows} rows), ${fetchMs} ms${
    broken.length ? `, broken=${broken.map((b) => b.id).join(',')}` : ''
  }`,
);
