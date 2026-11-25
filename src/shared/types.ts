// 全项目共享的数据契约：CANNJudge 上游归一化 → 服务端 / Worker → 前端 / 分析 / MCP。

/** 公开测试点元数据（隐藏测试点在服务端即剔除，仅保留公开用例） */
export interface VisibleTestcase {
  id: string;
  /** 公开用例序号（1..5） */
  index: number;
  /** CANNJudge 用例 ID */
  caseId: number | null;
  /** 全场最优耗时（μs） */
  tbest: number | null;
}

/** 单条单题榜记录的单个公开用例结果（下标与 meta.visibleTestcases 一一对应，省略冗余 ID） */
export interface TestcaseMetric {
  /** 仅在非 Pass 时携带，默认视为 Pass */
  status?: string;
  /** 实测耗时（μs）；未通过或隐藏时为 null */
  time: number | null;
  /** 相对全场最优 tbest 的倍率（time / tbest，越接近 1.00 越优） */
  ratio: number | null;
}

/** 单支队伍在某一道算子题上的精简成绩（挂载在总榜行 problems[slug] 上） */
export interface TeamProblemCell {
  rank: number;
  score: number;
  /** 该题是否当前第 1 名（触发 difficulty × 10 榜首奖励）；仅 true 时存在 */
  isLeader?: boolean;
  updatedAt?: string | null;
}

/** 赛事元信息 */
export interface ContestMeta {
  id: string;
  slug: string;
  title: string;
  desc: string;
  startTime: string;
  endTime: string;
  organizationMode: string;
  scoringRule: string;
  dailyLimit: number | null;
  visibleTestcaseCount: number;
  /** 报名总人数/队数（来自 summary） */
  participantCount: number;
  /** 全赛事累计提交次数（来自 summary） */
  submissionCount: number;
  /** 题目总数 */
  problemCount: number;
  sourceUrl: string;
}

/** 算子题目元信息与聚合统计 */
export interface ProblemMeta {
  /** Mongo ObjectId */
  id: string;
  /** 规范短名（slug，例如 concatd） */
  slug: string;
  /** 展示标题（例如 ConcatD） */
  title: string;
  /** 难度权重（1 / 2 / 3；总分中单题分 × difficulty，榜首奖励 = difficulty × 10） */
  difficulty: number;
  cannVersion: string;
  totalTestcases: number;
  visibleTestcases: VisibleTestcase[];
  /** 来自 /stats?group=problem */
  attemptCount: number;
  passCount: number;
  wrongCount: number;
  failCount: number;
  submissionCount: number;
  /** 源站题目链接 */
  sourceUrl: string;
}

/** 总榜的一行（每支参赛队伍一行） */
export interface TotalRow {
  rank: number;
  /** 跨榜唯一关联键（优先 team_id，兜底 team_object_id） */
  teamKey: string;
  teamId: string;
  teamObjectId: string;
  /** CANNJudge 展示用数字 ID */
  displayId: number | null;
  name: string;
  /** 官方加权总分（含榜首奖励） */
  score: number;
  /** 按单题榜交叉核验的 Σ(difficulty × score) */
  weightedScore: number;
  /** 按单题榜交叉核验的 Σ_{rank=1}(difficulty × 10) */
  leaderBonus: number;
  /** 当前手握单题第 1 的数量 */
  leaderCount: number;
  passCount: number;
  attemptCount: number;
  submissionCount: number;
  /** 跨 10 题最新有效提交时间 */
  latestSubmitAt: string | null;
  /** key = problem.slug */
  problems: Record<string, TeamProblemCell>;
}

/** 单题榜的一行 */
export interface ProblemRow {
  rank: number;
  teamKey: string;
  teamId?: string;
  teamObjectId?: string;
  displayId: number | null;
  name: string;
  /** 最近一次有效提交的成员昵称 */
  submitter: string;
  submitterId?: number | null;
  score: number;
  /** 仅在非 Pass 时携带，默认视为 Pass */
  status?: string;
  submittedAt: string | null;
  /** 公开用例耗时（长度通常为 5，与 meta.visibleTestcases 下标一一对应） */
  testcases: TestcaseMetric[];
}

export interface ProblemBoard {
  meta: ProblemMeta;
  rows: ProblemRow[];
  /** 上游声明的总条数 */
  reportedTotal: number;
  /** 是否有分页截断 */
  truncated: boolean;
  error: string | null;
  stale: boolean;
  fetchedAt: number;
}

export interface TotalBoard {
  rows: TotalRow[];
  reportedTotal: number;
  error: string | null;
  stale: boolean;
  fetchedAt: number;
}

export interface StaticBuildInfo {
  builtAt: string;
  builtBy: string;
  fetchMs: number;
  brokenBoards: { id: string; title: string; error: string | null }[];
}

export interface PushInfo {
  intervalMs: number;
  clients: number;
}

export interface Snapshot {
  contest: ContestMeta;
  generatedAt: string;
  total: TotalBoard;
  problems: ProblemBoard[];
  static?: StaticBuildInfo;
  push?: PushInfo;
}

/** /api/online */
export interface OnlineInfo {
  sockets: number;
  lastPush: number | null;
  intervalMs: number;
}

/** /api/health */
export interface HealthInfo {
  ok: true;
  contestSlug: string;
  contestId: string;
  cacheTtlMs: number;
  at: string;
  runtime: 'bun' | 'cloudflare-worker';
  push: { intervalMs: number } | null;
  stats: boolean;
}

/** 前端打点事件（/api/hit，sendBeacon text/plain） */
export type HitKind = 'pv' | 'board' | 'csv' | 'out' | 'team';
export interface HitEvent {
  k: HitKind;
  t?: string;
  r?: string;
}

export interface StatsDay {
  day: string;
  pv: number;
  uv: number;
  csv: number;
  out: number;
  team: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface StatsSummary {
  ok: true;
  days: number;
  today: StatsDay;
  series: StatsDay[];
  totals: {
    pv: number;
    uvDaySum: number;
    uvPeak: number;
    csv: number;
    out: number;
    team: number;
  };
  boards: NamedCount[];
  todayBoards: NamedCount[];
  refs: NamedCount[];
  geo: NamedCount[];
  dev: NamedCount[];
  online: number;
}
