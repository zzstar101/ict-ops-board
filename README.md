# ICT 算子赛实时看板

**第十一届华为 ICT 大赛｜昇腾 AI 算子开发赛道（决赛）实时榜单与性能分析看板**

- **在线看板（GitHub Pages）**：<https://zzstar101.github.io/ict-ops-board/> —— 公开首页，优先接收实时数据；实时服务不可达时自动使用每 10 分钟构建的静态快照
- **实时直连（Cloudflare Worker）**：<https://ict.nerv-base.com/>（备用：<https://ict-ops-board.zzstarwork.workers.dev/>）
- **公开只读 MCP**：`https://ict.nerv-base.com/api/mcp`（接入文档：<https://zzstar101.github.io/ict-ops-board/mcp>）

数据来自 [cannjudge.cn/public/ictcompetition](https://cannjudge.cn/public/ictcompetition) 公开接口，免登录直查全量 800+ 上榜队伍与 10 道 Ascend C 算子单题榜。

## 核心能力

- **总榜双视图**：支持「10 题轮廓 Sparkbar」（一行扫视强项/短板与榜首归属）与「10 题全景矩阵」一键切换。
- **加权计分与榜首奖励透明化**：自动核验并拆分公式：
  $$\text{总分} = \sum (\text{难度系数} \times \text{单题得分}) + \sum_{\text{单题第 1}} (\text{难度系数} \times 10)$$
- **单题 5 公开用例耗时 vs 全场最优 `tbest`**：直接显示每个公开用例的实测耗时（`μs`）与相对 `tbest` 的倍率（`≤1.05×` 绿标高亮）。
- **队伍 10 题提分诊断**：点击任意队伍打开抽屉，按「追平/反超榜首可获总分增量（含 `+10×难度` 榜首奖励）」排序，一眼找出性价比最高的突破口。
- **关注置顶 & 实时推送**：支持本地收藏关注多支队伍置顶对比；Bun / Cloudflare Worker 模式下通过 WebSocket gzip 帧每 30 秒推送更新。
- **公开只读 MCP 服务**：位于 `/api/mcp`（接入文档在 `/mcp`），支持 Claude Code / Codex / Cursor 直接查榜与诊断。
- **多形态部署**：本地 Bun、Cloudflare Worker（含 Durable Objects 推送中枢）、GitHub Pages 每 10 分钟静态快照降级。

## 本地开发

```bash
bun install
bun run dev      # → http://127.0.0.1:8792
```

## 常用命令

```bash
bun test                 # 运行单测与接口/MCP测试
bun run typecheck        # TypeScript 严格检查（含 Worker 类型）
bun run build            # 构建前端静态资源 → dist/client
bun run build:pages      # 构建 GitHub Pages + 抓取最新快照 → dist/pages
bun run worker:dev       # 本地预览 Cloudflare Worker
bun run worker:deploy    # 部署 Cloudflare Worker
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` / `HOST` | 本地服务端口与监听地址 | `8792` / `127.0.0.1` |
| `CONTEST_SLUG` | CANNJudge 公开赛事标识 | `ictcompetition` |
| `CONTEST_ID` | CANNJudge 赛事 ObjectId | `6a9e2d04bf41025d60f21804` |
| `CACHE_TTL_MS` | 上游缓存 TTL（毫秒） | `25000` |
| `PUSH_INTERVAL_MS` | WebSocket 推送周期（毫秒） | `30000` |
| `LIVE_ORIGIN` | GitHub Pages 优先连接的 Worker 域名 | 空（直接读静态快照） |
| `STATS_KEY` | 可选：开启 `/stats` 匿名访问统计后台的密钥 | 未开启 |
