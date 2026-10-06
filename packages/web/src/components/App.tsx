/**
 * The top-level `App` (TODO 9.3–9.5, ADR-0053): a header with the account
 * bar, a menu of views, and one view at a time, each at its own address
 * (`#/plan`). The app opens empty, on the Start view's three choices, and
 * never locks a view: one without the data it needs says so in place.
 * @packageDocumentation
 */

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ImportPanel } from './ImportPanel';
import { ServerChip } from './ServerChip';
import { ChatPanel } from './ChatPanel';
import { useServer } from '../local-server/status';
import { useSettings } from '../state/settings';
import {
  decodeBuild,
  type SharedSim,
} from '@genshin-build-lab/engine/share/url';
import { useInventory } from '../state/inventory';
import { useRoster } from '../state/roster';
import {
  useOptimizeRequest,
  isDefaultSelection,
} from '../state/optimizeRequest';
import { bestBuiltCharacter } from '@genshin-build-lab/engine/roster/buildScore';
import {
  GAME_VERSION,
  GENSHIN_DB_VERSION,
  SNAPSHOT_DATE,
} from '@genshin-build-lab/engine/game/genshin/adapter';
import { CURATION_PATCH } from '@genshin-build-lab/engine/curation';
import { useOptimizeRun } from '../hooks/useOptimizeRun';
import { scrollToId } from '../ui/scroll';
import { Callout } from './ui/Callout';
import { cn } from './ui/cn';
import type {
  Artifact,
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';
import { Section } from './landing';
import { AccountBar, NeedsData } from './AccountBar';
import { useAccount } from '../state/account';
import { goTo, hrefOf, NAV, useAddressedView, type ViewId } from './views';

// Each view past Start is its own chunk, loaded when first opened.
const RosterView = lazy(() =>
  import('../roster/RosterView').then((m) => ({ default: m.RosterView })),
);
const TeamsView = lazy(() =>
  import('../teams/TeamsView').then((m) => ({ default: m.TeamsView })),
);
const PlanView = lazy(() =>
  import('../plan/PlanView').then((m) => ({ default: m.PlanView })),
);
// Server-only (TODO 6.2, 8.1): never loaded client-only.
const ImportCenter = lazy(() =>
  import('../import-center/ImportCenter').then((m) => ({
    default: m.ImportCenter,
  })),
);
const RotationLibrary = lazy(() =>
  import('../rotations/RotationLibrary').then((m) => ({
    default: m.RotationLibrary,
  })),
);
const OptimiseView = lazy(() =>
  import('./OptimiseView').then((m) => ({ default: m.OptimiseView })),
);
// Opens client-only: a shared comparison is data, nothing re-runs (8.3).
const SharedComparison = lazy(() =>
  import('../teams/SharedComparison').then((m) => ({
    default: m.SharedComparison,
  })),
);
const TeamComparison = lazy(() =>
  import('../teams/TeamComparison').then((m) => ({
    default: m.TeamComparison,
  })),
);

/** Minimal fallback for a lazy view: a line of text, not a skeleton. */
function PanelFallback() {
  return <p className="text-sm text-muted">Loading…</p>;
}

// Display-only vocabulary for the one game this app supports (ADR-0012).
const GAME_TAGLINE =
  'Find the mathematically optimal artifact build for any character.';
const GAME_SOURCE = 'genshin-db';

/** "Show game art" (ADR-0052): the game's images are loaded from Enka and
 *  HoYoverse, which see the reader's address; off, the app's own glyphs. */
function ArtSetting() {
  const showArt = useSettings((s) => s.showArt);
  const setShowArt = useSettings((s) => s.setShowArt);
  return (
    <label className="mt-2 flex items-center justify-center gap-2">
      <input
        type="checkbox"
        checked={showArt}
        onChange={(e) => setShowArt(e.target.checked)}
      />
      Show game art (images from Enka and HoYoverse)
    </label>
  );
}

export function App() {
  const artifacts = useInventory((s) => s.artifacts);
  const rosterEntries = useRoster((s) => s.entries);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [request, setRequest] = useState<OptimizeRequest | null>(null);
  const [sharedArtifacts, setSharedArtifacts] = useState<Artifact[] | null>(
    null,
  );
  const [sharedError, setSharedError] = useState(false);
  // A shared build's team simulation, when the link carries one (8.3).
  const [sharedSim, setSharedSim] = useState<SharedSim | null>(null);
  // A shared team comparison (`#c=`, TODO 8.3): read once, closed by the
  // reader.
  const [comparisonParam, setComparisonParam] = useState(() =>
    window.location.hash.startsWith('#c=') ? window.location.hash.slice(3) : '',
  );
  // A shared build (`?b=`) opens on Optimise.
  const [buildLink] = useState(() =>
    new URLSearchParams(window.location.search).has('b'),
  );
  const serverOnline = useServer((s) => s.status === 'online');
  const loadedText = useAccount((s) => s.loaded);

  // Is the local server running (TODO 3.5)? Checked on start and on every
  // return to the tab, so starting it later needs no reload; without it the
  // app stays client-only (ADR-0021 §3).
  useEffect(() => {
    const check = () => void useServer.getState().check();
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  // Once a roster exists the app's opening pair is no longer the most useful
  // one — the reader's own best-built character is. Only while the selection
  // is untouched: a pick the reader (or a shared ?b= link) made must never be
  // overwritten, which is what `isDefaultSelection` guards. The weapon is not
  // set here: `setCharacterKey` already prefers this character's
  // roster-equipped weapon, through `legalWeapon`.
  useEffect(() => {
    const s = useOptimizeRequest.getState();
    if (!isDefaultSelection(s)) return;
    const best = bestBuiltCharacter(rosterEntries, artifacts);
    if (!best) return;
    s.setCharacterKey(best.characterKey);
  }, [rosterEntries, artifacts]);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('b');
    if (!param) return;
    let cancelled = false;
    // decodeBuild never rejects (its own try/catch resolves { error } instead),
    // so this fire-and-forget is by design, not a missed rejection handler.
    void decodeBuild(param).then((out) => {
      if (cancelled) return;
      if ('error' in out) {
        setSharedError(true);
        return;
      }
      setRequest(out.request);
      setResult({ status: 'ok', builds: [out.build], explored: 0, pruned: 0 });
      setSharedArtifacts(out.artifacts);
      if (out.sim) setSharedSim(out.sim);
      // Hydrate the Optimise panel's own store too, so it shows the shared
      // build's character and weapon, not its default.
      const optReq = useOptimizeRequest.getState();
      optReq.applyPreset({
        characterKey: out.request.characterKey,
        weaponKey: out.request.weaponKey,
        objective: out.request.objective,
        constraints: out.request.constraints,
      });
      optReq.setBuildLevel(out.request.buildLevel);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve artifacts for Results: a shared build carries its own five
  // artifacts; a freshly-optimised build resolves ids against the inventory.
  const artifactsById = useMemo(() => {
    const src = sharedArtifacts ?? artifacts;
    const m: Record<string, Artifact> = {};
    for (const a of src) m[a.id] = a;
    return m;
  }, [sharedArtifacts, artifacts]);

  const {
    running,
    optimizeError,
    optimizeErrorDetail,
    announcement,
    runCurrent,
    cancelCurrent,
  } = useOptimizeRun({
    // A fresh run replaces whatever Results was showing, so the banner about
    // the shared build that couldn't be read no longer describes anything.
    onRunStart: () => setSharedError(false),
    onSuccess: (r, req) => {
      setSharedArtifacts(null);
      setResult(r);
      setRequest(req);
      // Results live on Optimise; a run started from elsewhere (the
      // roster's "optimise this character") lands there.
      goTo('optimise');
      setTimeout(() => scrollToId('results-section'), 50);
    },
  });

  const hasRoster = Object.keys(rosterEntries).length > 0;
  const loaded = artifacts.length > 0 || hasRoster;

  // The view: the address's, else the one a link opens, else Start while
  // nothing is loaded, else the roster (or Optimise without one).
  const addressed = useAddressedView();
  const view: ViewId =
    addressed ??
    (comparisonParam
      ? 'simulate'
      : buildLink
        ? 'optimise'
        : !loaded
          ? 'start'
          : hasRoster
            ? 'roster'
            : 'optimise');

  // The menu: server views only while the server runs (or, for Simulate, a
  // shared comparison is open).
  const nav = NAV.filter(
    (v) =>
      !v.server ||
      serverOnline ||
      (v.id === 'simulate' && Boolean(comparisonParam)),
  );

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-5 py-8 sm:py-10">
      <a
        href="#content"
        className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-700 focus:px-4 focus:py-2 focus:text-paper"
        onClick={(e) => {
          // A hash link here would be read as a view address.
          e.preventDefault();
          document.getElementById('content')?.focus();
        }}
      >
        Skip to Content
      </a>
      <header className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-paper">
              RPG Build Optimizer
            </h1>
            <p className="text-xs text-muted">{GAME_TAGLINE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-jade" />
              {GAME_SOURCE} · patch {GAME_VERSION}
            </span>
            <ServerChip />
          </div>
        </div>
        <AccountBar onStart={view === 'start'} />
        {loadedText && view !== 'start' && (
          <Callout
            tone="success"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span>{loadedText}</span>
            <button
              type="button"
              className="btn-ghost flex-none"
              onClick={() => useAccount.getState().setLoaded(null)}
            >
              Dismiss
            </button>
          </Callout>
        )}
      </header>

      <nav
        aria-label="Views"
        className="sticky top-0 z-20 -mx-5 mb-6 flex snap-x scroll-px-5 gap-2 overflow-x-auto border-b border-white/5 bg-surface-800/80 px-5 py-2 backdrop-blur-md"
      >
        {nav.map((v) => {
          const current = view === v.id;
          return (
            <a
              key={v.id}
              href={hrefOf(v.id)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'chip touch-target flex-none snap-start items-center whitespace-nowrap transition-colors hover:border-accent/40 hover:text-paper',
                current && 'border-accent/60 bg-accent/10 text-paper',
              )}
            >
              {v.label}
              {v.server && (
                <>
                  <span
                    aria-hidden="true"
                    title="Needs the local server"
                    className="h-1.5 w-1.5 rounded-full bg-jade"
                  />
                  <span className="sr-only"> (local server)</span>
                </>
              )}
            </a>
          );
        })}
      </nav>

      <main id="content" tabIndex={-1} className="focus:outline-none">
        {/* One persistent live region for the whole page: a region mounted in
          the same commit as its text is not yet observed. */}
        <p className="sr-only" role="status">
          {announcement && (
            <span key={announcement.nonce}>{announcement.text}</span>
          )}
        </p>
        {/* The last load, announced here: the Start view's own region goes
          when the load opens another view. */}
        <p className="sr-only" role="status">
          {view !== 'start' ? (loadedText ?? '') : ''}
        </p>
        <p className="sr-only" role="alert">
          {sharedError
            ? 'This shared build couldn’t be read.'
            : optimizeError
              ? 'Optimisation failed.'
              : ''}
        </p>

        {sharedError && (
          <Callout
            tone="error"
            className="mb-8 flex animate-fade-up flex-wrap items-center justify-between gap-3"
          >
            <span>
              This shared build couldn’t be read — it may be from a newer
              version.
            </span>
            <button
              type="button"
              className="btn-ghost flex-none"
              onClick={() => {
                setSharedError(false);
                window.history.pushState({}, '', '/');
              }}
            >
              Start Fresh
            </button>
          </Callout>
        )}

        <div className="space-y-10" data-view={view}>
          {view === 'start' && (
            <Section
              id="step-load"
              help="start"
              title="Load Data"
              hint="Start from the demo data, your account on the local server, or a new source."
              delay="0s"
            >
              <ImportPanel />
            </Section>
          )}

          {view === 'roster' &&
            (hasRoster ? (
              <Section
                id="step-roster"
                help="roster"
                title="Your Roster"
                hint="How built each of your characters is, scored 0–100 from level, talents, weapon and artifacts, best first. Open one for its details."
                delay="0s"
              >
                <Suspense fallback={<PanelFallback />}>
                  <RosterView />
                </Suspense>
              </Section>
            ) : (
              <NeedsData view="The roster" needs="a roster" />
            ))}

          {view === 'teams' &&
            (hasRoster ? (
              <Section
                id="step-teams"
                help="teams"
                title="Endgame Teams"
                hint="Two Abyss halves that share no character, matched from your roster."
                delay="0s"
              >
                <Suspense fallback={<PanelFallback />}>
                  <TeamsView />
                </Suspense>
              </Section>
            ) : (
              <NeedsData view="Teams" needs="a roster" />
            ))}

          {view === 'plan' &&
            (hasRoster ? (
              <Section
                id="step-plan"
                help="plan"
                title="Your Plan"
                hint="An optimised build for all eight members of your two teams from one shared inventory, plus one list of what to farm."
                delay="0s"
              >
                <Suspense fallback={<PanelFallback />}>
                  <PlanView />
                </Suspense>
              </Section>
            ) : (
              <NeedsData view="The plan" needs="a roster" />
            ))}

          {view === 'optimise' && (
            <Suspense fallback={<PanelFallback />}>
              <OptimiseView
                artifacts={artifacts}
                artifactsById={artifactsById}
                result={result}
                request={request}
                sharedArtifacts={sharedArtifacts}
                sharedSim={sharedSim}
                running={running}
                optimizeError={optimizeError}
                optimizeErrorDetail={optimizeErrorDetail}
                runCurrent={runCurrent}
                cancelCurrent={cancelCurrent}
                serverOnline={serverOnline}
              />
            </Suspense>
          )}

          {view === 'simulate' && (
            <>
              {comparisonParam && (
                <Section
                  id="shared-comparison"
                  title="Shared Team Comparison"
                  delay="0s"
                >
                  <Suspense fallback={<PanelFallback />}>
                    <SharedComparison
                      param={comparisonParam}
                      onClose={() => {
                        setComparisonParam('');
                        history.replaceState(
                          null,
                          '',
                          location.pathname +
                            location.search +
                            hrefOf('simulate'),
                        );
                        window.dispatchEvent(new HashChangeEvent('hashchange'));
                      }}
                    />
                  </Suspense>
                </Section>
              )}
              {serverOnline ? (
                <>
                  <Section
                    id="compare-teams"
                    help="compare-teams"
                    title="Compare Teams"
                    hint="Simulate a team from the rotation library against up to five variants: a weapon, a set, a teammate, the enemy or the rotation."
                    delay="0s"
                  >
                    <Suspense fallback={<PanelFallback />}>
                      <TeamComparison />
                    </Suspense>
                  </Section>
                  <Section
                    id="rotation-library"
                    help="rotation-library"
                    title="Rotation Library"
                    hint="The gcsim rotations the server can simulate: each team, where it came from, how its run compares with the published number, and its action list."
                    delay="0s"
                  >
                    <Suspense fallback={<PanelFallback />}>
                      <RotationLibrary />
                    </Suspense>
                  </Section>
                </>
              ) : (
                !comparisonParam && (
                  <NeedsData view="Simulating" needs="the local server" />
                )
              )}
            </>
          )}

          {view === 'imports' &&
            (serverOnline ? (
              <Section
                id="import-center"
                help="imports"
                title="Import Center"
                hint="The local server's sources, snapshots and merges: what each import changed and how they were reconciled."
                delay="0s"
              >
                <Suspense fallback={<PanelFallback />}>
                  <ImportCenter />
                </Suspense>
              </Section>
            ) : (
              <NeedsData view="The import center" needs="the local server" />
            ))}
        </div>
      </main>

      <footer className="mt-16 border-t border-white/5 pt-6 text-center text-xs text-muted">
        Built with branch-and-bound optimization in a Web Worker · Data from{' '}
        {/* nowrap keeps each version together at phone width. */}
        <span className="whitespace-nowrap">
          {GAME_SOURCE} {GENSHIN_DB_VERSION}
        </span>{' '}
        (released{' '}
        <time dateTime={SNAPSHOT_DATE} className="whitespace-nowrap">
          {SNAPSHOT_DATE}
        </time>
        ),{' '}
        <span className="whitespace-nowrap">game version {GAME_VERSION}</span> ·
        Curated tables:{' '}
        <span className="whitespace-nowrap">patch {CURATION_PATCH}</span> · Not
        affiliated with the game’s publisher.
        <ArtSetting />
      </footer>
      <ChatPanel />
    </div>
  );
}
