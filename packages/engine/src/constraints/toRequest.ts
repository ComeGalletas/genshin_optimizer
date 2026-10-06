/**
 * A checked `ConstraintSpec` as an optimizer run (TODO 4.2, ADR-0036): the
 * `OptimizeRequest`, the context extras a request can't carry (team buffs,
 * stat weights, the enemy), and the pool of artifacts the search may use.
 *
 * The spec extends the character's curated defaults field by field unless
 * it says `defaults: "replace"`: a set rule replaces the default one (`any`
 * clears it), each main stat replaces that slot's lock (`any` clears it),
 * `minStats` merge key by key with the spec winning, and the crit-ratio
 * tiebreak stays with the defaults. What the spec can't know, the account
 * answers: the equipped weapon and build level, who wears what, and which
 * artifact ids exist. Pure: the account comes in as data.
 * @packageDocumentation
 */

import type {
  Artifact,
  Objective,
  OptimizeConstraints,
  OptimizeRequest,
  BuildLevel,
  StatKey,
  StatVec,
} from '../game/types';
import type { OwnedWeapon, RosterEntry } from '../good/normalize';
import { ownedRefinement } from '../roster/refinement';
import { genshinAdapter } from '../game/genshin/adapter';
import { defaultConstraints, defaultObjective } from '../optimizer/defaults';
import type { ContextExtras } from '../optimizer/context';
import type { ConstraintSpec, SpecIssue, VariableSlot } from './spec';

/** What the mapping needs from the account. */
export interface SpecAccount {
  /** Owned characters, by dataset key (equipped weapon, build level). */
  roster: Readonly<Record<string, RosterEntry>>;
  /** Every artifact; `location` says who wears it. */
  artifacts: readonly Artifact[];
  /** The weapon inventory, for the refinement of a weapon the character
   *  doesn't hold (ADR-0042). Optional: without it, the held weapon's. */
  weapons?: readonly OwnedWeapon[];
}

export interface SpecRun {
  request: OptimizeRequest;
  /** Passed to `buildContext` with the request. */
  extras: ContextExtras;
  /** The artifacts the search may use, exclusions applied. */
  pool: Artifact[];
}

export type SpecRunResult =
  { ok: true; run: SpecRun } | { ok: false; issues: SpecIssue[] };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Turn a spec into a run against an account. Issues here are the ones only
 *  the account can reveal: no weapon to use, an artifact id that isn't
 *  there, a default floor above the spec's ceiling. */
export function specToRun(
  spec: ConstraintSpec,
  account: SpecAccount,
  options: { topK?: number } = {},
): SpecRunResult {
  const issues: SpecIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const character = genshinAdapter.character(spec.character)!;
  const entry = account.roster[spec.character];
  const extend = spec.defaults !== 'replace';

  // ---- weapon and level --------------------------------------------------
  const weaponKey = spec.weapon ?? entry?.weaponKey;
  if (!weaponKey)
    add(
      'weapon',
      entry
        ? `${character.name} has no weapon equipped in the account; name one`
        : `${character.name} isn't in the account; name a weapon to build them with`,
    );
  const buildLevel = (spec.buildLevel ?? entry?.buildLevel ?? 90) as BuildLevel;
  // The passive's refinement is the owner's copy's (ADR-0042); a weapon
  // they don't own counts at R1.
  const refinement = weaponKey
    ? ownedRefinement(spec.character, weaponKey, account)
    : undefined;

  // ---- constraints: the defaults, then the spec on top ------------------
  const constraints: OptimizeConstraints = extend
    ? clone(defaultConstraints(spec.character))
    : {};
  if (spec.set) {
    if (spec.set.kind === 'any') delete constraints.setRequirement;
    else constraints.setRequirement = clone(spec.set);
  }
  for (const [slot, main] of Object.entries(spec.mainStats ?? {}) as [
    VariableSlot,
    StatKey | 'any' | undefined,
  ][]) {
    if (main === undefined) continue;
    const locks = (constraints.mainStatLocks ??= {});
    if (main === 'any') delete locks[slot];
    else locks[slot] = main;
  }
  if (
    constraints.mainStatLocks &&
    Object.keys(constraints.mainStatLocks).length === 0
  )
    delete constraints.mainStatLocks;
  if (spec.minStats)
    constraints.minStats = { ...constraints.minStats, ...spec.minStats };
  if (spec.maxStats) constraints.maxStats = { ...spec.maxStats };

  // A default floor the spec's ceiling can't leave room for: say which.
  for (const [stat, cap] of Object.entries(constraints.maxStats ?? {})) {
    const floor = constraints.minStats?.[stat as StatKey];
    if (cap !== undefined && floor !== undefined && floor > cap)
      add(
        `maxStats.${stat}`,
        spec.minStats?.[stat as StatKey] !== undefined
          ? `the minimum ${floor} is above the maximum ${cap}`
          : `${character.name}'s default minimum ${stat} is ${floor}, above your maximum ${cap}; lower the minimum too, or use defaults "replace"`,
      );
  }

  // ---- objective and extras ----------------------------------------------
  const extras: ContextExtras = {};
  let objective: Objective;
  // With "sim", the search picks the candidates by `sim.by` (TODO 5.8).
  const statObjective =
    spec.objective === 'sim' ? spec.sim?.by : spec.objective;
  if (typeof statObjective === 'object') {
    objective = 'weighted';
    extras.weights = Object.fromEntries(
      Object.entries(statObjective.weights).filter(([, w]) => (w ?? 0) > 0),
    ) as StatVec;
  } else
    objective =
      statObjective ??
      (extend ? defaultObjective(spec.character) : 'crit_value');
  if (spec.teamBuffs && Object.keys(spec.teamBuffs).length)
    extras.buffs = { ...spec.teamBuffs };
  if (spec.enemy) extras.enemy = { ...spec.enemy };

  // ---- the pool ----------------------------------------------------------
  const ids = new Set(account.artifacts.map((a) => a.id));
  (spec.excludeArtifacts ?? []).forEach((id, i) => {
    if (!ids.has(id))
      add(
        `excludeArtifacts.${i}`,
        genshinAdapter.character(id)
          ? `"${id}" is a character, not an artifact id; to leave a character's pieces alone, use keepEquippedOn`
          : `no artifact "${id}" in the account`,
      );
  });
  const excluded = new Set(spec.excludeArtifacts ?? []);
  const keep = spec.keepEquippedOn;
  const keptOn = new Set(Array.isArray(keep) ? keep : []);
  const pool = account.artifacts.filter((a) => {
    if (excluded.has(a.id)) return false;
    // The character's own pieces always count.
    if (!a.location || a.location === spec.character) return true;
    if (keep === 'all') return false;
    return !keptOn.has(a.location);
  });

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    run: {
      request: {
        characterKey: spec.character,
        weaponKey: weaponKey!,
        buildLevel,
        ...(refinement !== undefined && { refinement }),
        constraints,
        objective,
        ...(options.topK !== undefined && { topK: options.topK }),
      },
      extras,
      pool,
    },
  };
}
