/**
 * The `ConstraintSpec` (TODO 4.1, ADR-0036): what the owner asked for, as
 * data an LLM can write and the optimizer can trust. A language model turns
 * "Furina with at least 180% ER, keep Neuvillette's gear" into one of
 * these; `parseConstraintSpec` checks its shape (zod/mini, ADR-0022) and
 * then its meaning against the dataset, and only a spec that passes both
 * goes on to the optimizer (4.2, 4.5).
 *
 * Conventions:
 * - Stats are in percent where the game shows percent (ER 180, not 1.8;
 *   ADR-0023), including enemy resistance (10 = 10%).
 * - `defaults: "extend"` (the default) starts from the character's curated
 *   targets and applies the spec on top; `"replace"` starts from nothing.
 *   "Best Furina with ≥ 180% ER" means her usual set and main stats plus the
 *   floor, which is what the owner means and what keeps the search small.
 * - Strict: an unknown field is an error, never ignored, so a model that
 *   invents `"pool"` hears about it instead of being silently misread.
 * - Versioned: `version` is 1; a missing version means the current one.
 *   A later version adds a migration here, never reinterprets version 1.
 * @packageDocumentation
 */

import * as z from 'zod/mini';
import {
  BUILD_LEVELS,
  STAT_KEYS,
  type Slot,
  type StatKey,
} from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { MAX_KEY_LEN } from '../game/artifactValidation';
import { getDamageProfile } from '../damage/profiles';

export const SPEC_VERSION = 1;

/** The slots whose main stat varies, and what each can roll (the in-game
 *  pool). Flower (HP) and plume (ATK) are fixed. */
export const MAIN_STATS_BY_SLOT = {
  sands: ['hp_pct', 'atk_pct', 'def_pct', 'em', 'er_pct'],
  goblet: [
    'hp_pct',
    'atk_pct',
    'def_pct',
    'em',
    'elemental_dmg',
    'physical_dmg',
  ],
  circlet: [
    'hp_pct',
    'atk_pct',
    'def_pct',
    'em',
    'crit_rate',
    'crit_dmg',
    'healing',
  ],
} as const satisfies Partial<Record<Slot, readonly StatKey[]>>;
export type VariableSlot = keyof typeof MAIN_STATS_BY_SLOT;

const Key = z.string().check(z.minLength(1), z.maxLength(MAX_KEY_LEN));
const Stat = z.enum(STAT_KEYS);
/** A stat amount: flat HP runs to tens of thousands. */
const Amount = z.number().check(z.minimum(0), z.maximum(1_000_000));
const StatAmounts = z.partialRecord(Stat, Amount);

export const SetRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('4pc'), setKey: Key }),
  z.strictObject({ kind: z.literal('2pc'), setKey: Key }),
  z.strictObject({ kind: z.literal('2+2'), setKeys: z.tuple([Key, Key]) }),
  /** No set requirement, even when the defaults have one. */
  z.strictObject({ kind: z.literal('any') }),
]);
export type SetRule = z.infer<typeof SetRule>;

export const SpecObjective = z.union([
  z.enum(['crit_value', 'avg_damage', ...STAT_KEYS]),
  /** Maximise a weighted sum of stats, e.g.
   *  `{ "weights": { "hp_pct": 1, "crit_rate": 2, "crit_dmg": 1 } }`. */
  z.strictObject({
    weights: z.partialRecord(
      Stat,
      z.number().check(z.minimum(0), z.maximum(100)),
    ),
  }),
]);
export type SpecObjective = z.infer<typeof SpecObjective>;

/** `"any"` clears a default main-stat lock for that slot. */
const MainStat = z.union([Stat, z.literal('any')]);

export const ConstraintSpecSchema = z.strictObject({
  version: z.optional(z.literal(SPEC_VERSION)),
  /** Dataset key of the character to build, e.g. `furina`. */
  character: Key,
  /** Dataset weapon key; the equipped one when left out. */
  weapon: z.optional(Key),
  buildLevel: z.optional(
    z.number().check(
      z.refine((n) => (BUILD_LEVELS as number[]).includes(n), {
        message: `one of ${BUILD_LEVELS.join(', ')}`,
      }),
    ),
  ),
  defaults: z.optional(z.enum(['extend', 'replace'])),
  set: z.optional(SetRule),
  mainStats: z.optional(
    z.strictObject({
      sands: z.optional(MainStat),
      goblet: z.optional(MainStat),
      circlet: z.optional(MainStat),
    }),
  ),
  minStats: z.optional(StatAmounts),
  maxStats: z.optional(StatAmounts),
  objective: z.optional(SpecObjective),
  /** Characters whose equipped pieces are off-limits, or `"all"` for
   *  unequipped pieces only (the character's own always count). */
  keepEquippedOn: z.optional(
    z.union([z.literal('all'), z.array(Key).check(z.maxLength(200))]),
  ),
  /** Artifact ids never to use (as the tools return them, e.g. `m1-17`). */
  excludeArtifacts: z.optional(z.array(Key).check(z.maxLength(2000))),
  /** Stats teammates add (e.g. Bennett's ATK), on top of the sheet. */
  teamBuffs: z.optional(StatAmounts),
  /** The enemy damage is computed against; resistance in percent. */
  enemy: z.optional(
    z.strictObject({
      level: z.optional(
        z.number().check(z.int(), z.minimum(1), z.maximum(200)),
      ),
      res: z.optional(z.number().check(z.minimum(-200), z.maximum(100))),
    }),
  ),
});

/** A spec as accepted: shape and meaning checked, version filled in. */
export type ConstraintSpec = z.infer<typeof ConstraintSpecSchema> & {
  version: typeof SPEC_VERSION;
};

export interface SpecIssue {
  /** Where, as a dotted path (`mainStats.sands`), or `spec`. */
  path: string;
  message: string;
}

export type SpecResult =
  { ok: true; spec: ConstraintSpec } | { ok: false; issues: SpecIssue[] };

// ---------------------------------------------------------------------------
// Meaning: keys that exist, combinations the game allows
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Edit distance, for "did you mean" on a mistyped key. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = up;
    }
  }
  return row[b.length];
}

/** The closest known key, when one is close enough to be a typo. */
function suggest(key: string, known: readonly string[]): string | undefined {
  const k = norm(key);
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of known) {
    const d = distance(k, norm(c));
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best !== undefined && bestD <= Math.max(2, Math.floor(k.length / 4))
    ? best
    : undefined;
}

type Kind = 'character' | 'weapon' | 'artifact set';
function unknown(kind: Kind, key: string, known: readonly string[]): string {
  const s = suggest(key, known);
  return `unknown ${kind} "${key}"${s ? `; did you mean "${s}"?` : ''}`;
}

let keys:
  { characters: string[]; weapons: string[]; sets: string[] } | undefined;
const known = () =>
  (keys ??= {
    characters: genshinAdapter.characters().map((c) => c.key),
    weapons: genshinAdapter.weapons().map((w) => w.key),
    sets: genshinAdapter.sets().map((s) => s.key),
  });

function checkMeaning(s: z.infer<typeof ConstraintSpecSchema>): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const k = known();

  const character = genshinAdapter.character(s.character);
  if (!character)
    add('character', unknown('character', s.character, k.characters));

  if (s.weapon !== undefined) {
    const weapon = genshinAdapter.weapon(s.weapon);
    if (!weapon) add('weapon', unknown('weapon', s.weapon, k.weapons));
    else if (character && weapon.type !== character.weaponType)
      add(
        'weapon',
        `${character.name} uses a ${character.weaponType}; ${weapon.name} is a ${weapon.type}`,
      );
  }

  const set = s.set;
  const setKeys =
    set?.kind === '2+2'
      ? set.setKeys
      : set && set.kind !== 'any'
        ? [set.setKey]
        : [];
  setKeys.forEach((key, i) => {
    if (!k.sets.includes(key))
      add(
        set?.kind === '2+2' ? `set.setKeys.${i}` : 'set.setKey',
        unknown('artifact set', key, k.sets),
      );
  });
  if (set?.kind === '2+2' && set.setKeys[0] === set.setKeys[1])
    add('set.setKeys', 'a 2+2 needs two different sets');

  for (const slot of Object.keys(MAIN_STATS_BY_SLOT) as VariableSlot[]) {
    const main = s.mainStats?.[slot];
    if (
      main !== undefined &&
      main !== 'any' &&
      !(MAIN_STATS_BY_SLOT[slot] as readonly string[]).includes(main)
    )
      add(
        `mainStats.${slot}`,
        `a ${slot} can't have ${main} as its main stat; it can have ${MAIN_STATS_BY_SLOT[slot].join(', ')}`,
      );
  }

  for (const [stat, min] of Object.entries(s.minStats ?? {})) {
    const max = s.maxStats?.[stat as StatKey];
    if (min !== undefined && max !== undefined && min > max)
      add(`minStats.${stat}`, `the minimum ${min} is above the maximum ${max}`);
  }

  const objective = s.objective;
  if (
    objective === 'avg_damage' &&
    character &&
    !getDamageProfile(character.key)
  )
    add(
      'objective',
      `there is no damage profile for ${character.name}; use crit_value or a stat`,
    );
  if (
    typeof objective === 'object' &&
    !Object.values(objective.weights).some((w) => (w ?? 0) > 0)
  )
    add('objective.weights', 'give at least one stat a weight above 0');

  if (Array.isArray(s.keepEquippedOn))
    s.keepEquippedOn.forEach((key, i) => {
      if (!genshinAdapter.character(key))
        add(`keepEquippedOn.${i}`, unknown('character', key, k.characters));
    });

  return issues;
}

// ---------------------------------------------------------------------------
// Shape problems in words a model can act on
// ---------------------------------------------------------------------------

/** One zod issue, typed from the schema so no other zod entry point is
 *  needed. zod/mini carries no English messages (ADR-0022 keeps the
 *  locale out of the bundle), so these are written here, for the spec. */
type ZodIssue = NonNullable<
  ReturnType<typeof ConstraintSpecSchema.safeParse>['error']
>['issues'][number];

const STAT_LIST = STAT_KEYS.join(', ');
const STAT_MAPS = new Set(['minStats', 'maxStats', 'teamBuffs', 'weights']);
const FIELDS: Record<string, string> = {
  '': Object.keys(ConstraintSpecSchema.shape).join(', '),
  enemy: 'level, res',
};
const list = (xs: readonly unknown[]) =>
  xs.map((x) => (typeof x === 'string' ? `"${x}"` : String(x))).join(', ');

function describeIssue(issue: ZodIssue): SpecIssue[] {
  const path = issue.path.map(String);
  const at = (p: string[]) => p.join('.') || 'spec';
  const last = path[path.length - 1] ?? '';
  switch (issue.code) {
    case 'unrecognized_keys':
      return issue.keys.map((key) => ({
        path: at([...path, key]),
        message: STAT_MAPS.has(last)
          ? `unknown stat "${key}"; the stats are ${STAT_LIST}`
          : last === 'mainStats'
            ? `"${key}" has no choice of main stat; only sands, goblet and circlet do`
            : `unknown field "${key}"${FIELDS[path.join('.')] ? `; the fields are ${FIELDS[path.join('.')]}` : ''}`,
      }));
    case 'invalid_type':
      return [{ path: at(path), message: `expected ${issue.expected}` }];
    case 'too_small':
      return [
        {
          path: at(path),
          message:
            issue.origin === 'array' || issue.origin === 'string'
              ? `too short (at least ${issue.minimum})`
              : `must be at least ${issue.minimum}`,
        },
      ];
    case 'too_big':
      return [
        {
          path: at(path),
          message:
            issue.origin === 'array' || issue.origin === 'string'
              ? `too long (at most ${issue.maximum})`
              : `must be at most ${issue.maximum}`,
        },
      ];
    case 'invalid_value':
      return [{ path: at(path), message: `must be ${list(issue.values)}` }];
    case 'invalid_union': {
      const message =
        path[0] === 'objective'
          ? `must be "crit_value", "avg_damage", a stat key (${STAT_LIST}) or { "weights": { stat: weight } }`
          : path[0] === 'keepEquippedOn'
            ? 'must be "all" or a list of character keys'
            : path[0] === 'mainStats'
              ? `must be a stat key or "any"`
              : 'options' in issue && Array.isArray(issue.options)
                ? `must be one of ${list(issue.options)}`
                : 'not one of the accepted forms';
      return [{ path: at(path), message }];
    }
    default:
      return [{ path: at(path), message: issue.message }];
  }
}

/** Check a spec from an untrusted source (an LLM, a request body): shape
 *  first, then meaning. Nothing is repaired or guessed (ADR-0022 §2). */
export function parseConstraintSpec(input: unknown): SpecResult {
  const shape = ConstraintSpecSchema.safeParse(input);
  if (!shape.success)
    return { ok: false, issues: shape.error.issues.flatMap(describeIssue) };
  const issues = checkMeaning(shape.data);
  if (issues.length) return { ok: false, issues };
  return { ok: true, spec: { ...shape.data, version: SPEC_VERSION } };
}
