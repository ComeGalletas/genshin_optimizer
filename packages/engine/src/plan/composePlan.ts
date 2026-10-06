/**
 * The plan (ADR-0019): composes the recommended Abyss teams into an optimised
 * build for each of the eight members over one shared inventory, plus a single
 * farming list, and renders it.
 * @packageDocumentation
 */

/**
 * Two recommended teams turned into eight exact optimisations plus one farming
 * list.
 *
 * Artifacts are allocated greedily — each member is optimised over what earlier
 * members left, and the winning build's five pieces leave the pool
 * (`allocateGreedy`, which generalises this to any members since TODO 7.1).
 * // ponytail: greedy allocation in priority order — a joint 8-way assignment
 * // would be exponentially larger for a marginal gain over "the carry gets
 * // first pick", which is what a player would do anyway.
 */
import type { Artifact } from '../game/types';
import type { RosterEntry } from '../import/good';
import type { Role } from '../teams/types';
import type { TeamInstance } from '../teams/recommend';
import { META_TARGETS } from '../meta/metaTargets';
import { defaultConstraints, defaultObjective } from '../optimizer/defaults';
import { computeGapReport } from '../meta/gap';
import { genshinAdapter } from '../game/genshin/adapter';
import {
  allocateGreedy,
  ROLE_WEIGHT,
  type AllocatedBuild,
  type AllocationMember,
  type RunOptimize,
} from './allocate';

export type { RunOptimize };

export type PlanMemberBuild = AllocatedBuild;

export interface Plan {
  teams: [TeamInstance, TeamInstance];
  builds: PlanMemberBuild[]; // 8 entries, team order then priority order
  farming: string[]; // deduped, name-prefixed feasibility + shortfall lines
}

/** Carries do the most damage and want first pick of the gear. */
const ROLE_PRIORITY: Record<Role, number> = {
  'on-field-dps': 0,
  'off-field-dps': 1,
  buffer: 2,
  applicator: 2,
  battery: 2,
  sustain: 2,
};

function orderedMembers(team: TeamInstance): TeamInstance['members'] {
  // Stable within equal priority, so the archetype's own slot order breaks ties.
  return team.members
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) => ROLE_PRIORITY[a.m.role] - ROLE_PRIORITY[b.m.role] || a.i - b.i,
    )
    .map((x) => x.m);
}

const NO_WEAPON =
  'No weapon equipped in your export — equip one to plan a build.';

/** The eight members as allocation members (TODO 7.1): the curated
 *  defaults of each, in the order the plan gives them first pick. */
export function planMembers(
  teams: [TeamInstance, TeamInstance],
  roster: Record<string, RosterEntry>,
): AllocationMember[] {
  // Better team first: its members get first pick of the shared inventory.
  const ordered = [...teams].sort((a, b) => b.score - a.score);
  return ordered.flatMap(orderedMembers).map((m, i) => {
    const key = m.characterKey;
    const entry = roster[key] ?? {};
    return {
      characterKey: key,
      request: {
        characterKey: key,
        weaponKey: entry.weaponKey ?? '',
        buildLevel: entry.buildLevel ?? 90,
        ...(entry.weaponRefinement !== undefined && {
          refinement: entry.weaponRefinement,
        }),
        constraints: defaultConstraints(key),
        objective: defaultObjective(key),
        topK: 1,
      },
      priority: i,
      weight: ROLE_WEIGHT[m.role],
      ...(!entry.weaponKey && { problem: NO_WEAPON }),
    };
  });
}

export async function composePlan(
  teams: [TeamInstance, TeamInstance],
  roster: Record<string, RosterEntry>,
  inventory: Artifact[],
  runOptimize: RunOptimize,
  onProgress?: (done: number, total: number) => void,
): Promise<Plan> {
  const farming: string[] = [];
  const seenFarming = new Set<string>();
  const addFarming = (characterKey: string, line: string) => {
    const prefixed = `${genshinAdapter.characterName(characterKey)}: ${line}`;
    if (seenFarming.has(prefixed)) return;
    seenFarming.add(prefixed);
    farming.push(prefixed);
  };

  const { builds } = await allocateGreedy(
    planMembers(teams, roster),
    inventory,
    runOptimize,
    {
      onProgress,
      afterMember: (m, result, pool) => {
        if (m.problem) return addFarming(m.characterKey, m.problem);
        const meta = META_TARGETS[m.characterKey];
        const best = result.status === 'ok' ? result.builds[0] : null;
        const gap = meta ? computeGapReport(meta, [...pool], best) : null;
        if (gap)
          for (const line of [...gap.feasibility, ...gap.shortfalls])
            addFarming(m.characterKey, line);
      },
    },
  );
  return { teams, builds, farming };
}
