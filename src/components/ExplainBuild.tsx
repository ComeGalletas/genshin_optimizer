import { useState } from 'react';
import type { Objective, StatVec } from '@genshin-build-lab/engine/game/types';
import type { GapReport } from '@genshin-build-lab/engine/meta/gap';
import { explainBuild } from '../ai/explainClient';
import { toExplainPayload } from '../ai/explainShared';
import { Callout } from './ui/Callout';

export function ExplainBuild({
  characterKey,
  objective,
  totals,
  report,
}: {
  characterKey: string;
  objective: Objective;
  totals: StatVec;
  report: GapReport;
}) {
  const enabled = import.meta.env.VITE_AI_ENABLED === 'true';
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Announcements are keyed by this so a second attempt that produces the same
  // sentence still counts as a change to the live region.
  const [statusNonce, setStatusNonce] = useState(0);

  if (!enabled) return null;

  async function run() {
    // The trigger stays focusable (aria-disabled, not disabled) so a repeat
    // press doesn't drop focus to <body> mid-request.
    if (loading) return;
    setStatusNonce((n) => n + 1);
    setLoading(true);
    setError(false);
    try {
      const text = await explainBuild(
        toExplainPayload(characterKey, objective, totals, report),
      );
      setExplanation(text);
    } catch (err) {
      // Log so a real backend regression is distinguishable from the expected
      // "feature unavailable" path during debugging; UI behaviour is unchanged.
      console.error('Explain build failed', err);
      setError(true);
    } finally {
      setStatusNonce((n) => n + 1);
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      {/* Persistent live regions: announcing only works if the container is
          already in the DOM when its text arrives. The panel below is purely
          visual — its own mount is too late to be observed. */}
      <p className="sr-only" role="status">
        <span key={statusNonce}>
          {loading
            ? 'Generating explanation…'
            : explanation
              ? 'Explanation ready.'
              : ''}
        </span>
      </p>
      {/* The visible Callout is created on demand, so it cannot carry the
          alert role itself; this one is always mounted. */}
      <p className="sr-only" role="alert">
        {error ? 'Couldn’t generate an explanation right now.' : ''}
      </p>
      <div>
        {(explanation || loading) && (
          <div className="panel panel-md space-y-2">
            <p className="field-label">AI explanation</p>
            {loading ? (
              // Skeleton in the box the text will fill, so the panel doesn't
              // appear from nowhere once the request lands.
              <div aria-hidden="true" className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-white/10" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-paper/90">
                {explanation}
              </p>
            )}
          </div>
        )}
      </div>
      {/* The trigger used to vanish for good on success, so a user who wanted
          a second take had no way to ask for one. */}
      <button
        type="button"
        className="btn-ghost mt-2"
        onClick={() => void run()}
        aria-busy={loading}
        aria-disabled={loading}
      >
        {loading
          ? 'Thinking…'
          : explanation
            ? 'Regenerate'
            : 'Explain This Build'}
      </button>
      {error && (
        <Callout tone="error" className="mt-2">
          Couldn’t generate an explanation right now. Try again.
        </Callout>
      )}
    </div>
  );
}
