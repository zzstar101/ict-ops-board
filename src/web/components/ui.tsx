import type { ReactNode } from 'react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export function DifficultyBadge({ difficulty, compact = false }: { difficulty: number; compact?: boolean }) {
  const tone =
    difficulty >= 3
      ? 'bg-[var(--signal-soft)] text-[var(--signal)] border-[var(--signal-border)]'
      : difficulty === 2
        ? 'bg-[var(--gold-soft)] text-[var(--gold)] border-[var(--gold-border)]'
        : 'bg-[var(--pass-soft)] text-[var(--pass)] border-transparent';
  return (
    <span className={cx('num inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-semibold leading-none', tone)}>
      ×{difficulty}
      {!compact && <span className="ml-1 font-normal opacity-80">+{difficulty * 10}</span>}
    </span>
  );
}

export function RankMark({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="num inline-flex min-w-[26px] items-center justify-center rounded border border-[var(--signal-border)] bg-[var(--signal-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--signal)]">
        01
      </span>
    );
  }
  if (rank <= 3) {
    return (
      <span className="num inline-flex min-w-[26px] items-center justify-center rounded border border-[var(--rule-strong)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ink)]">
        {String(rank).padStart(2, '0')}
      </span>
    );
  }
  return <span className="num inline-block min-w-[26px] text-center text-xs text-[var(--ink-2)]">{rank}</span>;
}

export function CrownPill({ bonus, count }: { bonus: number; count?: number }) {
  if (bonus <= 0) return null;
  return (
    <span
      className="num inline-flex items-center gap-1 rounded border border-[var(--gold-border)] bg-[var(--gold-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-[var(--gold)]"
      title={count ? `当前手握 ${count} 道算子题第 1 名，共获 +${bonus} 榜首奖励分` : `单题第 1 名奖励 +${bonus} 分`}
    >
      +{bonus}
      {count != null && count > 1 && <span className="opacity-75">({count}冠)</span>}
    </span>
  );
}

export function StarButton({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={on}
      aria-label={on ? `取消关注 ${label}` : `关注 ${label}`}
      title={on ? '取消关注' : '关注队伍（置顶对比）'}
      className={cx(
        'inline-flex size-6 items-center justify-center rounded transition-colors cursor-pointer',
        on ? 'text-[var(--signal)]' : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
      )}
    >
      <svg viewBox="0 0 20 20" className="size-3.5" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 2.6l2.24 4.54 5.01.73-3.62 3.53.85 4.99L10 14.03 5.52 16.39l.85-4.99-3.62-3.53 5.01-.73L10 2.6z"
        />
      </svg>
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-14 text-center text-sm text-[var(--ink-2)]">{children}</div>;
}
