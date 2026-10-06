/**
 * A resource the page loads once, the first time a component asks, and
 * shares with every component after (the game's image names, the character
 * details). A failed load isn't kept: the next component to ask tries
 * again.
 * @packageDocumentation
 */
import { useSyncExternalStore } from 'react';

export interface LazyResource<T> {
  /** The value; null while loading, 'failed' when the last load failed. */
  useValue: () => T | null | 'failed';
  /** Test hook: this value (or none), as if loaded. */
  setForTests: (value: T | null) => void;
}

export function lazyResource<T>(load: () => Promise<T>): LazyResource<T> {
  let value: T | null = null;
  let failed = false;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  function subscribe(fn: () => void) {
    listeners.add(fn);
    if (failed && !loading) failed = false;
    loading ??= load().then(
      (v) => {
        value = v;
        notify();
      },
      () => {
        failed = true;
        loading = null;
        notify();
      },
    );
    return () => listeners.delete(fn);
  }
  const snapshot = () => (failed ? 'failed' : value);

  return {
    useValue: () => useSyncExternalStore(subscribe, snapshot, snapshot),
    setForTests: (v) => {
      value = v;
      failed = false;
      loading = Promise.resolve();
      notify();
    },
  };
}
