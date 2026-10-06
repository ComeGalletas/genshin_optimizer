/**
 * The Optimise view (TODO 9.3, ADR-0053): the panel, the run's results
 * (or a shared build's), and, while the server runs, Rank by Team DPS. A
 * lazy chunk like every view past Start; the run's state stays in `App`,
 * so a run outlives a switch of view.
 */
import { lazy, Suspense } from 'react';
import type {
  Artifact,
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';
import type { SharedSim } from '@genshin-build-lab/engine/share/url';
import { OptimizePanel } from './OptimizePanel';
import { Results } from './Results';
import { GapSection } from './GapSection';
import { Section, SharedBuildBanner } from './landing';
import { NeedsData } from './AccountBar';
import { Callout } from './ui/Callout';
import { cn } from './ui/cn';
import { useOptimizeRequest } from '../state/optimizeRequest';

const SimRank = lazy(() =>
  import('../sim-rank/SimRank').then((m) => ({ default: m.SimRank })),
);

function PanelFallback() {
  return <p className="text-sm text-muted">Loading…</p>;
}

export function OptimiseView({
  artifacts,
  artifactsById,
  result,
  request,
  sharedArtifacts,
  sharedSim,
  running,
  optimizeError,
  optimizeErrorDetail,
  runCurrent,
  cancelCurrent,
  serverOnline,
}: {
  artifacts: Artifact[];
  artifactsById: Record<string, Artifact>;
  result: OptimizeResult | null;
  request: OptimizeRequest | null;
  sharedArtifacts: Artifact[] | null;
  sharedSim: SharedSim | null;
  running: boolean;
  optimizeError: boolean;
  optimizeErrorDetail: string;
  runCurrent: () => Promise<void>;
  cancelCurrent: () => void;
  serverOnline: boolean;
}) {
  return (
    <>
      {optimizeError && (
        <Callout
          tone="error"
          className="flex animate-fade-up flex-wrap items-center justify-between gap-3"
        >
          <span>
            Optimisation failed
            {optimizeErrorDetail ? ` — ${optimizeErrorDetail}` : ''}.
          </span>
          <button
            type="button"
            className="btn-ghost flex-none"
            onClick={() => void runCurrent()}
          >
            Retry
          </button>
        </Callout>
      )}
      {artifacts.length === 0 && !sharedArtifacts && (
        <NeedsData view="Optimising" needs="artifacts" />
      )}
      <Section
        id="step-optimise"
        help="optimise"
        title="Optimise"
        hint="An exact search over your artifacts for one character’s best builds: choose who, the weapon, what to maximise and any conditions."
        delay="0s"
      >
        <OptimizePanel
          onRun={runCurrent}
          running={running}
          onCancel={cancelCurrent}
        />
      </Section>

      {result && request && (
        <div id="results-section" className="scroll-mt-20">
          <Section
            title="Results"
            hint="The best builds for your search, best first, with their pieces, totals and where the score comes from."
            help="results"
            delay="0s"
          >
            {sharedArtifacts && (
              <SharedBuildBanner
                request={request}
                {...(sharedSim && { sim: sharedSim })}
              />
            )}
            {/* A run in flight leaves the previous numbers on screen;
              dim them and mark the region busy so they aren't read as
              the new ones. */}
            <div
              aria-busy={running}
              className={cn(
                'transition-opacity',
                running && 'pointer-events-none opacity-40',
              )}
            >
              <GapSection
                result={result}
                request={request}
                artifacts={artifacts}
                sharedArtifacts={sharedArtifacts}
              />
              <Results
                result={result}
                request={request}
                artifactsById={artifactsById}
                onRelax={(key, value) => {
                  // The offer to relax is wired to the store *and* to
                  // a fresh run: the reader shouldn't have to press
                  // Optimise again.
                  useOptimizeRequest.getState().relaxMinStat(key, value);
                  void runCurrent();
                }}
              />
            </div>
          </Section>
        </div>
      )}

      {serverOnline && (
        <Section
          id="sim-rank"
          help="sim-rank"
          title="Rank by Team DPS"
          hint="Simulate the top builds for the Optimise panel's conditions in a team rotation, and rank them by team DPS."
          delay="0s"
        >
          <Suspense fallback={<PanelFallback />}>
            <SimRank />
          </Suspense>
        </Section>
      )}
    </>
  );
}
