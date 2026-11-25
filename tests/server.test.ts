import { describe, expect, test } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApi } from '../src/server/app.ts';
import { totalRowsToCsv, problemRowsToCsv } from '../src/server/csv.ts';
import { memoryKV, VisitStats } from '../src/server/visits.ts';
import type { Snapshot } from '../src/shared/types.ts';
import { enrichTotalWithProblems, rankProblemRows, rankTotalRows } from '../src/server/upstream.ts';

function fixtureSnapshot(): Snapshot {
  const pb = {
    meta: {
      id: 'p1',
      slug: 'concatd',
      title: 'ConcatD',
      difficulty: 3,
      cannVersion: '9.1.0',
      totalTestcases: 50,
      visibleTestcases: [{ id: 'tc1', index: 1, caseId: 100, tbest: 3.5 }],
      attemptCount: 100,
      passCount: 80,
      wrongCount: 10,
      failCount: 1,
      submissionCount: 400,
      sourceUrl: 'https://cannjudge.cn/public/ictcompetition/concatd',
    },
    rows: rankProblemRows([
      {
        rank: 1,
        teamKey: 'team-a',
        teamId: 'team-a',
        teamObjectId: 'obj-a',
        displayId: 4871,
        name: '=bakubaku',
        submitter: 'dev1',
        submitterId: 10,
        score: 86.28,
        status: 'Pass',
        submittedAt: '2026-11-25T08:00:00.000Z',
        submissionId: 's1',
        testcases: [{ testcaseId: 'tc1', status: 'Pass', time: 3.55, ratio: 1.014, precisionRatio: 1 }],
      },
    ]),
    reportedTotal: 1,
    truncated: false,
    error: null,
    stale: false,
    fetchedAt: Date.parse('2026-11-25T09:00:00.000Z'),
  };
  const totalRows = enrichTotalWithProblems(
    rankTotalRows([
      {
        rank: 1,
        teamKey: 'team-a',
        teamId: 'team-a',
        teamObjectId: 'obj-a',
        displayId: 4871,
        name: '=bakubaku',
        score: 288.84,
        weightedScore: 0,
        leaderBonus: 0,
        leaderCount: 0,
        passCount: 1,
        attemptCount: 1,
        submissionCount: 12,
        latestSubmitAt: null,
        problems: {},
      },
    ]),
    [pb],
  );
  return {
    contest: {
      id: 'cid',
      slug: 'ictcompetition',
      title: '第十一届华为ICT大赛｜昇腾AI算子开发赛道（决赛）',
      desc: '',
      startTime: '2026-11-01T16:00:00.000Z',
      endTime: '2027-03-04T15:59:00.000Z',
      organizationMode: 'huawei_team',
      scoringRule: 'difficulty_weighted',
      dailyLimit: 50,
      visibleTestcaseCount: 5,
      participantCount: 1692,
      submissionCount: 154728,
      problemCount: 1,
      sourceUrl: 'https://cannjudge.cn/public/ictcompetition',
    },
    generatedAt: '2026-11-25T09:00:00.000Z',
    total: { rows: totalRows, reportedTotal: 1, error: null, stale: false, fetchedAt: Date.parse('2026-11-25T09:00:00.000Z') },
    problems: [pb],
  };
}

describe('HTTP API, CSV & MCP integration', () => {
  test('CSV escapes Excel formula injection and emits UTF-8 BOM', () => {
    const snap = fixtureSnapshot();
    const totalCsv = totalRowsToCsv(snap.total.rows, snap.problems);
    expect(totalCsv.startsWith('\ufeff')).toBe(true);
    expect(totalCsv).toContain("'=bakubaku");
    expect(totalCsv).toContain('ConcatD(x3)');

    const probCsv = problemRowsToCsv(snap.problems[0]!);
    expect(probCsv).toContain('case1_us,case1_ratio');
    expect(probCsv).toContain('3.55,1.014');
  });

  test('health, snapshot, stats auth, and stateless MCP work end-to-end', async () => {
    const snap = fixtureSnapshot();
    const stats = new VisitStats(memoryKV());
    const api = createApi({
      runtime: 'bun',
      pushIntervalMs: 30_000,
      snapshot: async () => ({ snap, via: 'fixture' }),
      stats: () => ({ backend: stats, key: 'secret-key', ctx: { ua: 'Mozilla/5.0', ip: '1.2.3.4', geo: 'CN' } }),
      mcpSource: { getSnapshot: async () => snap, now: () => Date.parse('2026-11-25T09:01:00.000Z') },
    });

    const healthRes = await api.request('/api/health');
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as any;
    expect(health.ok).toBe(true);

    const snapRes = await api.request('/api/snapshot');
    expect(snapRes.status).toBe(200);
    expect(snapRes.headers.get('X-Source')).toBe('fixture');

    // Stats unauthorized returns 404
    const unauth = await api.request('/api/stats');
    expect(unauth.status).toBe(404);

    // Hit + authorized stats
    const hitRes = await api.request('/api/hit', { method: 'POST', body: JSON.stringify({ k: 'pv', r: 'https://github.com' }) });
    expect(hitRes.status).toBe(204);
    const authRes = await api.request('/api/stats', { headers: { Authorization: 'Bearer secret-key' } });
    expect(authRes.status).toBe(200);
    const summary = (await authRes.json()) as any;
    expect(summary.today.pv).toBe(1);

    // MCP Client over StreamableHTTP via in-memory fetch
    const customFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      return Promise.resolve(api.fetch(req));
    }) as typeof fetch;
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), { fetch: customFetch });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual([
        'ict_analyze_cutoff',
        'ict_analyze_problem',
        'ict_get_team',
        'ict_list_boards',
        'ict_query_leaderboard',
      ]);

      const listed = await client.callTool({ name: 'ict_list_boards', arguments: {} });
      const listedData = listed.structuredContent as any;
      expect(listedData.ok).toBe(true);
      expect(listedData.boards).toHaveLength(2);

      const teamDiag = await client.callTool({ name: 'ict_get_team', arguments: { team: '4871' } });
      const teamData = teamDiag.structuredContent as any;
      expect(teamData.ok).toBe(true);
      expect(teamData.total.leaderBonus).toBe(30);
    } finally {
      await client.close();
    }
  });
});
