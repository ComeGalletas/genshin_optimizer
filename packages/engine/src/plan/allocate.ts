/**
 * Account-wide allocation (TODO 7.1, amending ADR-0019): artifacts shared
 * out between N characters, no piece used twice, each character optimised
 * under their own request (their ConstraintSpec: set, main stats, floors,
 * objective, pieces to leave alone) in priority order.
 *
 * This is the greedy pass `composePlan` has used for the eight Abyss
 * members, generalised: any characters, any specs, an explicit priority.
 * Each member is optimised over what earlier members left (and only over
 * the pieces their own spec allows), and their winning build's pieces leave
 * the pool. `weight` is each member's share of the plan's objective, for the
 * improvement passes and the exact solver that follow (7.2, 7.3). Pure; the
 * optimizer is injected, so tests run it directly and the app in a worker.
 * @packageDocumentation
 */

import type {
  Artifact,
  Objective,
  OptimizeRequest,
  OptimizeResult,
} from '../game/types';
import { SLOTS } from '../game/types';
import type { ContextExtras } from '../optimizer/context';
import type { ConstraintSpec, SpecIssue } from '../constraints/spec';
import { specToRun, type SpecAccount } from '../constraints/toRequest';
import { COMP_ARCHETYPES } from '../teams/comps';
import type { Role } from '../teams/types';

/** A member's default weight by role (the owner's choice, 2026-10-05,
 *  ADR-0048): the carry's build counts most when members want the same
 *  pieces. */
export const ROLE_WEIGHT: Record<Role, number> = {
  'on-field-dps': 2,
  'off-field-dps': 1.5,
  buffer: 1,
  applicator: 1,
  battery: 1,
  sustain: 1,
};

/** The role a character fills most in the curated archetypes (summing the
 *  options' weights), or undefined for one in none. */
export function defaultRole(characterKey: string): Role | undefined {
  const by = new Map<Role, number>();
  for (const a of COMP_ARCHETYPES)
    for (const s of a.slots)
      for (const o of s.options)
        if (o.characterKey === characterKey)
          by.set(s.role, (by.get(s.role) ?? 0) + o.weight);
  let best: Role | undefined;
  for (const [role, w] of by)
    if (best === undefined || w > by.get(best)!) best = role;
  return best;
}

/** A member's weight unless one is given: their role's, else 1. */
export function defaultWeight(characterKey: string, role?: Role): number {
  const r = role ?? defaultRole(characterKey);
  return r ? ROLE_WEIGHT[r] : 1;
}

export interface AllocationMember {
  characterKey: string;
  /** What to optimise for them (weapon, level, constraints, objective). */
  request: OptimizeRequest;
  extras?: ContextExtras;
  /** The pieces their spec lets them use at all (`keepEquippedOn`,
   *  `excludeArtifacts`); every piece when left out. */
  allowed?: ReadonlySet<string>;
  /** Lower picks first; equal priorities keep the members' order. */
  priority: number;
  /** Their share of the plan's objective (7.2, 7.3): by default their
   *  role's (`ROLE_WEIGHT`). */
  weight: number;
  /** Why they can't be planned (no weapon): an infeasible result, and the
   *  line says why. */
  problem?: string;
}

export interface AllocatedBuild {
  characterKey: string;
  objective: Objective;
  result: OptimizeResult;
  /** Pieces of the set this member's request asks for that a member ahead
   *  of them took. */
  conflicts: string[];
  problem?: string;
}

/** Injected so tests run the solver directly and the app runs it in a
 *  worker. */
export type RunOptimize = (
  req: OptimizeRequest,
  inventory: Artifact[],
  extras?: ContextExtras,
) => Promise<OptimizeResult>;

/** Called after each member with the pool they were optimised over (what
 *  `composePlan` reads its gap analysis from). */
export type AfterMember = (
  member: AllocationMember,
  result: OptimizeResult,
  pool: readonly Artifact[],
) => void;

/** Members in picking order: priority, then their own order. */
export function pickingOrder(
  members: readonly AllocationMember[],
): AllocationMember[] {
  return members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.priority - b.m.priority || a.i - b.i)
    .map((x) => x.m);
}

/** The set keys a request asks for, for conflict notes. */
function wantedSets(req: OptimizeRequest): Set<string> {
  const s = req.constraints.setRequirement;
  if (!s) return new Set();
  return new Set(s.kind === '2+2' ? s.setKeys : [s.setKey]);
}

/** The greedy pass: each member in picking order gets the best build from
 *  what is left. Builds come back in picking order. */
export async function allocateGreedy(
  members: readonly AllocationMember[],
  inventory: readonly Artifact[],
  runOptimize: RunOptimize,
  opts: {
    onProgress?: (done: number, total: number) => void;
    afterMember?: AfterMember;
  } = {},
): Promise<{ builds: AllocatedBuild[]; taken: Artifact[] }> {
  const order = pickingOrder(members);
  let pool = [...inventory];
  const taken: Artifact[] = [];
  const builds: AllocatedBuild[] = [];
  for (const m of order) {
    const wanted = wantedSets(m.request);
    const conflicts = wanted.size
      ? taken
          .filter((a) => wanted.has(a.setKey))
          .map(
            (a) =>
              `A ${a.setKey} ${a.slot} went to an earlier member of the plan.`,
          )
      : [];
    const usable = m.allowed ? pool.filter((a) => m.allowed!.has(a.id)) : pool;
    const result: OptimizeResult = m.problem
      ? { status: 'infeasible', explored: 0, pruned: 0 }
      : await runOptimize({ ...m.request, topK: 1 }, usable, m.extras);
    opts.afterMember?.(m, result, usable);
    const best = result.status === 'ok' ? result.builds[0] : null;
    if (best) {
      const ids = new Set(SLOTS.map((s) => best.artifactIds[s]));
      for (const a of pool) if (ids.has(a.id)) taken.push(a);
      pool = pool.filter((a) => !ids.has(a.id));
    }
    builds.push({
      characterKey: m.characterKey,
      objective: m.request.objective,
      result,
      conflicts,
      ...(m.problem && { problem: m.problem }),
    });
    opts.onProgress?.(builds.length, order.length);
  }
  return { builds, taken };
}

/** A member from a checked ConstraintSpec: its request, extras and the
 *  pieces it may use, from the same mapping a single search uses. */
export function memberFromSpec(
  spec: ConstraintSpec,
  account: SpecAccount,
  opts: { priority: number; weight?: number },
): { ok: true; member: AllocationMember } | { ok: false; issues: SpecIssue[] } {
  const mapped = specToRun(spec, account, { topK: 1 });
  if (!mapped.ok) return mapped;
  const { request, extras, pool } = mapped.run;
  return {
    ok: true,
    member: {
      characterKey: spec.character,
      request,
      ...(Object.keys(extras).length && { extras }),
      allowed: new Set(pool.map((a) => a.id)),
      priority: opts.priority,
      weight: opts.weight ?? defaultWeight(spec.character),
    },
  };
}
