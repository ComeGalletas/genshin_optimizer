/**
 * Pieces of the top-level `App` shell: the `Section` wrapper each view's
 * parts sit in, and the banner shown when a shared build link is opened.
 * @packageDocumentation
 */

import { useId, type ReactNode } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { scrollToId } from '../ui/scroll';
import { objectiveLabel } from '../labels';
import { Callout } from './ui/Callout';
import { HelpButton, HelpPanel } from './help/Help';
import type { HelpId } from './help/topics';
import { kilo } from '../teams/kilo';
import type { OptimizeRequest } from '@genshin-build-lab/engine/game/types';
import type { SharedSim } from '@genshin-build-lab/engine/share/url';

export function Section({
  id,
  title,
  hint,
  help,
  delay,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  /** Its help (TODO 9.6): a "?" beside the title, the panel below. */
  help?: HelpId;
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
        <div className="flex items-center gap-3">
          <h2
            id={headingId}
            className="text-pretty font-display text-2xl font-bold tracking-tight text-paper"
          >
            {title}
          </h2>
          {help && <HelpButton id={help} />}
        </div>
        {hint && <p className="text-xs text-muted">{hint}</p>}
        {help && <HelpPanel id={help} />}
      </div>
      {children}
    </section>
  );
}

/** A shared ?b= link opens on someone else's build. Say whose, and offer the
 *  one action the page can't infer — re-running it over the reader's own bag
 *  (the request is already hydrated into the Optimise panel). */
export function SharedBuildBanner({
  request,
  sim,
}: {
  request: OptimizeRequest;
  /** The build's team simulation, when the link carries one (ADR-0051). */
  sim?: SharedSim;
}) {
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
        {sim && (
          <span className="mt-1 block" data-testid="shared-sim">
            Simulated by the sharer:{' '}
            <span className="font-semibold text-paper">
              {kilo(sim.teamDps.mean)} team DPS
            </span>{' '}
            ({kilo(sim.teamDps.ci95[0])}–{kilo(sim.teamDps.ci95[1])}) in{' '}
            {sim.rotation.name}
            {sim.rotation.status === 'draft'
              ? ' (a draft rotation)'
              : ''} with{' '}
            {sim.teammates
              .map((k) => genshinAdapter.characterName(k))
              .join(', ')}{' '}
            as they had them; #{sim.rank} of {sim.of} by team DPS
            {sim.tiedWithBest && sim.rank > 1 ? ' (tied with the best)' : ''}, #
            {sim.statRank} by {objectiveLabel(request.objective)}
            {sim.characterDps
              ? `; ${character} ${kilo(sim.characterDps.mean)} DPS, ${Math.round(100 * sim.characterDps.share)}% of the team`
              : ''}
            ; {sim.iterations.toLocaleString('en-US')} iterations.
          </span>
        )}
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
