/**
 * "Try with example gear" sample mode: the bundled deterministic sample
 * inventory, curated presets that each demonstrate a different constraint
 * mechanism, and the landing-page hero example solved live on mount.
 * @packageDocumentation
 */

import {
  makeInventory,
  naiveCount,
  DEFAULT_SEED,
} from '../optimizer/benchmark';
import { buildContext } from '../optimizer/context';
import { searchBuilds } from '../optimizer/search';
import type {
  Artifact,
  BuildResult,
  OptimizeRequest,
  Slot,
} from '../game/types';
import { SLOTS } from '../game/types';

/**
 * A real solve for the hero: same seeded synthetic-inventory generator as
 * docs/speed-report.md, run synchronously (no worker, no mocked client) so it
 * can render on mount without touching the optimize() dispatch path.
 *
 * It is a **fixed demo bag**, not the reader's inventory, and the hero copy
 * says so — the numbers below are the shape of one canned problem, and framing
 * them as "your" result would be a claim the page hasn't earned.
 *
 * `naive` is the size of the *search space* (every slot combination), not work
 * performed: branch-and-bound visits `explored` leaves and discards `pruned`
 * subtrees, which is the whole point. Copy that says "searched {naive}" is
 * describing brute force, which is not what ran.
 */
export interface HeroExample {
  request: OptimizeRequest;
  build: BuildResult;
  artifacts: Artifact[];
  /** Size of the search space — every slot combination, not evaluations. */
  naive: number;
  /** Leaves actually evaluated. */
  explored: number;
  /** Subtrees discarded by the bound. */
  pruned: number;
}

export function buildHeroExample(): HeroExample | null {
  const request: OptimizeRequest = {
    characterKey: 'furina',
    weaponKey: 'aquila_favonia',
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
    topK: 1,
  };
  // 50 pieces keeps this well under 100ms (see docs/speed-report.md) so it can
  // run on mount without blocking first paint, while still showing real pruning.
  const inventory = makeInventory(50, DEFAULT_SEED);
  const ctx = buildContext(request);
  const res = searchBuilds(request, inventory, ctx);
  if (res.status !== 'ok') return null;

  const build = res.builds[0];
  const bySlot = new Map(inventory.map((a) => [a.id, a]));
  const artifacts = SLOTS.map((s: Slot) =>
    bySlot.get(build.artifactIds[s]),
  ).filter((a): a is Artifact => Boolean(a));
  const naive = naiveCount(inventory);

  return {
    request,
    build,
    artifacts,
    naive,
    explored: res.explored,
    pruned: res.pruned,
  };
}
