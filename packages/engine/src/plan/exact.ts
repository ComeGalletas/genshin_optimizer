/**
 * Allocation v2 (TODO 7.3): the best plan within each member's top-M
 * candidate builds, exactly.
 *
 * Each member brings their M best builds from the whole inventory (the
 * optimizer's top-K, already diversified by its anti-clone rule), on each
 * of those builds' four-piece cores their best N circlets (N members: what
 * the anti-clone rule would hide), the build allocation v1 gave them, and
 * "no build". The plan picks one option
 * per member, no artifact in two picks, maximising the plan's score (each
 * member's build score over their solo best, weighted; `improve.ts`). That
 * is a weighted set packing: small here (eight members, a few dozen
 * options each), so a branch and bound solves it exactly. It is what PLAN
 * called an ILP, without the solver dependency (ADR-0048).
 *
 * Exact within the pool: a build on a core outside every member's top-M
 * is never seen, which is why v1's build is in it, so v2 never scores below
 * v1. With M covering every core it is exact over every assignment (TODO
 * 7.5 checks it against a brute force). Pure.
 * @packageDocumentation
 */

import type { Artifact } from '../game/types';
import { SLOTS } from '../game/types';
import type { AllocatedBuild, AllocationMember, RunOptimize } from './allocate';
import {
  allocateV1,
  buildValue,
  resultFor,
  type AllocationV1,
} from './improve';
import { buildContext } from '../optimizer/context';

/** One option for a member: its pieces and its share of the score. */
export interface Candidate {
  ids: readonly string[];
  value: number;
}

export interface Solution {
  /** Per member, the index of the chosen candidate, or -1 for none. */
  choice: number[];
  value: number;
  /** False only when `maxNodes` cut the search short (best found kept). */
  exact: boolean;
  nodes: number;
}

/** The best choice of at most one candidate per member, no id in two
 *  choices, maximising the sum of values. Branch and bound: members with
 *  the most at stake first, each one's candidates best first, and a bound
 *  of what each remaining member could still add with what is free. */
export function solvePacking(
  members: readonly (readonly Candidate[])[],
  opts: { maxNodes?: number } = {},
): Solution {
  const maxNodes = opts.maxNodes ?? 2_000_000;
  // Members with the most to gain first; candidates best first.
  const order = members
    .map((c, i) => ({
      i,
      c: [...c.keys()]
        .filter((k) => c[k].value > 0)
        .sort((a, b) => c[b].value - c[a].value),
    }))
    .sort(
      (a, b) =>
        (members[b.i][b.c[0]]?.value ?? 0) - (members[a.i][a.c[0]]?.value ?? 0),
    );
  const used = new Set<string>();
  const pick = new Array<number>(members.length).fill(-1);
  const best = { value: 0, choice: [...pick] };
  let nodes = 0;
  let cut = false;

  const fits = (cand: Candidate) => cand.ids.every((id) => !used.has(id));
  /** What members from `k` on could still add, at most, with what is free. */
  const bound = (k: number) => {
    let b = 0;
    for (let j = k; j < order.length; j++) {
      const { i, c } = order[j];
      for (const x of c)
        if (fits(members[i][x])) {
          b += members[i][x].value;
          break;
        }
    }
    return b;
  };

  const walk = (k: number, value: number) => {
    if (++nodes > maxNodes) {
      cut = true;
      return;
    }
    if (value > best.value + 1e-12) {
      best.value = value;
      best.choice = [...pick];
    }
    if (k === order.length) return;
    if (value + bound(k) <= best.value + 1e-12) return;
    const { i, c } = order[k];
    for (const x of c) {
      const cand = members[i][x];
      if (!fits(cand)) continue;
      for (const id of cand.ids) used.add(id);
      pick[i] = x;
      walk(k + 1, value + cand.value);
      pick[i] = -1;
      for (const id of cand.ids) used.delete(id);
      if (cut) return;
    }
    // Or this member gets nothing.
    walk(k + 1, value);
  };
  walk(0, 0);
  return { choice: best.choice, value: best.value, exact: !cut, nodes };
}

export interface AllocationV2 extends AllocationV1 {
  /** The plan's score: greedy, v1, and v2 (never below v1). */
  score: { greedy: number; improved: number; exact: number };
  /** Whether the branch and bound finished (the plan is optimal within
   *  the candidates), the nodes it took, and the candidates per member. */
  solver: { exact: boolean; nodes: number; candidates: Record<string, number> };
}

/** v1, then the exact choice among each member's top-M builds (and v1's). */
export async function allocateV2(
  members: readonly AllocationMember[],
  inventory: readonly Artifact[],
  runOptimize: RunOptimize,
  opts: { topM?: number; maxNodes?: number } = {},
): Promise<AllocationV2> {
  const topM = opts.topM ?? 20;
  const v1 = await allocateV1(members, inventory, runOptimize);
  const byId = new Map(inventory.map((a) => [a.id, a]));
  const order = v1.builds.map((b) =>
    members.find((m) => m.characterKey === b.characterKey)!,
  );
  const totalWeight =
    order
      .filter((m) => v1.solo[m.characterKey] !== null)
      .reduce((s, m) => s + m.weight, 0) || 1;

  const pools: Candidate[][] = [];
  for (const [i, m] of order.entries()) {
    const solo = v1.solo[m.characterKey];
    if (!solo || m.problem) {
      pools.push([]);
      continue;
    }
    const ctx = buildContext(m.request, m.extras);
    const value = (ids: readonly string[]) => {
      const v = buildValue(
        m,
        ctx,
        ids.map((id) => byId.get(id)!),
      );
      return v === null ? null : (m.weight * v) / solo;
    };
    const r = await runOptimize(
      { ...m.request, topK: topM },
      inventory.filter((a) => !m.allowed || m.allowed.has(a.id)),
      m.extras,
    );
    const seen = new Set<string>();
    const cands: Candidate[] = [];
    const add = (ids: readonly string[]) => {
      const key = [...ids].sort().join('|');
      const v = value(ids);
      if (seen.has(key) || v === null) return;
      seen.add(key);
      cands.push({ ids, value: v });
    };
    if (r.status === 'ok')
      for (const b of r.builds) add(SLOTS.map((s) => b.artifactIds[s]));
    // The optimizer keeps at most two builds per four-piece core (its
    // anti-clone rule), so a third circlet on a core never comes back. The
    // others can hold at most N − 1 circlets, so the member's best N on
    // each core are all a plan can need (TODO 7.5 found the gap).
    const circlets = inventory.filter(
      (a) => a.slot === 'circlet' && (!m.allowed || m.allowed.has(a.id)),
    );
    const cores = new Set(cands.map((c) => c.ids.slice(0, 4).join('|')));
    for (const core of cores) {
      const head = core.split('|');
      circlets
        .map((a) => ({ ids: [...head, a.id], v: value([...head, a.id]) }))
        .filter((x): x is { ids: string[]; v: number } => x.v !== null)
        .sort((x, y) => y.v - x.v)
        .slice(0, order.length)
        .forEach((x) => add(x.ids));
    }
    const own = v1.builds[i].result;
    if (own.status === 'ok')
      add(SLOTS.map((s) => own.builds[0].artifactIds[s]));
    pools.push(cands);
  }

  const sol = solvePacking(pools, { maxNodes: opts.maxNodes });
  const builds = v1.builds.map((b, i): AllocatedBuild => {
    const x = sol.choice[i];
    if (x < 0) {
      return b.result.status === 'ok'
        ? {
            ...b,
            result: {
              status: 'infeasible',
              explored: b.result.explored,
              pruned: b.result.pruned,
            },
          }
        : b;
    }
    const m = order[i];
    const pieces = pools[i][x].ids.map((id) => byId.get(id)!);
    return { ...b, result: resultFor(m, pieces, b.result) };
  });
  return {
    ...v1,
    builds,
    score: { ...v1.score, exact: Math.max(sol.value / totalWeight, 0) },
    solver: {
      exact: sol.exact,
      nodes: sol.nodes,
      candidates: Object.fromEntries(
        order.map((m, i) => [m.characterKey, pools[i].length]),
      ),
    },
  };
}
