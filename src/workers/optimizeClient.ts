import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';
import { buildContext } from '@genshin-build-lab/engine/optimizer/context';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { runSearchRequest, readSearchResponse } from './protocol';
import type { WorkerRequest, WorkerResponse } from './protocol';

// A goblet's element (ADR-0014) is only meaningful relative to the character
// being optimised for. Off-element goblets are still legal gear (their
// sub-stats count) but their elemental_dmg main stat is dead weight in-game,
// so zero it out before the solver ever sees it — no solver changes needed.
export function zeroOffElementGoblets(
  inventory: Artifact[],
  characterKey: string,
): Artifact[] {
  const character = genshinAdapter.character(characterKey);
  if (!character) return inventory;
  return inventory.map((a) =>
    a.element && a.element !== character.element
      ? { ...a, mainStatValue: 0 }
      : a,
  );
}

/** Mid-flight counters from a run in progress. */
export interface OptimizeProgress {
  explored: number;
  pruned: number;
}

/**
 * Thrown when a run is aborted. Distinguishable from a genuine failure so the
 * UI can go quiet instead of showing an error the user caused on purpose.
 */
export class OptimizeCancelledError extends Error {
  readonly cancelled = true;
  constructor() {
    super('Optimisation cancelled');
    this.name = 'OptimizeCancelledError';
  }
}

/** True for the rejection an aborted run produces. The only producer of that
 *  rejection is `dispatch` in this module, so an instanceof test is exact. */
export function isOptimizeCancelled(err: unknown): boolean {
  return err instanceof OptimizeCancelledError;
}

/** A run in flight: its eventual result, plus the handle that stops it. */
export interface OptimizeHandle {
  result: Promise<OptimizeResult>;
  /** Terminate the worker and reject `result` with an OptimizeCancelledError.
   *  Idempotent, and a no-op once the run has already settled. */
  cancel: () => void;
}

/** Dispatch a fully-built request to the worker, with a synchronous fallback
 *  for environments without Worker (tests, SSR). Each dispatch owns its own
 *  worker and terminates it on settle, so a cancelled run frees its core
 *  immediately and the next call lazily creates a fresh one. */
function dispatch(
  req: OptimizeRequest,
  inventory: Artifact[],
  ctx: OptimizeContext,
  onProgress?: (progress: OptimizeProgress) => void,
): OptimizeHandle {
  let cancel = () => {};
  const result = new Promise<OptimizeResult>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    if (typeof Worker === 'undefined') {
      // The fallback blocks the calling thread, so there is no window in which
      // to interrupt it. Deferring the call by a microtask at least honours a
      // cancel issued before the work starts — which is what a superseding run
      // does — rather than pretending the abort arrived too late.
      cancel = () => settle(() => reject(new OptimizeCancelledError()));
      queueMicrotask(() => {
        if (settled) return;
        try {
          const response = runSearchRequest(
            { req, inventory, ctx },
            onProgress && ((p) => onProgress(p)),
          );
          // `readSearchResponse` throws on an error envelope, and it must
          // throw *inside* settle's callback — after `settled` is already
          // true, the outer catch below could no longer settle anything, so
          // the promise would hang forever.
          settle(() => {
            try {
              resolve(readSearchResponse(response));
            } catch (err) {
              reject(err);
            }
          });
        } catch (err) {
          settle(() => reject(err));
        }
      });
      return;
    }
    const worker = new Worker(
      new URL('./optimize.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    );
    cancel = () =>
      settle(() => {
        worker.terminate();
        reject(new OptimizeCancelledError());
      });
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as WorkerResponse;
      // Progress is a stream, not an outcome: report it and keep listening.
      if (data.type === 'progress') {
        if (!settled) onProgress?.(data);
        return;
      }
      settle(() => {
        try {
          resolve(readSearchResponse(data));
        } catch (err) {
          reject(err);
        } finally {
          worker.terminate();
        }
      });
    };
    worker.onerror = (e) => {
      settle(() => {
        reject(new Error(e.message));
        worker.terminate();
      });
    };
    // Fires if the posted response fails structured-clone deserialization on
    // receipt — without this, neither onmessage nor onerror ever runs and
    // the promise hangs forever (UI stuck on "Searching…").
    worker.onmessageerror = () => {
      settle(() => {
        reject(new Error('worker message could not be deserialized'));
        worker.terminate();
      });
    };
    const message: WorkerRequest = { req, inventory, ctx };
    worker.postMessage(message);
  });
  return { result, cancel: () => cancel() };
}

/**
 * Start an optimisation and get back the run itself — its result and the
 * handle that cancels it — plus an optional stream of progress counters.
 * Owns context assembly + worker dispatch + sync fallback, so callers wire
 * nothing.
 */
export function optimizeRun(
  request: OptimizeRequest,
  inventory: Artifact[],
  onProgress?: (progress: OptimizeProgress) => void,
): OptimizeHandle {
  const ctx = buildContext(request);
  const adjusted = zeroOffElementGoblets(inventory, request.characterKey);
  return dispatch(request, adjusted, ctx, onProgress);
}

/**
 * The optimiser: build the game context for a request and return the top builds
 * over an inventory. The fire-and-forget form of `optimizeRun`, for callers
 * with nothing to cancel and no progress to show.
 */
export async function optimize(
  request: OptimizeRequest,
  inventory: Artifact[],
): Promise<OptimizeResult> {
  return optimizeRun(request, inventory).result;
}
