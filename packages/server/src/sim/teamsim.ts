/**
 * `simulate_team` (TODO 6.1): a team in a library rotation as the owner has
 * it, and variants of it, simulated side by side and compared.
 *
 * - **The base**: each slot of the rotation filled with the first of its
 *   characters the owner has, as equipped.
 * - **A variant** changes any of: who fills a slot (`swap`, only to a
 *   character the slot takes: a rotation's actions are written for its
 *   characters), a weapon, a build (explicit pieces, or conditions the
 *   optimizer fills from the account, teammates' pieces left alone), the
 *   rotation, the enemy (level, resistance, number of targets).
 * - A variant that can't be built says why and the others still run; one
 *   gcsim can't simulate is "not simulated" (ADR-0045). The base must work.
 * - All runs go through the bounded pool and its cache, burst waits filled
 *   unless asked otherwise (ADR-0041).
 * @packageDocumentation
 */

import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  simCharacterFromAccount,
  type SimAccount,
} from '@genshin-build-lab/engine/sim/account';
import type { SimCharacter } from '@genshin-build-lab/engine/sim/configgen';
import {
  rotationConfig,
  type Rotation,
} from '@genshin-build-lab/engine/sim/rotation';
import { setsInPlay, unsimulated } from '@genshin-build-lab/engine/sim/support';
import {
  compareToBase,
  TEAM_ITERATIONS,
  type TeamSimSpec,
  type TeamVariant,
  type VsBase,
} from '@genshin-build-lab/engine/sim/team';
import { ownedRefinement } from '@genshin-build-lab/engine/roster/refinement';
import type { SpecIssue } from '@genshin-build-lab/engine/constraints/spec';
import { GcsimError } from './gcsim';
import { rotationLibrary, type RunsPooled } from './rerank';
import type { SimResult } from './result';

type BuildConditions = Exclude<
  NonNullable<TeamVariant['builds']>[string],
  { artifacts: string[] }
>;

export interface TeamSimDeps {
  account: SimAccount;
  dir: string;
  pool: RunsPooled;
  /** The pinned gcsim version, for "not simulated" reasons. */
  gcsim: string;
  /** The best build for a character under conditions, with these
   *  teammates' pieces left alone. */
  bestBuild(
    character: string,
    weapon: string,
    conditions: BuildConditions,
    keepOn: string[],
  ): Promise<Artifact[] | { problem: string }>;
}

export class TeamSimError extends Error {
  constructor(readonly issues: SpecIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('; '));
  }
}

const name = (k: string) => genshinAdapter.character(k)?.name ?? k;
const weaponName = (k: string) => genshinAdapter.weapon(k)?.name ?? k;
const NAMES = {
  character: name,
  weapon: weaponName,
  set: (k: string) => genshinAdapter.sets().find((s) => s.key === k)?.name ?? k,
};

interface Setup {
  rotation: Rotation;
  /** Slot id → the character in it, in the rotation's slot order. */
  team: [string, SimCharacter][];
  enemy: { level?: number; res?: number; count?: number };
  notSimulated: string[];
}

/** One run in the comparison. */
export interface TeamRun {
  label: string;
  rotation?: { id: string; name: string; status: string };
  team?: {
    slot: string;
    character: string;
    weapon: string;
    refinement: number;
    sets: string[];
  }[];
  enemy?: Setup['enemy'];
  /** Why this variant couldn't be built; nothing else is set then. */
  problems?: string[];
  /** Why gcsim couldn't simulate it (ADR-0045). */
  notSimulated?: string[];
  dps?: { mean: number; sd: number; ci95: [number, number] };
  fightSec?: number;
  characters?: {
    character: string;
    dps: number;
    share: number;
    fieldSec: number;
    energyWaitSec: number;
  }[];
  reactions?: Record<string, number>;
  warnings?: string[];
  cached?: boolean;
  /** Against the base (variants only). */
  vsBase?: VsBase;
}

/** Build one team (base or variant), or say what stops it. */
async function prepare(
  spec: TeamSimSpec,
  variant: TeamVariant | undefined,
  library: Rotation[],
  deps: TeamSimDeps,
): Promise<Setup | { problems: string[] }> {
  const problems: string[] = [];
  const rotationId = variant?.rotation ?? spec.rotation;
  const rotation = library.find((r) => r.meta.id === rotationId);
  if (!rotation)
    return {
      problems: [
        `no rotation "${rotationId}" in the library (${library.map((r) => r.meta.id).join(', ')})`,
      ],
    };
  const owned = (k: string) => k in deps.account.roster;
  const chosen = new Map(
    rotation.meta.slots.map((s) => [
      s.id,
      s.characters.find(owned) ?? s.characters[0],
    ]),
  );
  for (const [from, to] of Object.entries(variant?.swap ?? {})) {
    const slot = rotation.meta.slots.find((s) => chosen.get(s.id) === from);
    if (!slot) {
      problems.push(
        `${name(from)} isn't in this team (${[...chosen.values()].map(name).join(', ')})`,
      );
      continue;
    }
    if (!slot.characters.includes(to)) {
      const others = library
        .filter((r) => r.meta.slots.some((s) => s.characters.includes(to)))
        .map((r) => r.meta.id);
      problems.push(
        `${rotation.meta.name}'s "${slot.id}" slot takes only ${slot.characters.map(name).join(' or ')}, its actions are written for them: for ${name(to)}, ${
          others.length
            ? `choose a rotation that has them (${others.join(', ')})`
            : 'draft a rotation with them (draft_rotation)'
        }`,
      );
      continue;
    }
    chosen.set(slot.id, to);
  }
  const team: [string, SimCharacter][] = [];
  for (const [slot, key] of chosen) {
    const c = simCharacterFromAccount(deps.account, key);
    if ('problem' in c) problems.push(c.problem);
    else team.push([slot, c]);
  }
  if (problems.length) return { problems };
  const member = (k: string) => team.find(([, c]) => c.key === k)?.[1];

  for (const [k, change] of Object.entries(variant?.weapons ?? {})) {
    const c = member(k);
    const w = genshinAdapter.weapon(change.weapon);
    if (!c) problems.push(`${name(k)} isn't in this team`);
    else if (!w) problems.push(`no weapon "${change.weapon}" in the dataset`);
    else if (w.type !== genshinAdapter.character(k)?.weaponType)
      problems.push(`${name(k)} can't wield ${w.name}`);
    else {
      const held = c.weapon.key === change.weapon;
      c.weapon = {
        key: change.weapon,
        level: held ? c.weapon.level : 90,
        maxLevel: held ? c.weapon.maxLevel : 90,
        refinement:
          change.refinement ??
          ownedRefinement(k, change.weapon, deps.account) ??
          1,
      };
    }
  }
  for (const [k, change] of Object.entries(variant?.builds ?? {})) {
    const c = member(k);
    if (!c) {
      problems.push(`${name(k)} isn't in this team`);
      continue;
    }
    if ('artifacts' in change) {
      const byId = new Map(deps.account.artifacts.map((a) => [a.id, a]));
      const missing = change.artifacts.filter((id) => !byId.has(id));
      if (missing.length)
        problems.push(`no artifact ${missing.join(', ')} in the account`);
      else c.artifacts = change.artifacts.map((id) => byId.get(id)!);
      continue;
    }
    const keepOn = team.map(([, m]) => m.key).filter((m) => m !== k);
    const best = await deps.bestBuild(k, c.weapon.key, change, keepOn);
    if ('problem' in best) problems.push(`${name(k)}'s build: ${best.problem}`);
    else c.artifacts = best;
  }
  if (problems.length) return { problems };

  const enemy = { ...spec.enemy, ...variant?.enemy };
  const members = team.map(([, c]) => c);
  return {
    rotation,
    team,
    enemy,
    notSimulated: unsimulated(
      {
        characters: members.map((c) => c.key),
        weapons: members.map((c) => c.weapon.key),
        sets: members.flatMap((c) => setsInPlay(c.artifacts)),
      },
      NAMES,
    ),
  };
}

const ci95 = (r: SimResult): [number, number] => {
  const half = (1.96 * r.dps.sd) / Math.sqrt(Math.max(1, r.iterations));
  return [r.dps.mean - half, r.dps.mean + half];
};

/** The base and every variant, simulated and compared. Throws
 *  `TeamSimError` when the base itself can't be built. */
export async function simulateTeam(
  spec: TeamSimSpec,
  deps: TeamSimDeps,
): Promise<{ iterations: number; burstWaits: string; runs: TeamRun[] }> {
  const iterations = spec.iterations ?? TEAM_ITERATIONS;
  const energyWait = spec.energyWait ?? 'attack';
  const library = rotationLibrary(deps.dir);
  const labels: string[] = [
    'base',
    ...(spec.variants ?? []).map((v) => v.label),
  ];
  const setups = await Promise.all([
    prepare(spec, undefined, library, deps),
    ...(spec.variants ?? []).map((v) => prepare(spec, v, library, deps)),
  ]);
  const base = setups[0];
  if ('problems' in base)
    throw new TeamSimError(
      base.problems.map((message) => ({ path: 'rotation', message })),
    );

  const runs = await Promise.all(
    setups.map(async (s, i): Promise<TeamRun & { result?: SimResult }> => {
      const label = labels[i];
      if ('problems' in s) return { label, problems: s.problems };
      const head: TeamRun = {
        label,
        rotation: {
          id: s.rotation.meta.id,
          name: s.rotation.meta.name,
          status: s.rotation.meta.status,
        },
        team: s.team.map(([slot, c]) => ({
          slot,
          character: c.key,
          weapon: c.weapon.key,
          refinement: c.weapon.refinement,
          sets: setsInPlay(c.artifacts),
        })),
        enemy: s.enemy,
      };
      if (s.notSimulated.length)
        return { ...head, notSimulated: s.notSimulated };
      try {
        const run = await deps.pool.run(
          rotationConfig(s.rotation, Object.fromEntries(s.team), {
            iterations,
            energyWait,
            enemy: s.enemy,
          }),
          { iterations },
        );
        const r = run.result;
        if (r.incomplete.length)
          return {
            ...head,
            notSimulated: [
              `gcsim ${deps.gcsim} implements ${r.incomplete.join(', ')} only partly`,
            ],
          };
        return {
          ...head,
          result: r,
          dps: { mean: r.dps.mean, sd: r.dps.sd, ci95: ci95(r) },
          fightSec: r.durationSec,
          // gcsim lists characters in the config's order: the slots'.
          characters: r.characters.map((c, j) => ({
            character: s.team[j]?.[1].key ?? c.name,
            dps: c.dps.mean,
            share: c.share,
            fieldSec: c.fieldTimeSec,
            energyWaitSec: c.energyWaitSec,
          })),
          reactions: r.reactions,
          warnings: r.warnings,
          cached: run.cached,
        };
      } catch (e) {
        if (!(e instanceof GcsimError)) throw e;
        return { ...head, notSimulated: [`gcsim refused it: ${e.message}`] };
      }
    }),
  );

  const baseResult = runs[0].result;
  return {
    iterations,
    burstWaits: energyWait === 'attack' ? 'filled with attacks' : 'idle',
    runs: runs.map(({ result, ...run }, i) => ({
      ...run,
      ...(i > 0 &&
        result &&
        baseResult && {
          vsBase: compareToBase(
            { ...baseResult.dps, iterations: baseResult.iterations },
            { ...result.dps, iterations: result.iterations },
          ),
        }),
    })),
  };
}
