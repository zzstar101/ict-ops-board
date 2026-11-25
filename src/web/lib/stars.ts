import { createStore } from './store.ts';

const STORAGE_KEY = 'ict-ops:stars:v1';

function readInitial(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 40) : [];
  } catch {
    return [];
  }
}

const starsStore = createStore<string[]>(typeof window !== 'undefined' ? readInitial() : []);

function persist(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function toggleStarKey(teamKey: string) {
  if (!teamKey) return;
  starsStore.set((prev) => {
    const next = prev.includes(teamKey) ? prev.filter((k) => k !== teamKey) : [teamKey, ...prev].slice(0, 40);
    persist(next);
    return next;
  });
}

export function clearStars() {
  starsStore.set([]);
  persist([]);
}

export function useStars() {
  const keys = starsStore.use();
  return {
    keys,
    set: new Set(keys),
    isStarred: (teamKey: string) => keys.includes(teamKey),
    toggle: toggleStarKey,
    clear: clearStars,
  };
}
