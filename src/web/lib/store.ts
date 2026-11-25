import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
  use(): T;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const get = () => state;
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const set = (next: T | ((prev: T) => T)) => {
    const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
    if (Object.is(value, state)) return;
    state = value;
    for (const fn of listeners) fn();
  };
  return {
    get,
    set,
    subscribe,
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}
