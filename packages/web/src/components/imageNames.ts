/**
 * The game's image names (ADR-0052), loaded once for every `GameImage` on
 * the page, the first time one mounts.
 * @packageDocumentation
 */
import { useSyncExternalStore } from 'react';
import {
  loadImageNames,
  type ImageNames,
} from '@genshin-build-lab/engine/game/genshin/images';

let names: ImageNames | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  loading ??= loadImageNames().then(
    (n) => {
      names = n;
      listeners.forEach((l) => l());
    },
    () => {
      // No names: every image keeps its fallback.
    },
  );
  return () => listeners.delete(fn);
}
const current = () => names;

/** The names, or null until they arrive. */
export function useImageNames(): ImageNames | null {
  return useSyncExternalStore(subscribe, current, current);
}

/** Test hook: these names (or none), as if loaded. */
export function setImageNamesForTests(n: ImageNames | null) {
  names = n;
  loading = Promise.resolve();
  listeners.forEach((l) => l());
}
