import { API_BASE, MODE } from './config.ts';

export function mcpEndpointUrl(): string {
  if (API_BASE) return `${API_BASE}/api/mcp`;
  if (typeof location !== 'undefined' && MODE !== 'pages') return `${location.origin}/api/mcp`;
  return 'http://127.0.0.1:8792/api/mcp';
}

export const MCP_TOOLS = [
  {
    name: 'ict_list_boards',
    title: '发现全部榜单与算子权重',
    desc: '列出赛事总榜与 10 道算子单题榜的 slug、难度系数（×1/×2/×3）、榜首奖励（+10×难度）、当前榜首与抓取时效。',
  },
  {
    name: 'ict_query_leaderboard',
    title: '筛选与分页查榜',
    desc: '按关键词搜索总榜或单题榜（如 concatd），支持按 10 题全通 / 手握榜首筛选并分页。',
  },
  {
    name: 'ict_get_team',
    title: '队伍 10 题画像与提分诊断',
    desc: '输入队名或队伍 ID，返回该队在全部 10 道算子上的排名、加权分、距榜首分差及反超榜首可获总分增量。',
  },
  {
    name: 'ict_analyze_cutoff',
    title: '分数线与冲刺全通分析',
    desc: '计算指定名次（如前 10 / 前 50 / 前 100）的分数线、指定队伍差距及 8–9 题冲刺全通人数。',
  },
  {
    name: 'ict_analyze_problem',
    title: '算子榜首战局与公开用例 tbest',
    desc: '总览 10 道题的榜首归属与冠亚军分差；指定算子时返回 5 个公开用例的全场最优耗时 tbest 与前 10 名实测倍率。',
  },
] as const;
