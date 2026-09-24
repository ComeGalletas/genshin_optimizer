import type { OptimizeProgress } from '../workers/optimizeClient';

/** Everything the progress line shows: the search's own counters, plus the
 *  wall clock. Elapsed is ticked here rather than read off the progress
 *  messages, because the synchronous fallback emits none and a clock that
 *  stops moving reads as a hang. */
export interface SearchProgressSnapshot {
  progress: OptimizeProgress | null;
  elapsedMs: number;
}

/**
 * A module-level store for the progress line, deliberately outside React
 * state.
 *
 * Progress ticks five times a second and the clock five times a second on top
 * of that. Held in `App`'s own state, every tick re-rendered the entire page —
 * every panel, the results table, the gap report. Subscribed to here, a tick
 * re-renders `SearchProgressLine` and nothing else. `App` stays the only
 * writer: it owns the run lifecycle.
 */
function createSearchProgressStore() {
  let snapshot: SearchProgressSnapshot = { progress: null, elapsedMs: 0 };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  const emit = (next: SearchProgressSnapshot) => {
    snapshot = next;
    for (const l of listeners) l();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    /** A run started. Clears the counters and *restarts* the clock — a run
     *  that supersedes another must not inherit its start time. */
    start() {
      if (timer) clearInterval(timer);
      const startedAt = Date.now();
      emit({ progress: null, elapsedMs: 0 });
      timer = setInterval(
        () => emit({ ...snapshot, elapsedMs: Date.now() - startedAt }),
        200,
      );
    },
    report(progress: OptimizeProgress) {
      emit({ ...snapshot, progress });
    },
    /** The run ended (done, failed, or cancelled). Stops the clock. */
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      emit({ progress: null, elapsedMs: 0 });
    },
  };
}

export const searchProgressStore = createSearchProgressStore();
