// 榜单 → CSV（UTF-8 BOM + RFC 4180 CRLF + Excel 公式注入防护）
import type { ProblemBoard, TotalRow } from '../shared/types.ts';

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function totalRowsToCsv(rows: TotalRow[], problems: ProblemBoard[]): string {
  const head = [
    'rank',
    'teamName',
    'teamDisplayId',
    'totalScore',
    'weightedScore',
    'leaderBonus',
    'leaderCount',
    'passCount',
    'attemptCount',
    'submissionCount',
    'latestSubmitAt',
    ...problems.map((p) => `${p.meta.title}(x${p.meta.difficulty})`),
    'teamId',
  ];
  const lines = [head.map(esc).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.rank,
        safeText(r.name),
        r.displayId ?? '',
        r.score,
        r.weightedScore,
        r.leaderBonus,
        r.leaderCount,
        r.passCount,
        r.attemptCount,
        r.submissionCount,
        r.latestSubmitAt ?? '',
        ...problems.map((p) => r.problems[p.meta.slug]?.score ?? ''),
        r.teamId,
      ]
        .map(esc)
        .join(','),
    );
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

export function problemRowsToCsv(board: ProblemBoard): string {
  const tcHeaders = board.meta.visibleTestcases.flatMap((tc) => [
    `case${tc.index}_us`,
    `case${tc.index}_ratio`,
  ]);
  const head = [
    'rank',
    'teamName',
    'teamDisplayId',
    'submitter',
    'score',
    'weightedScore',
    'status',
    'submittedAt',
    ...tcHeaders,
    'teamId',
  ];
  const lines = [head.map(esc).join(',')];
  for (const r of board.rows) {
    const tcCells = board.meta.visibleTestcases.flatMap((_, i) => {
      const m = r.testcases[i];
      return [m?.time ?? '', m?.ratio ?? ''];
    });
    lines.push(
      [
        r.rank,
        safeText(r.name),
        r.displayId ?? '',
        safeText(r.submitter),
        r.score,
        Math.round(r.score * board.meta.difficulty * 100) / 100,
        r.status,
        r.submittedAt ?? '',
        ...tcCells,
        r.teamId,
      ]
        .map(esc)
        .join(','),
    );
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

export function csvFilename(boardId: string) {
  return `ict-ops-${boardId}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export const contentDisposition = (filename: string) =>
  `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
