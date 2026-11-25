import { createStore } from './store.ts';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'ict-ops:theme';

function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

const themeStore = createStore<ThemeMode>(typeof window !== 'undefined' ? loadTheme() : 'system');

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

if (typeof window !== 'undefined') {
  applyTheme(themeStore.get());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeStore.get() === 'system') applyTheme('system');
  });
}

export function setThemeMode(mode: ThemeMode) {
  themeStore.set(mode);
  applyTheme(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function cycleThemeMode() {
  const cur = themeStore.get();
  const next: ThemeMode = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system';
  setThemeMode(next);
}

export const useThemeMode = () => themeStore.use();
