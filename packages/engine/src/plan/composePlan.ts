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
 * members left, and the winning build's five pieces leave the pool.
 * // ponytail: greedy allocation in priority order — a joint 8-way assignment
 * // would be exponentially larger for a marginal gain over "the carry gets
 * // first pick", which is what a player would do anyway.
 */
import type {
  Artifact,
  Objective,
  OptimizeRequest,
  OptimizeResult,
  Slot,
} from '../game/types';
import { SLOTS } from '../game/types';
import type { RosterEntry } from '../import/good';
import type { Role } from '../teams/types';
import type { TeamInstance } from '../teams/recommend';
import { META_TARGETS, metaToConstraints } from '../meta/metaTargets';
import { computeGapReport } from '../meta/gap';
import { getDamageProfile } from '../damage/profiles';
import { genshinAdapter } from '../game/genshin/adapter';

export interface PlanMemberBuild {
  characterKey: string;
  objective: Objective;
  result: OptimizeResult;
  /** Human-readable notes: pieces from this member's meta set that a
   *  higher-priority member already claimed. */
  conflicts: string[];
}

export interface Plan {
  teams: [TeamInstance, TeamInstance];
  builds: PlanMemberBuild[]; // 8 entries, team order then priority order
  farming: string[]; // deduped, name-prefixed feasibility + shortfall lines
}

/** Injected so tests run the solver directly and the app runs it in a worker. */
export type RunOptimize = (
  req: OptimizeRequest,
  inventory: Artifact[],
) => Promise<OptimizeResult>;

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

/** The set keys a character's meta recipe asks for, for conflict reporting. */
function metaSetKeys(characterKey: string): string[] {
  const req = META_TARGETS[characterKey]?.setRequirement;
  if (!req) return [];
  return req.kind === '2+2' ? [...req.setKeys] : [req.setKey];
}

export async function composePlan(
  teams: [TeamInstance, TeamInstance],
  roster: Record<string, RosterEntry>,
  inventory: Artifact[],
  runOptimize: RunOptimize,
  onProgress?: (done: number, total: number) => void,
): Promise<Plan> {
  // Better team first: its members get first pick of the shared inventory.
  const ordered = [...teams].sort((a, b) => b.score - a.score);
  const queue = ordered.flatMap(orderedMembers);
  const total = queue.length;

  let pool = inventory;
  const taken: Artifact[] = [];
  const builds: PlanMemberBuild[] = [];
  const farming: string[] = [];
  const seenFarming = new Set<string>();

  const addFarming = (characterKey: string, line: string) => {
    const prefixed = `${genshinAdapter.characterName(characterKey)}: ${line}`;
    if (seenFarming.has(prefixed)) return;
    seenFarming.add(prefixed);
    farming.push(prefixed);
  };

  for (const m of queue) {
    const key = m.characterKey;
    const entry = roster[key] ?? {};
    const meta = META_TARGETS[key];
    const profile = getDamageProfile(key);
    const objective: Objective = profile
      ? 'avg_damage'
      : (meta?.objective ?? 'crit_value');

    const constraints = meta ? metaToConstraints(meta) : {};
    if (
      profile?.erRequirement != null &&
      constraints.minStats?.er_pct == null
    ) {
      constraints.minStats = {
        ...constraints.minStats,
        er_pct: profile.erRequirement,
      };
    }

    // Pieces this member's meta set wants that someone ahead of them took.
    const wanted = new Set(metaSetKeys(key));
    const conflicts = wanted.size
      ? taken
          .filter((a) => wanted.has(a.setKey))
          .map(
            (a) =>
              `A ${a.setKey} ${a.slot} went to an earlier member of the plan.`,
          )
      : [];

    if (!entry.weaponKey) {
      builds.push({
        characterKey: key,
        objective,
        result: { status: 'infeasible', explored: 0, pruned: 0 },
        conflicts,
      });
      addFarming(
        key,
        'No weapon equipped in your export — equip one to plan a build.',
      );
      onProgress?.(builds.length, total);
      continue;
    }

    const req: OptimizeRequest = {
      characterKey: key,
      weaponKey: entry.weaponKey,
      buildLevel: entry.buildLevel ?? 90,
      constraints,
      objective,
      topK: 1,
    };
    const result = await runOptimize(req, pool);

    const best = result.status === 'ok' ? result.builds[0] : null;
    const gap = meta ? computeGapReport(meta, pool, best) : null;
    if (gap) {
      for (const line of [...gap.feasibility, ...gap.shortfalls])
        addFarming(key, line);
    }

    if (best) {
      const ids = new Set<string>(SLOTS.map((s: Slot) => best.artifactIds[s]));
      for (const a of pool) if (ids.has(a.id)) taken.push(a);
      pool = pool.filter((a) => !ids.has(a.id));
    }

    builds.push({ characterKey: key, objective, result, conflicts });
    onProgress?.(builds.length, total);
  }

  return { teams, builds, farming };
}
