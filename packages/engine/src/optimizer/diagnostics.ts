import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
  BuildResult,
  BuildDiagnostics,
  Slot,
  StatKey,
} from '../game/types';
import { SLOTS } from '../game/types';
import { totals, evaluateObjective } from './score';
// `../labels-core`, not `../labels`: this module runs inside the optimize
// worker (via `search.ts`), which must not statically import the adapter —
// see the `data.generated.json` note in `labels-core.ts` and the `setNames`
// doc on `OptimizeContext`.
import {
  statLabel,
  setRequirementLabelFrom,
  SLOT_LABELS,
} from '../labels-core';
import { reachableCeiling } from './search';

/** A minStat is "binding" when the build clears it by less than this fraction
 *  of the target. 5% is a display heuristic (call a constraint "just barely
 *  met" vs "comfortable") — not correctness-critical. */
const BINDING_MARGIN = 0.05;

export function buildDiagnostics(
  ctx: OptimizeContext,
  req: OptimizeRequest,
  b: BuildResult,
  chosen: Artifact[],
  explored: number,
  pruned: number,
): BuildDiagnostics {
  const binding: string[] = [];
  if (req.constraints.setRequirement)
    binding.push(
      `Set requirement: ${setRequirementLabelFrom(req.constraints.setRequirement, ctx.setNames)}`,
    );
  for (const k of Object.keys(req.constraints.minStats ?? {}) as StatKey[]) {
    const need = req.constraints.minStats![k] ?? 0;
    const have = b.totals[k] ?? 0;
    if (have - need < need * BINDING_MARGIN)
      binding.push(`${statLabel(k)} ≥ ${need} (build has ${have.toFixed(1)})`);
  }

  const marginalBySlot: Partial<Record<Slot, number>> = {};
  const fullObj = evaluateObjective(ctx, req.objective, totals(ctx, chosen));
  for (const slot of SLOTS) {
    const without = chosen.filter((a) => a.slot !== slot);
    marginalBySlot[slot] =
      fullObj - evaluateObjective(ctx, req.objective, totals(ctx, without));
  }
  return { bindingConstraints: binding, marginalBySlot, explored, pruned };
}

/** How far a single minStat floor is out of reach, given the inventory. */
export interface StatCeiling {
  key: StatKey;
  /** The floor the request asks for. */
  need: number;
  /** The optimistic ceiling for this stat — the same admissible bound the
   *  search prunes `minStats` with (`reachableCeiling`). No build over this
   *  inventory can exceed it; some builds may fall short of it. */
  best: number;
}

/**
 * The first slot with no legal piece, named in the reader's terms — the
 * search's own hard-infeasible case (`poolsBySlot` yielding an empty pool).
 * A main-stat lock is the usual culprit, so say so when one is in force.
 */
export function emptySlotCause(
  req: OptimizeRequest,
  inventory: Artifact[],
): string | null {
  const locks = req.constraints.mainStatLocks;
  for (const slot of SLOTS) {
    const lock = locks?.[slot];
    const any = inventory.some(
      (a) => a.slot === slot && (!lock || a.mainStat === lock),
    );
    if (any) continue;
    return lock
      ? `You own no ${SLOT_LABELS[slot].toLowerCase()} with a ${statLabel(
          lock,
        )} main stat.`
      : `You own no ${SLOT_LABELS[slot].toLowerCase()} at all.`;
  }
  return null;
}

/**
 * The minStat floors provably out of reach, worst relative shortfall first.
 *
 * Measured against `reachableCeiling` — the very bound the search prunes
 * `minStats` with. That makes this list sound but not complete: a floor listed
 * here is genuinely unreachable, while an empty list only means no single
 * floor is *provably* to blame (two floors that clash only together, an
 * optimistic set bonus no real layout can pair with the pieces that carry the
 * stat), and the caller should stay vague.
 */
export function unreachableMinStats(
  ctx: OptimizeContext,
  req: OptimizeRequest,
  inventory: Artifact[],
): StatCeiling[] {
  const ceiling = reachableCeiling(ctx, req, inventory);
  if (!ceiling) return [];
  const out: StatCeiling[] = [];
  for (const key of Object.keys(req.constraints.minStats ?? {}) as StatKey[]) {
    const need = req.constraints.minStats![key] ?? 0;
    const best = ceiling[key] ?? 0;
    if (best < need) out.push({ key, need, best });
  }
  // Relative, not absolute: a 50-point ER gap and a 50-point ATK gap are not
  // the same size of problem, and the reader wants the one they are furthest
  // from clearing named first.
  return out.sort(
    (a, b) => (b.need - b.best) / b.need - (a.need - a.best) / a.need,
  );
}
