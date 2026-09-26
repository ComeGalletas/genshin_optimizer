/**
 * GOOD normalization: turn a parsed GOOD file into this app's model.
 *
 * - **Keys:** GOOD's PascalCase character and weapon keys ("RaidenShogun",
 *   "AmosBow") map to dataset keys ("raiden_shogun", "amos'_bow"); GOOD stat
 *   keys ("critRate_") map to ours ("crit_rate"). Set keys pass through: the
 *   dataset uses GOOD's own.
 * - **Units:** none to convert. GOOD and the engine both store percentage
 *   stats in percent (ADR-0023), so values pass through unchanged.
 * - **Locations:** `location` resolves to the dataset key of the character
 *   wearing the item; '' means nobody.
 *
 * Nothing is repaired or guessed (ADR-0022). An entry this app can't use is
 * skipped, and every skip, truncation or unresolved key is listed in
 * `issues`, so an import can say what it left out instead of dropping it
 * silently. Structure is checked by the zod schemas in `schema.ts`; the
 * artifact roll invariants are the same `validateArtifactDraft` manual entry
 * uses.
 * @packageDocumentation
 */

import type {
  Artifact,
  BuildLevel,
  Element,
  Slot,
  StatKey,
  SubStat,
} from '../game/types';
import { BUILD_LEVELS, ELEMENTS, SLOTS } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { validateArtifactDraft } from '../game/artifactValidation';
import {
  GoodArtifact,
  GoodCharacter,
  GoodFields,
  GoodFile,
  GoodList,
  GoodSource,
  GoodSubstat,
  GoodVersion,
  GoodWeapon,
  MAX_ARTIFACTS,
  MAX_ROSTER,
} from './schema';

/** GOOD stat key → ours. Every elemental DMG% bonus maps to the one fungible
 *  `elemental_dmg` stat (ADR-0011); the element itself is kept separately. */
export const GOOD_STAT_KEYS: Record<string, StatKey> = {
  hp: 'hp',
  hp_: 'hp_pct',
  atk: 'atk',
  atk_: 'atk_pct',
  def: 'def',
  def_: 'def_pct',
  eleMas: 'em',
  enerRech_: 'er_pct',
  critRate_: 'crit_rate',
  critDMG_: 'crit_dmg',
  ...Object.fromEntries(ELEMENTS.map((el) => [`${el}_dmg_`, 'elemental_dmg'])),
  physical_dmg_: 'physical_dmg',
  heal_: 'healing',
};

// A goblet's mainStatKey carries its element ('pyro_dmg_'); keep it (ADR-0014).
const ELEMENT_OF_KEY: Record<string, Element> = Object.fromEntries(
  ELEMENTS.map((el) => [`${el}_dmg_`, el]),
) as Record<string, Element>;

/** GOOD keys and dataset keys match once both are lowercased and stripped to
 *  letters and digits: "RaidenShogun" and "raiden_shogun", "AmosBow" and
 *  "amos'_bow". */
export const normalizeKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '');

const characterByNorm = new Map(
  genshinAdapter.characters().map((c) => [normalizeKey(c.key), c.key]),
);
const weaponByNorm = new Map(
  genshinAdapter.weapons().map((w) => [normalizeKey(w.key), w.key]),
);

// Ascension 0..6 → that phase's level cap. A character can't be de-levelled,
// so the cap is where the player is heading: builds are evaluated there
// (ADR-0015).
const ASCENSION_CAP = BUILD_LEVELS.slice(1) as BuildLevel[];

export interface RosterEntry {
  buildLevel?: BuildLevel;
  /** Current character level from GOOD (1..90), distinct from the ascension-
   *  derived buildLevel the optimiser evaluates at. */
  level?: number;
  constellation?: number;
  talents?: { auto: number; skill: number; burst: number };
  weaponKey?: string;
  weaponLevel?: number;
}

/** One weapon from the file's inventory, equipped or not. */
export interface OwnedWeapon {
  /** Position in the file's `weapons` list. */
  index: number;
  key: string;
  level?: number;
  ascension?: number;
  refinement?: number;
  /** Dataset key of the character holding it; unset when nobody is. */
  location?: string;
  lock?: boolean;
}

/** One artifact from the file, with what the `Artifact` model doesn't carry. */
export interface GoodArtifactEntry {
  /** Position in the file's `artifacts` list, for sidecar data (TODO 2.3). */
  index: number;
  artifact: Artifact;
  lock?: boolean;
}

/**
 * Why something in the file was not used as-is. `invalid`: not valid GOOD
 * (wrong shape, type or range). `unsupported`: valid GOOD this app can't use
 * (a 3★ artifact, an unknown stat key). `unresolved`: a character or weapon
 * key the dataset doesn't know (the Traveler, or content newer than the
 * snapshot). `truncated`: a list longer than the importer reads.
 */
export interface GoodIssue {
  path: (string | number)[];
  code: 'invalid' | 'unsupported' | 'unresolved' | 'truncated';
  message: string;
}

export interface NormalizedGood {
  source?: string;
  version?: number;
  /** `null` when the file has no usable artifact list (missing, not a list,
   *  or longer than MAX_ARTIFACTS); `[]` when it has an empty one. */
  artifacts: GoodArtifactEntry[] | null;
  roster: Record<string, RosterEntry>;
  weapons: OwnedWeapon[];
  issues: GoodIssue[];
}

/** One zod issue, typed from a schema so no other zod entry point is needed. */
type ZodIssue = NonNullable<
  ReturnType<typeof GoodArtifact.safeParse>['error']
>['issues'][number];

function describe(issue: ZodIssue): string {
  const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
  if (issue.code === 'invalid_type')
    return `${where}expected ${issue.expected}`;
  if (issue.code === 'too_small' || issue.code === 'too_big')
    return `${where}out of range`;
  if (issue.code === 'invalid_value') return `${where}unexpected value`;
  return `${where}${issue.code}`;
}

/** The value if it fits the schema, else undefined: for fields dropped one
 *  by one rather than failing their whole entry. */
function field<T>(
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T | undefined {
  const r = schema.safeParse(value);
  return r.success ? r.data : undefined;
}

/**
 * Normalize a GOOD file. Returns `null` when the input isn't a GOOD file at
 * all (not an object, or `format` isn't "GOOD").
 */
export function normalizeGOOD(json: unknown): NormalizedGood | null {
  const file = GoodFile.safeParse(json);
  if (!file.success) return null;
  const issues: GoodIssue[] = [];
  const at =
    (...base: (string | number)[]) =>
    (code: GoodIssue['code'], message: string, ...more: (string | number)[]) =>
      issues.push({ path: [...base, ...more], code, message });

  /** A non-empty `location` resolves to a character, or is reported. */
  const resolveLocation = (
    raw: unknown,
    report: ReturnType<typeof at>,
  ): string | undefined => {
    const loc = field(GoodFields.location, raw);
    if (loc === undefined || loc === '') return undefined;
    const key = characterByNorm.get(normalizeKey(loc));
    if (!key)
      report(
        'unresolved',
        `location "${loc}" is not a known character`,
        'location',
      );
    return key;
  };

  const list = (name: 'artifacts' | 'characters' | 'weapons', cap?: number) => {
    const raw = file.data[name];
    if (raw === undefined) return undefined;
    const parsed = GoodList.safeParse(raw);
    if (!parsed.success) {
      at(name)('invalid', `${name}: expected a list`);
      return undefined;
    }
    if (cap !== undefined && parsed.data.length > cap) {
      at(name)(
        'truncated',
        `${name}: only the first ${cap} of ${parsed.data.length} are read`,
      );
      return parsed.data.slice(0, cap);
    }
    return parsed.data;
  };

  // ---- artifacts --------------------------------------------------------
  let artifacts: GoodArtifactEntry[] | null = null;
  const rawArtifacts = list('artifacts');
  if (rawArtifacts && rawArtifacts.length > MAX_ARTIFACTS) {
    at('artifacts')(
      'invalid',
      `artifacts: ${rawArtifacts.length} is over the ${MAX_ARTIFACTS} limit`,
    );
  } else if (rawArtifacts) {
    artifacts = [];
    rawArtifacts.forEach((raw, index) => {
      const report = at('artifacts', index);
      const a = GoodArtifact.safeParse(raw);
      if (!a.success) {
        report('invalid', describe(a.error.issues[0]));
        return;
      }
      const g = a.data;
      if (!(SLOTS as string[]).includes(g.slotKey)) {
        report(
          'unsupported',
          `slotKey "${g.slotKey}" is not a slot`,
          'slotKey',
        );
        return;
      }
      const mainStat = GOOD_STAT_KEYS[g.mainStatKey];
      if (!mainStat) {
        report(
          'unsupported',
          `mainStatKey "${g.mainStatKey}" is not a known stat`,
          'mainStatKey',
        );
        return;
      }
      if (g.rarity !== 4 && g.rarity !== 5) {
        report(
          'unsupported',
          `rarity ${g.rarity}: only 4★ and 5★ artifacts are scored`,
          'rarity',
        );
        return;
      }
      const subStats: SubStat[] = [];
      if (g.substats !== undefined) {
        const subs = GoodList.safeParse(g.substats);
        if (!subs.success)
          report('invalid', 'substats: expected a list', 'substats');
        else
          subs.data.forEach((rawSub, j) => {
            const s = GoodSubstat.safeParse(rawSub);
            if (!s.success) {
              report(
                'invalid',
                `substat dropped: ${describe(s.error.issues[0])}`,
                'substats',
                j,
              );
              return;
            }
            const key = GOOD_STAT_KEYS[s.data.key];
            if (!key) {
              report(
                'unsupported',
                `substat "${s.data.key}" is not a known stat`,
                'substats',
                j,
              );
              return;
            }
            subStats.push({ key, value: s.data.value });
          });
      }
      const rollProblem = validateArtifactDraft({
        mainStat,
        level: g.level,
        subStats,
      });
      if (rollProblem) {
        report('invalid', rollProblem);
        return;
      }
      const slot = g.slotKey as Slot;
      artifacts!.push({
        index,
        artifact: {
          id: crypto.randomUUID(),
          setKey: g.setKey,
          slot,
          rarity: g.rarity,
          level: g.level,
          mainStat,
          mainStatValue: genshinAdapter.mainStatValue(
            mainStat,
            g.rarity,
            g.level,
          ),
          subStats,
          element:
            slot === 'goblet' ? ELEMENT_OF_KEY[g.mainStatKey] : undefined,
          location: resolveLocation(g.location, report),
        },
        lock: field(GoodFields.lock, g.lock),
      });
    });
  }

  // ---- characters --------------------------------------------------------
  const roster: Record<string, RosterEntry> = {};
  (list('characters', MAX_ROSTER) ?? []).forEach((raw, index) => {
    const report = at('characters', index);
    const c = GoodCharacter.safeParse(raw);
    if (!c.success) {
      report('invalid', describe(c.error.issues[0]));
      return;
    }
    const key = characterByNorm.get(normalizeKey(c.data.key));
    if (!key) {
      report(
        'unresolved',
        `character "${c.data.key}" is not in the dataset`,
        'key',
      );
      return;
    }
    const entry: RosterEntry = {};
    const asc = field(GoodFields.ascension, c.data.ascension);
    if (asc !== undefined) entry.buildLevel = ASCENSION_CAP[asc];
    const level = field(GoodFields.characterLevel, c.data.level);
    if (level !== undefined) entry.level = level;
    const cons = field(GoodFields.constellation, c.data.constellation);
    if (cons !== undefined) entry.constellation = cons;
    const t = field(GoodFields.talent, c.data.talent);
    if (t) {
      const auto = field(GoodFields.talentLevel, t.auto);
      const skill = field(GoodFields.talentLevel, t.skill);
      const burst = field(GoodFields.talentLevel, t.burst);
      // All three or none: a partial triple would understate the build score
      // rather than admit the export was incomplete.
      if (auto !== undefined && skill !== undefined && burst !== undefined)
        entry.talents = { auto, skill, burst };
    }
    roster[key] = entry;
  });

  // ---- weapons -----------------------------------------------------------
  const weapons: OwnedWeapon[] = [];
  (list('weapons', MAX_ROSTER) ?? []).forEach((raw, index) => {
    const report = at('weapons', index);
    const w = GoodWeapon.safeParse(raw);
    if (!w.success) {
      report('invalid', describe(w.error.issues[0]));
      return;
    }
    const key = weaponByNorm.get(normalizeKey(w.data.key));
    if (!key) {
      report(
        'unresolved',
        `weapon "${w.data.key}" is not in the dataset`,
        'key',
      );
      return;
    }
    const owned: OwnedWeapon = { index, key };
    const level = field(GoodFields.weaponLevel, w.data.level);
    if (level !== undefined) owned.level = level;
    const asc = field(GoodFields.ascension, w.data.ascension);
    if (asc !== undefined) owned.ascension = asc;
    const ref = field(GoodFields.refinement, w.data.refinement);
    if (ref !== undefined) owned.refinement = ref;
    const location = resolveLocation(w.data.location, report);
    if (location !== undefined) owned.location = location;
    const lock = field(GoodFields.lock, w.data.lock);
    if (lock !== undefined) owned.lock = lock;
    weapons.push(owned);
    // An equipped weapon implies its holder is owned, even when the holder is
    // missing from `characters`.
    if (location !== undefined) {
      const entry = (roster[location] ??= {});
      entry.weaponKey = key;
      if (level !== undefined) entry.weaponLevel = level;
    }
  });

  return {
    source: field(GoodSource, file.data.source),
    version: field(GoodVersion, file.data.version),
    artifacts,
    roster,
    weapons,
    issues,
  };
}
