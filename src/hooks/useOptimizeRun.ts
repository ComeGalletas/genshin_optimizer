/**
 * The optimise run lifecycle for `App`: starting/cancelling a search against
 * the current request + inventory, the token that lets only the most
 * recently started run commit its outcome, and the one persistent
 * live-region announcement it drives. Extracted verbatim from `App.tsx` — no
 * behaviour change (see ADR-agnostic issue #103).
 * @packageDocumentation
 */

import { useRef, useState } from 'react';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest, currentRequest } from '../state/optimizeRequest';
import { searchProgressStore } from '../components/searchProgress';
import {
  optimizeRun,
  isOptimizeCancelled,
  type OptimizeHandle,
  type OptimizeProgress,
} from '../workers/optimizeClient';
import type {
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';

export interface UseOptimizeRunOptions {
  /** Called right before a new run's search actually starts (after the
   *  superseded run, if any, has been told to cancel) — the hook's caller
   *  uses this to clear state that only makes sense for the previous
   *  outcome, e.g. a shared-build banner. */
  onRunStart?: () => void;
  /** Called when a run settles successfully and is still the current one. */
  onSuccess: (result: OptimizeResult, request: OptimizeRequest) => void;
}

/** One persistent announcement's shape — a nonce keys the text so two
 *  announcements with identical wording still count as distinct nodes for
 *  the live region (it only speaks when its content changes). */
export interface Announcement {
  nonce: number;
  text: string;
}

export interface UseOptimizeRunResult {
  running: boolean;
  optimizeError: boolean;
  optimizeErrorDetail: string;
  announcement: Announcement | null;
  runCurrent: () => Promise<void>;
  cancelCurrent: () => void;
}

/**
 * Owns the optimise run lifecycle: the run token, the in-flight handle, the
 * running/error state, and the live-region announcer — everything `App`
 * needs to wire `OptimizePanel`/`SampleGear`'s Run and Cancel controls.
 */
export function useOptimizeRun(
  options: UseOptimizeRunOptions,
): UseOptimizeRunResult {
  const { onRunStart, onSuccess } = options;

  const [running, setRunning] = useState(false);
  const [optimizeError, setOptimizeError] = useState(false);
  const [optimizeErrorDetail, setOptimizeErrorDetail] = useState('');

  // One persistent announcement for the whole page. Written by the run
  // itself rather than by an effect on `result`, so a shared ?b= hydration
  // (which is not an optimisation) never claims one finished.
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // A live region only speaks when its content *changes*, so two runs that
  // finish with the same sentence used to announce once. The nonce keys the
  // text below, making every announcement a distinct node.
  const announceNonce = useRef(0);
  function announce(text: string) {
    setAnnouncement(text ? { nonce: ++announceNonce.current, text } : null);
  }

  // Guards against a stale run's result clobbering a newer one: OptimizePanel
  // and SampleGear share `running` so their controls disable together, but a
  // same-tick double-trigger can still start two runs before either's
  // disable reaches the DOM — this token makes only the most recently
  // started run allowed to commit its outcome or clear `running`.
  const runToken = useRef(0);
  // The run in flight, so it can be stopped — by Cancel, or by the next run
  // superseding it. Without this a superseded search kept burning a core to
  // produce an answer nobody was allowed to commit.
  const currentRun = useRef<OptimizeHandle | null>(null);

  function cancelCurrent() {
    // Deliberately does *not* advance runToken: the in-flight run's own
    // rejection handler is what clears `running` and announces, and it only
    // does that while its token is still current.
    currentRun.current?.cancel();
  }

  async function runCurrent() {
    const req = currentRequest(useOptimizeRequest.getState());
    const inv = useInventory.getState().artifacts;
    if (inv.length === 0 || !req.characterKey) return;
    const token = ++runToken.current;
    // Token first, then stop the old worker: the superseded run's rejection
    // now sees a stale token and bows out silently.
    const superseded = currentRun.current;
    superseded?.cancel();
    setRunning(true);
    // Restarts the clock as well as clearing the counters, so a superseding
    // run doesn't inherit the elapsed time of the one it replaced.
    searchProgressStore.start();
    setOptimizeError(false);
    setOptimizeErrorDetail('');
    onRunStart?.();
    try {
      const run = optimizeRun(req, inv, (p: OptimizeProgress) => {
        if (runToken.current === token) searchProgressStore.report(p);
      });
      currentRun.current = run;
      const r = await run.result;
      if (runToken.current !== token) return; // superseded by a newer run
      onSuccess(r, req);
      announce(
        r.status === 'ok'
          ? `Optimisation complete — ${r.builds.length} ${r.builds.length === 1 ? 'build' : 'builds'}.`
          : 'Optimisation complete — no build satisfies all constraints.',
      );
    } catch (err) {
      if (runToken.current !== token) return;
      // The user stopped it on purpose: no error banner, and the results
      // region simply un-dims with whatever it was already showing.
      if (isOptimizeCancelled(err)) {
        announce('Optimisation cancelled.');
        return;
      }
      // A worker/protocol rejection (or bad game data) must not vanish
      // silently — surface it instead of dropping back to idle with no cue.
      console.error('Optimize failed', err);
      // The failure is announced by the assertive region below, not here.
      setOptimizeError(true);
      setOptimizeErrorDetail(err instanceof Error ? err.message : '');
      announce('');
    } finally {
      if (runToken.current === token) {
        currentRun.current = null;
        setRunning(false);
        searchProgressStore.stop();
      }
    }
  }

  return {
    running,
    optimizeError,
    optimizeErrorDetail,
    announcement,
    runCurrent,
    cancelCurrent,
  };
}
