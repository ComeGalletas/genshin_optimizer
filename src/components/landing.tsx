/**
 * Landing/hero pieces for the top-level `App` shell: the numbered `Section`
 * wrapper, the two hero variants, and the banner shown when a shared build
 * link is opened. The step-nav vocabulary lives in `landingSteps.ts` and the
 * scroll-spy hook in `useScrollSpy.ts` — split out so this file only exports
 * components (react-refresh/only-export-components).
 * @packageDocumentation
 */

import { useId, type ReactNode } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type { HeroExample } from '@genshin-build-lab/engine/sample/heroExample';
import { scrollToId } from '../ui/scroll';
import { formatCount, formatScore, objectiveHint } from '../labels';
import { Callout } from './ui/Callout';
import { SearchCounts } from './ui/SearchCounts';
import type { OptimizeRequest } from '@genshin-build-lab/engine/game/types';

export function Section({
  n,
  id,
  title,
  hint,
  delay,
  children,
}: {
  /** Omitted for Results: it's an output of the sequence, not a step in it. */
  n?: number;
  id?: string;
  title: string;
  hint?: string;
  delay: string;
  children: ReactNode;
}) {
  // A <section> is only a landmark once it has an accessible name; unnamed,
  // five of them collapsed into five identical "region" entries.
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="animate-fade-up scroll-mt-20"
      style={{ animationDelay: delay }}
    >
      <div className="mb-3">
        <h2
          id={headingId}
          className="text-pretty font-display text-2xl font-bold tracking-tight text-paper"
        >
          {n != null && (
            <span className="section-badge mr-3 align-middle">
              {String(n).padStart(2, '0')}
            </span>
          )}
          {title}
        </h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Thesis-only hero: shown while the solved demo is computing, or once the user
 *  has their own gear loaded. */
export function ThesisHero({ tagline }: { tagline: string }) {
  return (
    <>
      <h1 className="text-balance font-display text-4xl font-bold leading-tight text-paper sm:text-5xl">
        RPG Build Optimizer
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        {tagline} Exact branch-and-bound search over your inventory — computed
        entirely in your browser, no account required.
      </p>
    </>
  );
}

/** The hero leads with a real solve, not an empty form: one genuine build from
 *  a seeded synthetic inventory (see src/sample/heroExample.ts), plus the exact
 *  search proof — the thing this tool actually does. */
export function SolvedHero({ hero }: { hero: HeroExample }) {
  return (
    <>
      <h1 className="text-balance font-display text-4xl font-bold leading-tight text-paper sm:text-5xl">
        RPG Build Optimizer
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Find the mathematically optimal gear build for any character. Exact
        branch-and-bound search over your inventory — computed entirely in your
        browser, no account required.
      </p>
      <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="micro-label">Crit Value · fixed demo inventory</p>
          <p className="font-mono text-5xl font-bold leading-none text-accent-bright">
            {formatScore(hero.build.objectiveValue, 1)}
          </p>
          <p className="mt-1 max-w-xs text-2xs text-muted">
            {objectiveHint('crit_value')}
          </p>
        </div>
        {/* The big number is the *space*, not the work: branch-and-bound never
            visits 100,000 builds, and saying "searched 100,000" claimed
            brute force. Sentence in the body face, numerals in mono. */}
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          Search space:{' '}
          <span className="font-mono tabular-nums text-paper">
            {formatCount(hero.naive)}
          </span>{' '}
          combinations ·{' '}
          <SearchCounts explored={hero.explored} pruned={hero.pruned} /> —
          optimum proven.
        </p>
      </div>
      <p className="mt-3 text-2xs text-muted">
        Solved on load from a fixed 50-piece demo inventory — not your gear, and
        not a result you asked for.
      </p>
      <a href="#step-load" className="btn-ghost mt-4 inline-flex">
        Load your gear
      </a>
    </>
  );
}

/** A shared ?b= link opens on someone else's build. Say whose, and offer the
 *  one action the page can't infer — re-running it over the reader's own bag
 *  (the request is already hydrated into the Optimise panel). */
export function SharedBuildBanner({ request }: { request: OptimizeRequest }) {
  const character = genshinAdapter.characterName(request.characterKey);
  const weapon =
    genshinAdapter.weapon(request.weaponKey)?.name ?? request.weaponKey;
  return (
    <Callout
      tone="info"
      className="mb-4 flex flex-wrap items-center justify-between gap-3"
    >
      <span>
        Shared build ·{' '}
        <span className="font-semibold text-paper">{character}</span> · {weapon}{' '}
        · Lv {request.buildLevel}. It carries its own five pieces — no search
        ran in your browser.
      </span>
      <button
        type="button"
        className="btn-ghost flex-none"
        onClick={() => scrollToId('step-optimise')}
      >
        Run It Yourself
      </button>
    </Callout>
  );
}
