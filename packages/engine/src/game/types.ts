/**
 * Game-agnostic domain types (artifacts, slots, stat keys, build requests),
 * kept separate from `game/genshin/`.
 * @packageDocumentation
 */
import type { DamageContext } from '../damage/types';

export type Slot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';
export const SLOTS: Slot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

// STAT_KEYS is the single source of truth; StatKey is derived from it so the
// runtime guard (isStatKey) and the compile-time union can never drift apart.
export const STAT_KEYS = [
  'hp',
  'hp_pct',
  'atk',
  'atk_pct',
  'def',
  'def_pct',
  'em',
  'er_pct',
  'crit_rate',
  'crit_dmg',
  'elemental_dmg',
  'physical_dmg',
  'healing',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export function isStatKey(x: unknown): x is StatKey {
  return typeof x === 'string' && (STAT_KEYS as readonly string[]).includes(x);
}

// The 7 elements that can appear as a goblet's elemental_dmg main stat
// (physical_dmg is its own separate StatKey, never part of this union).
export const ELEMENTS = [
  'pyro',
  'hydro',
  'electro',
  'cryo',
  'anemo',
  'geo',
  'dendro',
] as const;

export type Element = (typeof ELEMENTS)[number];

// The five weapon classes. A character can only equip weapons of their own
// class, so both sides of that comparison are normalised to this list when the
// snapshot is built (scripts/build-dataset.ts) — same source-of-truth trick as
// ELEMENTS above, so the allowlist and the union can't drift.
export const WEAPON_TYPES = [
  'sword',
  'claymore',
  'polearm',
  'bow',
  'catalyst',
] as const;

export type WeaponType = (typeof WEAPON_TYPES)[number];

export type BuildLevel = 1 | 20 | 40 | 50 | 60 | 70 | 80 | 90;
export const BUILD_LEVELS: BuildLevel[] = [1, 20, 40, 50, 60, 70, 80, 90];

/** A sparse stat vector. Missing keys are treated as 0. */
export type StatVec = Partial<Record<StatKey, number>>;

export interface SubStat {
  key: StatKey;
  value: number;
}

export interface Artifact {
  id: string;
  setKey: string;
  slot: Slot;
  rarity: number; // 4 or 5
  level: number; // 0..20
  mainStat: StatKey;
  mainStatValue: number; // resolved from rarity+level tables at creation/import time
  subStats: SubStat[]; // <=4, none equal to mainStat
  /** Which element an elemental_dmg goblet's main stat is (ADR-0014). Set only
   *  when mainStat === 'elemental_dmg'; unset means "unknown" (treated as on-element). */
  element?: Element;
  /** Dataset character key currently wearing this piece, from a GOOD export's
   *  `location`. Unset for hand-entered or unequipped pieces. */
  location?: string;
}

export type SetRequirement =
  | { kind: '4pc'; setKey: string }
  | { kind: '2+2'; setKeys: [string, string] }
  | { kind: '2pc'; setKey: string };

export interface OptimizeConstraints {
  setRequirement?: SetRequirement;
  minStats?: StatVec;
  mainStatLocks?: Partial<Record<Slot, StatKey>>;
  critRatioTarget?: number; // soft tiebreak only
}

export type Objective = StatKey | 'crit_value' | 'avg_damage';

/** Objectives whose value is a plain sum over stat contributions, so the
 *  scalar-additive pruning bound applies. `avg_damage` is not one of them. */
export type ScalarObjective = Exclude<Objective, 'avg_damage'>;

export function isObjective(x: unknown): x is Objective {
  return x === 'crit_value' || x === 'avg_damage' || isStatKey(x);
}

export interface OptimizeRequest {
  characterKey: string;
  weaponKey: string;
  buildLevel: BuildLevel; // drives character + weapon (ADR-0006)
  constraints: OptimizeConstraints;
  objective: Objective;
  topK?: number; // default 10
}

/** Plain, structured-clone-safe context the worker needs (no adapter, no DOM). */
export interface OptimizeContext {
  /** character base @ buildLevel + weapon main + secondary stat line, with elemental_dmg pre-resolved. */
  base: StatVec;
  /** scored flat-stat set bonuses, elemental bonuses pre-resolved to elemental_dmg. */
  setBonuses: Record<string, { two?: StatVec; four?: StatVec }>;
  /** damage profile + enemy assumptions; required by the `avg_damage` objective. */
  damage?: DamageContext;
  /** dataset set key -> display name, for the worker's set-requirement
   *  diagnostics (`setRequirementLabelFrom`). Populated once here, on the
   *  main thread where the adapter is available, and structured-cloned to
   *  the worker with the rest of this context — the worker itself must not
   *  statically import the adapter (see the note on `data.generated.json`
   *  in `labels-core.ts`), or its own bundle balloons by ~321 KB. Optional
   *  so hand-built contexts (tests, `benchmark.ts`) don't need it; a key
   *  it's missing just falls back to a spaced-out raw key. */
  setNames?: Record<string, string>;
}

export interface BuildDiagnostics {
  /** human-readable binding constraints, e.g. "Energy Recharge >= 160%". */
  bindingConstraints: string[];
  /** per slot: the objective drop if that slot's piece were removed. */
  marginalBySlot: Partial<Record<Slot, number>>;
  explored: number;
  pruned: number;
}

export interface BuildResult {
  artifactIds: Record<Slot, string>;
  totals: StatVec;
  objectiveValue: number;
  score: number; // objectiveValue - critRatioPenalty
  diagnostics: BuildDiagnostics;
}

export type OptimizeResult =
  | { status: 'ok'; builds: BuildResult[]; explored: number; pruned: number }
  | { status: 'infeasible'; explored: number; pruned: number };
