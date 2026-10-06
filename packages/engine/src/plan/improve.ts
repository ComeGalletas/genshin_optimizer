/**
 * Allocation v1 (TODO 7.2): the greedy pass (`allocateGreedy`), then a
 * local search that swaps pieces between characters while the plan's score
 * goes up.
 *
 * **The plan's score.** Objectives differ in scale (estimated damage in the
 * tens of thousands, crit value in the hundreds), so each character counts
 * as their build's score (the optimizer's: the objective, less the
 * crit-ratio tiebreak where one is set) over their **solo best** (the best build
 * their spec allows from the whole inventory, as if nobody else wanted a
 * piece), times their weight, averaged over the weights: 1 means everyone
 * has their own best. A character no build fits even alone is left out; one
 * left without a build by the others counts 0.
 *
 * **Moves**, best first, until none helps (or the round budget runs out):
 * - **swap** one slot's pieces between two characters (both allowed to
 *   them, both builds still meeting their constraints);
 * - **take** a free piece in place of one's own;
 * - **re-optimise** one character over the free pieces and their own (an
 *   exact search: several slots at once, a set change, or a build for one
 *   the greedy pass left without);
 * - **pair**: one left without a build re-optimises with another's pieces
 *   in reach, and the other over what is left (two searches a pair, so only
 *   for those without a build).
 * Every move is checked against the same rules as a search (constraints,
 * off-element goblets counting nothing), so the result is a valid plan
 * whose score is never below the greedy one. Pure; the optimizer injected.
 * @packageDocumentation
 */

import type {
  Artifact,
  BuildResult,
  OptimizeResult,
  Slot,
} from '../game/types';
import { SLOTS } from '../game/types';
import { buildContext } from '../optimizer/context';
import type { OptimizeContext } from '../game/types';
import {
  critRatioPenalty,
  evaluateObjective,
  satisfies,
  totals,
} from '../optimizer/score';
import { makeBuildResult } from '../optimizer/search';
import { buildDiagnostics } from '../optimizer/diagnostics';
import { zeroOffElementGoblets } from '../optimizer/element';
import {
  allocateGreedy,
  pickingOrder,
  type AllocatedBuild,
  type AllocationMember,
  type RunOptimize,
} from './allocate';

const EPS = 1e-9;

/** One character's score for five pieces, as the optimizer ranks builds
 *  (the objective less the crit-ratio tiebreak, when their targets set one),
 *  or null when they
 *  break the character's constraints. */
export function buildValue(
  member: AllocationMember,
  ctx: OptimizeContext,
  pieces: readonly Artifact[],
): number | null {
  const counted = zeroOffElementGoblets(pieces, member.characterKey);
  const t = totals(ctx, counted);
  if (!satisfies(member.request.constraints, counted, t)) return null;
  return (
    evaluateObjective(ctx, member.request.objective, t) -
    critRatioPenalty(t, member.request.constraints.critRatioTarget)
  );
}

export interface AllocationV1 {
  /** In picking order, as `allocateGreedy` returns them. */
  builds: AllocatedBuild[];
  /** The plan's score (0–1) after the greedy pass and after the search. */
  score: { greedy: number; improved: number };
  /** Each member's solo best objective value; null when no build fits
   *  them even alone. */
  solo: Record<string, number | null>;
  /** Improving moves applied, by kind. */
  moves: { swap: number; take: number; reoptimise: number; pair: number };
}

export interface ImproveOptions {
  /** Most improving moves to apply (default 200). */
  maxMoves?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Greedy, then local search. */
export async function allocateV1(
  members: readonly AllocationMember[],
  inventory: readonly Artifact[],
  runOptimize: RunOptimize,
  opts: ImproveOptions = {},
): Promise<AllocationV1> {
  const order = pickingOrder(members);
  const greedy = await allocateGreedy(order, inventory, runOptimize, {
    onProgress: (d) => opts.onProgress?.(d, order.length * 2),
  });
  const byId = new Map(inventory.map((a) => [a.id, a]));
  const ctx = new Map<AllocationMember, OptimizeContext>();
  const allowedOf = (m: AllocationMember) => (a: Artifact) =>
    !m.allowed || m.allowed.has(a.id);

  // Each member's solo best: the normaliser of their share of the score.
  const solo = new Map<AllocationMember, number | null>();
  for (const [i, m] of order.entries()) {
    if (m.problem) {
      solo.set(m, null);
    } else {
      ctx.set(m, buildContext(m.request, m.extras));
      const r = await runOptimize(
        { ...m.request, topK: 1 },
        inventory.filter(allowedOf(m)),
        m.extras,
      );
      const best = r.status === 'ok' ? r.builds[0].score : null;
      solo.set(m, best !== null && best > 0 ? best : null);
    }
    opts.onProgress?.(order.length + i + 1, order.length * 2);
  }
  const scored = order.filter((m) => solo.get(m) !== null);
  const totalWeight = scored.reduce((s, m) => s + m.weight, 0) || 1;

  // The assignment: member → their five pieces, by slot.
  const assigned = new Map<AllocationMember, Map<Slot, Artifact>>();
  for (const [i, b] of greedy.builds.entries()) {
    if (b.result.status !== 'ok') continue;
    const ids = b.result.builds[0].artifactIds;
    assigned.set(
      order[i],
      new Map(SLOTS.map((s) => [s, byId.get(ids[s])!] as const)),
    );
  }
  const share = (m: AllocationMember, pieces: readonly Artifact[]) => {
    const s = solo.get(m);
    if (!s) return 0;
    const v = buildValue(m, ctx.get(m)!, pieces);
    return v === null ? -Infinity : (m.weight * v) / s;
  };
  const current = new Map<AllocationMember, number>();
  const recompute = (m: AllocationMember) => {
    const p = assigned.get(m);
    current.set(m, p ? share(m, [...p.values()]) : 0);
  };
  order.forEach(recompute);
  // A build that breaks its own constraints (only possible as given, from
  // an optimizer that saw pieces differently) counts 0 in the score, and
  // -Infinity to the moves, so none ever makes one.
  const score = () =>
    scored.reduce((s, m) => {
      const v = current.get(m) ?? 0;
      return s + (Number.isFinite(v) ? v : 0);
    }, 0) / totalWeight;
  const greedyScore = score();

  const freeBySlot = () => {
    const used = new Set<string>();
    for (const p of assigned.values())
      for (const a of p.values()) used.add(a.id);
    const out = new Map<Slot, Artifact[]>(SLOTS.map((s) => [s, []]));
    for (const a of inventory) if (!used.has(a.id)) out.get(a.slot)!.push(a);
    return out;
  };
  const withPiece = (p: Map<Slot, Artifact>, a: Artifact) =>
    SLOTS.map((s) => (s === a.slot ? a : p.get(s)!));

  const moves = { swap: 0, take: 0, reoptimise: 0, pair: 0 };

  /** The best build for `m` from `pool`, as pieces, or null. */
  const bestFrom = async (m: AllocationMember, pool: Artifact[]) => {
    const r = await runOptimize(
      { ...m.request, topK: 1 },
      pool.filter(allowedOf(m)),
      m.extras,
    );
    if (r.status !== 'ok') return null;
    const ids = r.builds[0].artifactIds;
    return SLOTS.map((sl) => byId.get(ids[sl])!);
  };
  const freePieces = () => [...freeBySlot().values()].flat();
  const asMap = (pieces: Artifact[]) =>
    new Map(pieces.map((a) => [a.slot, a] as const));
  const maxMoves = opts.maxMoves ?? 200;
  let applied = 0;
  while (applied < maxMoves) {
    // Best single swap or take.
    let best: {
      delta: number;
      apply: () => void;
      kind: 'swap' | 'take';
    } | null = null;
    const consider = (
      delta: number,
      kind: 'swap' | 'take',
      apply: () => void,
    ) => {
      if (delta > EPS && (!best || delta > best.delta + EPS))
        best = { delta, apply, kind };
    };
    const holders = scored.filter((m) => assigned.has(m));
    for (let i = 0; i < holders.length; i++)
      for (let j = i + 1; j < holders.length; j++) {
        const [a, b] = [holders[i], holders[j]];
        const [pa, pb] = [assigned.get(a)!, assigned.get(b)!];
        for (const s of SLOTS) {
          const [x, y] = [pa.get(s)!, pb.get(s)!];
          if (!allowedOf(a)(y) || !allowedOf(b)(x)) continue;
          const na = share(a, withPiece(pa, y));
          const nb = share(b, withPiece(pb, x));
          consider(na + nb - current.get(a)! - current.get(b)!, 'swap', () => {
            pa.set(s, y);
            pb.set(s, x);
            recompute(a);
            recompute(b);
          });
        }
      }
    const free = freeBySlot();
    for (const m of holders) {
      const p = assigned.get(m)!;
      for (const s of SLOTS)
        for (const f of free.get(s)!) {
          if (!allowedOf(m)(f)) continue;
          consider(share(m, withPiece(p, f)) - current.get(m)!, 'take', () => {
            p.set(s, f);
            recompute(m);
          });
        }
    }
    if (best) {
      const b: { apply: () => void; kind: 'swap' | 'take' } = best;
      b.apply();
      moves[b.kind]++;
      applied++;
      continue;
    }

    // No single swap helps: re-optimise each member over what is free and
    // their own (this also finds builds for those left without one).
    let improved = false;
    for (const m of scored) {
      if (applied >= maxMoves) break;
      const own = assigned.get(m);
      const pool = [
        ...[...freeBySlot().values()].flat(),
        ...(own ? own.values() : []),
      ].filter(allowedOf(m));
      const r = await runOptimize({ ...m.request, topK: 1 }, pool, m.extras);
      if (r.status !== 'ok') continue;
      const ids = r.builds[0].artifactIds;
      const pieces = SLOTS.map((s) => byId.get(ids[s])!);
      if (share(m, pieces) > current.get(m)! + EPS) {
        assigned.set(m, new Map(pieces.map((a) => [a.slot, a] as const)));
        recompute(m);
        moves.reoptimise++;
        applied++;
        improved = true;
      }
    }
    if (improved) continue;

    // Still nothing: one left without a build re-optimises with another's
    // pieces in reach, then the other re-optimises over what is left. This
    // is the move for "A took the piece B needed, and has another nearly as
    // good". Two searches a pair, so only for those without a build.
    let paired = false;
    for (const b of scored.filter((m) => !assigned.has(m))) {
      for (const a of scored) {
        if (a === b || !assigned.has(a) || applied >= maxMoves) continue;
        const ownA = [...assigned.get(a)!.values()];
        const ownB = [...(assigned.get(b)?.values() ?? [])];
        const free = freePieces();
        const nb = await bestFrom(b, [...free, ...ownB, ...ownA]);
        if (!nb) continue;
        const takenByB = new Set(nb.map((x) => x.id));
        const left = [...free, ...ownB, ...ownA].filter(
          (x) => !takenByB.has(x.id),
        );
        const na = await bestFrom(a, left);
        const before = current.get(a)! + current.get(b)!;
        const after = share(b, nb) + (na ? share(a, na) : 0);
        if (after > before + EPS) {
          assigned.set(b, asMap(nb));
          if (na) assigned.set(a, asMap(na));
          else assigned.delete(a);
          recompute(a);
          recompute(b);
          moves.pair++;
          applied++;
          paired = true;
          break;
        }
      }
      if (paired) break;
    }
    if (!paired) break;
  }

  // The builds, as results the app already shows.
  const builds = greedy.builds.map((g, i): AllocatedBuild => {
    const m = order[i];
    const p = assigned.get(m);
    // Without pieces now (a pair move can leave one so): no build, whatever
    // the greedy pass had given them.
    if (!p)
      return g.result.status === 'ok'
        ? {
            ...g,
            result: {
              status: 'infeasible',
              explored: g.result.explored,
              pruned: g.result.pruned,
            },
          }
        : g;
    const chosen = SLOTS.map((s) => p.get(s)!);
    const c = ctx.get(m)!;
    const counted = zeroOffElementGoblets(chosen, m.characterKey);
    const b: BuildResult = makeBuildResult(c, m.request, counted);
    const result: OptimizeResult = {
      status: 'ok',
      builds: [
        {
          ...b,
          diagnostics: buildDiagnostics(c, m.request, b, counted, 0, 0),
        },
      ],
      explored: g.result.explored,
      pruned: g.result.pruned,
    };
    return { ...g, result };
  });
  return {
    builds,
    score: { greedy: greedyScore, improved: score() },
    solo: Object.fromEntries(order.map((m) => [m.characterKey, solo.get(m)!])),
    moves,
  };
}
