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
import { MAX_KEY_LEN, validateArtifactDraft } from '../game/artifactValidation';

// A full-collection GOOD export is large (a maxed account's artifact inventory
// runs into the low thousands) but not unbounded; cap generously so a
// corrupt/malicious file can't wedge the main thread parsing/rendering an
// arbitrarily huge array, while still admitting a real full export.
const MAX_ARTIFACTS = 4000;

const STAT_MAP: Record<string, StatKey> = {
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

// GOOD's mainStatKey already carries the element for elemental_dmg goblets
// (e.g. 'pyro_dmg_') — capture it instead of discarding it (ADR-0014).
// Derived from ELEMENTS so this can't drift out of sync with the canonical list.
const ELEMENT_KEYS: Record<string, Element> = Object.fromEntries(
  ELEMENTS.map((el) => [`${el}_dmg_`, el]),
) as Record<string, Element>;

const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** GOOD keys ("RaidenShogun") and dataset keys ("raiden_shogun", "amos'_bow")
 *  are matched by normalizing both to alphanumeric lowercase. Built once and
 *  shared by the artifact and roster parsers. */
const charByNorm = new Map(
  genshinAdapter.characters().map((c) => [normalizeKey(c.key), c.key]),
);

/** The dataset character key a GOOD `location` names, or undefined when the
 *  field is empty, absent or unresolvable (e.g. a Traveler variant). */
function resolveLocation(location: unknown): string | undefined {
  if (typeof location !== 'string' || location === '') return undefined;
  return charByNorm.get(normalizeKey(location));
}

interface GoodArtifact {
  setKey: string;
  slotKey: string;
  rarity: number;
  level: number;
  mainStatKey: string;
  substats: { key: string; value: number }[];
  location?: string;
}

export function parseGOOD(json: unknown): Artifact[] | { error: 'BAD_FORMAT' } {
  if (typeof json !== 'object' || json === null) return { error: 'BAD_FORMAT' };
  const obj = json as Record<string, unknown>;
  if (
    obj.format !== 'GOOD' ||
    !Array.isArray(obj.artifacts) ||
    obj.artifacts.length > MAX_ARTIFACTS
  )
    return { error: 'BAD_FORMAT' };

  const out: Artifact[] = [];
  for (const raw of obj.artifacts as GoodArtifact[]) {
    if (typeof raw !== 'object' || raw === null) continue; // tolerate malformed array elements
    const slot = (SLOTS as string[]).includes(raw.slotKey)
      ? (raw.slotKey as Slot)
      : undefined;
    const mainStat = STAT_MAP[raw.mainStatKey];
    if (!slot || !mainStat) continue; // skip unrecognised entries rather than throwing
    if (raw.rarity !== 4 && raw.rarity !== 5) continue; // reject corrupt rarity
    // Guard the array shape too, not just undefined — a non-array `substats`
    // (malformed export) would otherwise throw on `.map`, breaking the
    // "skip malformed rather than throw" contract above.
    const rawSubs = Array.isArray(raw.substats) ? raw.substats : [];
    const subStats: SubStat[] = rawSubs
      // Guard each element's shape too, not just the outer array — a null or
      // primitive entry ([null], [5]) would otherwise throw on `s.key`,
      // breaking the "skip malformed rather than throw" contract above.
      .filter((s) => typeof s === 'object' && s !== null)
      .map((s) => ({ key: STAT_MAP[s.key], value: s.value }))
      .filter((s): s is SubStat => Boolean(s.key) && Number.isFinite(s.value));
    // Same invariant the manual ArtifactForm entry path enforces (<=4
    // sub-stats, none equal to the main stat) — a GOOD export can carry the
    // same corruption a hand-typed draft can.
    if (validateArtifactDraft({ mainStat, level: raw.level, subStats }))
      continue;
    // setKey is carried through unvalidated into set-bonus lookups and the DOM
    // (formatSetName); bound it by the one shared key cap the share link and
    // the AI proxy payload guard also apply.
    if (
      typeof raw.setKey !== 'string' ||
      raw.setKey.length === 0 ||
      raw.setKey.length > MAX_KEY_LEN
    )
      continue;
    out.push({
      id: crypto.randomUUID(),
      setKey: raw.setKey,
      slot,
      rarity: raw.rarity,
      level: raw.level,
      mainStat,
      mainStatValue: genshinAdapter.mainStatValue(
        mainStat,
        raw.rarity,
        raw.level,
      ),
      subStats,
      element: slot === 'goblet' ? ELEMENT_KEYS[raw.mainStatKey] : undefined,
      location: resolveLocation(raw.location),
    });
  }
  return out;
}

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

/** Range-guarded integer read: out-of-range or non-integer values are dropped
 *  field-wise, matching the surrounding skip-don't-throw contract. */
function intInRange(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : undefined;
}

// Ascension 0..6 → max level cap. A character can't be de-leveled, so the cap
// is the level the player is heading to — evaluate builds there (ADR-0015).
const ASCENSION_CAP = BUILD_LEVELS.slice(1) as BuildLevel[];

// Same wedge-guard rationale as MAX_ARTIFACTS; real accounts are ~100/150.
const MAX_ROSTER = 1000;

/** Owned-roster extraction from a GOOD export: which characters the player
 *  owns, what weapon each has equipped, and the build level implied by their
 *  ascension. GOOD keys ("RaidenShogun") and dataset keys ("raiden_shogun",
 *  "amos'_bow") are matched by normalizing both to alphanumeric lowercase.
 *  Unresolvable keys (e.g. "TravelerAnemo" — Traveler isn't in the frozen
 *  dataset) are skipped, mirroring parseGOOD's skip-don't-throw contract. */
export function parseGOODRoster(json: unknown): Record<string, RosterEntry> {
  if (typeof json !== 'object' || json === null) return {};
  const obj = json as Record<string, unknown>;
  if (obj.format !== 'GOOD') return {};
  const rawChars = Array.isArray(obj.characters)
    ? obj.characters.slice(0, MAX_ROSTER)
    : [];
  const rawWeapons = Array.isArray(obj.weapons)
    ? obj.weapons.slice(0, MAX_ROSTER)
    : [];
  if (rawChars.length === 0 && rawWeapons.length === 0) return {};

  const weaponByNorm = new Map(
    genshinAdapter.weapons().map((w) => [normalizeKey(w.key), w.key]),
  );

  const entries: Record<string, RosterEntry> = {};
  for (const raw of rawChars) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { key, ascension, level, constellation, talent } = raw as {
      key?: unknown;
      ascension?: unknown;
      level?: unknown;
      constellation?: unknown;
      talent?: unknown;
    };
    if (typeof key !== 'string') continue;
    const ours = charByNorm.get(normalizeKey(key));
    if (!ours) continue;
    const entry: RosterEntry = {};
    const asc = intInRange(ascension, 0, 6);
    if (asc !== undefined) entry.buildLevel = ASCENSION_CAP[asc];
    const lvl = intInRange(level, 1, 90);
    if (lvl !== undefined) entry.level = lvl;
    const cons = intInRange(constellation, 0, 6);
    if (cons !== undefined) entry.constellation = cons;
    if (typeof talent === 'object' && talent !== null) {
      const t = talent as Record<string, unknown>;
      const auto = intInRange(t.auto, 1, 15);
      const skill = intInRange(t.skill, 1, 15);
      const burst = intInRange(t.burst, 1, 15);
      // All three or none — a partial talent triple would silently understate
      // the build score rather than admit the export was incomplete.
      if (auto !== undefined && skill !== undefined && burst !== undefined)
        entry.talents = { auto, skill, burst };
    }
    entries[ours] = entry;
  }
  for (const raw of rawWeapons) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { key, location, level } = raw as {
      key?: unknown;
      location?: unknown;
      level?: unknown;
    };
    if (typeof key !== 'string') continue;
    const ourChar = resolveLocation(location);
    const ourWeapon = weaponByNorm.get(normalizeKey(key));
    if (!ourChar || !ourWeapon) continue;
    // A weapon equipped on a character missing from characters[] still
    // implies ownership — create the entry.
    const entry = (entries[ourChar] ??= {});
    entry.weaponKey = ourWeapon;
    const wl = intInRange(level, 1, 90);
    if (wl !== undefined) entry.weaponLevel = wl;
  }
  return entries;
}
