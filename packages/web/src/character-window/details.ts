/**
 * The character and weapon details (ADR-0055), loaded once, the first
 * time a character window asks for them.
 * @packageDocumentation
 */
import { useSyncExternalStore } from 'react';
import {
  loadDetails,
  type Details,
} from '@genshin-build-lab/engine/game/genshin/details';

let details: Details | null = null;
let failed = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(fn: () => void) {
  listeners.add(fn);
  // A failed load isn't kept for the session: the next window tries again.
  if (failed && !loading) failed = false;
  loading ??= loadDetails().then(
    (d) => {
      details = d;
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

/** The details; null while loading, 'failed' when they could not load. */
export function useDetails(): Details | null | 'failed' {
  return useSyncExternalStore(
    subscribe,
    () => (failed ? 'failed' : details),
    () => (failed ? 'failed' : details),
  );
}
