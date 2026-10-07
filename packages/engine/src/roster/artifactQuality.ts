/**
 * Artifact quality (ADR-0057, ADR-0058, ADR-0059): how good a character's
 * equipped artifacts are for them, as a score with no cap.
 *
 * - **Main stats, up to 21:** 7 for each of sands, goblet and circlet whose
 *   main stat the build accepts (a slot can accept several).
 * - **Good rolls:** each substat the build uses counts its value ÷ that
 *   stat's largest single 5★ roll (a perfect roll is 1, the lowest tier 0.7).
 *   Flat HP, ATK and DEF count at 0.4. CRIT Rate, CRIT DMG and Energy
 *   Recharge count for everyone, all of it, apart from the stats a kit makes
 *   useless (`UNUSED_STATS`). The Energy Recharge minimum is shown, never a
 *   limit.
 *
 * A character can have several builds (`GUIDE_BUILDS`): each is scored on
 * its own and the best one counts, the first on a tie. A character the
 * guides don't cover is scored against their curated target, and one with
 * neither has no build, and no score is guessed.
 *
 * The score compares artifacts for one character. The most good rolls their
 * pieces could hold is given beside it, which is how two characters are read
 * together. Pure.
 * @packageDocumentation
 */

import type { Artifact, Element, Slot, StatKey, StatVec } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import {
  isSubStatKey,
  SUBSTAT_TIERS_5,
  type SubStatKey,
} from '../game/genshin/substatRolls';
import {
  GUIDE_BUILDS,
  type BuildRole,
  type GuideSource,
} from '../meta/guideBuilds';
import { META_TARGETS } from '../meta/metaTargets';
import { countSets } from '../optimizer/score';

/** Points for each checked slot whose main stat the build accepts. */
export const MAIN_STAT_POINTS = 7;
/** What one roll of a flat stat counts for, against its percent version. */
export const FLAT_FACTOR = 0.4;
/** Pieces whose main stat varies, and so is checked. */
export const CHECKED_SLOTS = ['sands', 'goblet', 'circlet'] as const;
export type CheckedSlot = (typeof CHECKED_SLOTS)[number];

/** The order the score lists its stats in, everywhere. */
export const QUALITY_STAT_ORDER: readonly SubStatKey[] = [
  'crit_rate',
  'crit_dmg',
  'hp_pct',
  'hp',
  'atk_pct',
  'atk',
  'def_pct',
  'def',
  'em',
  'er_pct',
];

/** Stats that count for every character: */
const EVERYONE: readonly SubStatKey[] = ['crit_rate', 'crit_dmg', 'er_pct'];

/**
 * ...except where the character's kit makes them useless. Added by hand from
 * the kit: there's no automatic check of a kit against stats yet.
 */
export const UNUSED_STATS: Record<
  string,
  { stats: SubStatKey[]; reason: string }
> = {
  sangonomiya_kokomi: {
    stats: ['crit_rate', 'crit_dmg'],
    reason: 'her passive lowers her CRIT Rate by 100%, so crit does nothing',
  },
  mavuika: {
    stats: ['er_pct'],
    reason: 'her burst runs on Fighting Spirit, not energy',
  },
  skirk: {
    stats: ['er_pct'],
    reason: 'her burst runs on Serpent’s Subtlety, not energy',
  },
};

const SCALING_STATS: readonly StatKey[] = [
  'hp_pct',
  'atk_pct',
  'def_pct',
  'em',
];
const FLAT_OF: Partial<Record<StatKey, SubStatKey>> = {
  hp_pct: 'hp',
  atk_pct: 'atk',
  def_pct: 'def',
};
/** Flat HP, ATK and DEF, which count at 0.4. */
const FLATS = new Set<StatKey>(Object.values(FLAT_OF));
/** A stat a target names, as the percent stat it asks for (a target on total
 *  HP is met mostly by HP% rolls). */
const TARGET_STAT: Partial<Record<StatKey, StatKey>> = {
  hp: 'hp_pct',
  atk: 'atk_pct',
  def: 'def_pct',
};

/** One build: what it uses, and the main stats it accepts. */
export interface QualityProfile {
  /** As the guide names it. */
  name: string;
  role?: BuildRole;
  /** The constellation the build needs, such as "C6". */
  constellation?: string;
  /** The guides it comes from; empty for a curated target. */
  sources: GuideSource[];
  /** Each usable substat and what one of its rolls counts for. */
  usable: Partial<Record<SubStatKey, number>>;
  /** The build's Energy Recharge minimum, including the base 100% (shown
   *  only). */
  erMin?: number;
  /** The guide's figures for particular weapons (shown only). */
  erWeapons?: { weapon: string; min: number }[];
  accepts: Record<CheckedSlot, StatKey[]>;
  element?: Element | 'physical';
  /** The sets the build recommends. */
  recommendedSets: string[];
  /** Stats their kit makes useless, and why. */
  unused?: { stats: SubStatKey[]; reason: string };
  from: 'guides' | 'curated';
}

const unique = <T>(xs: (T | undefined)[]): T[] => [
  ...new Set(xs.filter((x): x is T => x !== undefined)),
];

/** The usable stats, each with what one roll counts for: the given ones and
 *  their flat versions at 0.4, then crit and Energy Recharge, less the
 *  character's exceptions. */
function usableFrom(
  characterKey: string,
  stats: StatKey[],
): Partial<Record<SubStatKey, number>> {
  const usable: Partial<Record<SubStatKey, number>> = {};
  const add = (k: StatKey, f: number) => {
    if (isSubStatKey(k)) usable[k] = Math.max(usable[k] ?? 0, f);
  };
  for (const k of [...stats, ...EVERYONE]) {
    add(k, FLATS.has(k) ? FLAT_FACTOR : 1);
    const flat = FLAT_OF[k];
    if (flat) add(flat, FLAT_FACTOR);
  }
  for (const k of UNUSED_STATS[characterKey]?.stats ?? []) delete usable[k];
  return usable;
}

/** A curated target as one build, for a character the guides don't cover. */
function curatedProfile(
  characterKey: string,
): Omit<QualityProfile, 'element' | 'unused'> | null {
  const m = META_TARGETS[characterKey];
  if (!m) return null;
  const element = genshinAdapter.character(characterKey)?.element;
  const objective = m.objective as StatKey | string;
  const scaling: StatKey = SCALING_STATS.includes(objective as StatKey)
    ? (objective as StatKey)
    : m.mains.sands && SCALING_STATS.includes(m.mains.sands)
      ? m.mains.sands
      : 'atk_pct';
  const targets = Object.keys(m.statTargets ?? {}) as StatKey[];
  const critBuild =
    objective === 'crit_value' ||
    objective === 'avg_damage' ||
    targets.some((t) => t === 'crit_rate' || t === 'crit_dmg');
  return {
    name: 'Curated build',
    sources: [],
    usable: usableFrom(characterKey, [
      scaling,
      ...targets.map((t) => TARGET_STAT[t] ?? t),
    ]),
    ...(m.erTarget !== undefined && { erMin: m.erTarget }),
    accepts: {
      sands: unique([m.mains.sands, scaling]),
      goblet: unique<StatKey>([
        m.mains.goblet,
        element === 'physical' ? 'physical_dmg' : 'elemental_dmg',
        scaling,
      ]),
      circlet: unique<StatKey>([
        m.mains.circlet,
        ...(critBuild ? (['crit_rate', 'crit_dmg'] as StatKey[]) : []),
        scaling,
      ]),
    },
    recommendedSets: unique([
      ...(m.setRequirement.kind === '2+2'
        ? m.setRequirement.setKeys
        : [m.setRequirement.setKey]),
      ...(m.otherSets ?? []),
    ]),
    from: 'curated',
  };
}

/** A character's builds, in the guides' order: from the guides, else their
 *  curated target, else none. */
export function qualityProfiles(characterKey: string): QualityProfile[] {
  const element = genshinAdapter.character(characterKey)?.element;
  const unused = UNUSED_STATS[characterKey];
  const common = {
    ...(element && { element }),
    ...(unused && { unused }),
  };
  const guides = GUIDE_BUILDS[characterKey]?.builds ?? [];
  if (guides.length > 0)
    return guides.map((g) => ({
      name: g.name,
      role: g.role,
      ...(g.constellation && { constellation: g.constellation }),
      sources: [...g.sources],
      usable: usableFrom(characterKey, g.substats),
      ...(g.erMin !== undefined && { erMin: g.erMin }),
      ...(g.erWeapons && { erWeapons: g.erWeapons }),
      accepts: {
        sands: [...g.accepts.sands],
        goblet: [...g.accepts.goblet],
        circlet: [...g.accepts.circlet],
      },
      recommendedSets: [...g.sets],
      from: 'guides' as const,
      ...common,
    }));
  const curated = curatedProfile(characterKey);
  return curated ? [{ ...curated, ...common }] : [];
}

/** A character's first build, or null without one. */
export function qualityProfile(characterKey: string): QualityProfile | null {
  return qualityProfiles(characterKey)[0] ?? null;
}

/** The builds a guide lists but leaves a main stat or the substats out of,
 *  so they can't be scored, and why. */
export function unscoredBuilds(characterKey: string) {
  return GUIDE_BUILDS[characterKey]?.unscored ?? [];
}

export interface ArtifactQuality {
  /** Main stat points plus good rolls. */
  total: number;
  /** Which build this is (an index into `qualityProfiles`), and the build. */
  build: number;
  profile: QualityProfile;
  main: {
    points: number;
    /** The checked slots, worn or not. */
    slots: { slot: CheckedSlot; mainStat?: StatKey; ok: boolean }[];
  };
  /** Good rolls, in roll-equivalents. */
  rolls: number;
  /** The most good rolls the worn pieces could hold. */
  possible: number;
  /** Good rolls by stat, in `QUALITY_STAT_ORDER`. */
  byStat: Partial<Record<SubStatKey, number>>;
  /** Energy Recharge against the build's minimum, when it counts for them. */
  er?: { min?: number; total: number; short: number };
  /** Stats their kit makes useless, and why. */
  unused?: { stats: SubStatKey[]; reason: string };
}

/** The largest single 5★ roll of a substat. */
const maxRoll = (k: SubStatKey) => SUBSTAT_TIERS_5[k][3];

/** Whether a piece's main stat is one the build accepts in its slot; an
 *  elemental goblet only of their own element (or one the source didn't
 *  name). */
function accepted(p: QualityProfile, a: Artifact): boolean {
  if (!(CHECKED_SLOTS as readonly string[]).includes(a.slot)) return true;
  if (!p.accepts[a.slot as CheckedSlot].includes(a.mainStat)) return false;
  return (
    a.mainStat !== 'elemental_dmg' ||
    a.element === undefined ||
    a.element === p.element
  );
}

/** The most good rolls one piece could hold: four lines from the usable
 *  stats (never its own main stat), and every upgrade into the best one. */
function possibleFor(p: QualityProfile, a: Artifact): number {
  const factors = (Object.entries(p.usable) as [SubStatKey, number][])
    .filter(([k]) => k !== a.mainStat)
    .map(([, f]) => f)
    .sort((x, y) => y - x);
  if (factors.length === 0) return 0;
  const upgrades = a.rarity >= 5 ? 5 : 4;
  return factors.slice(0, 4).reduce((s, f) => s + f, 0) + upgrades * factors[0];
}

/** Energy Recharge from everything but the substats: base (with the
 *  ascension stat and the weapon's substat, at the build level), main stats
 *  and 2-piece bonuses. Without a weapon the dataset can't place, base only. */
function erBeforeSubstats(
  characterKey: string,
  entry: { buildLevel?: number; weaponKey?: string } | undefined,
  pieces: readonly Artifact[],
): number {
  let er = 100;
  if (entry?.weaponKey) {
    try {
      const level = (entry.buildLevel ?? 90) as Parameters<
        typeof genshinAdapter.baseStats
      >[2];
      er =
        genshinAdapter.baseStats(characterKey, entry.weaponKey, level).er_pct ??
        100;
    } catch {
      // A key the snapshot doesn't know: the base 100% stands.
    }
  }
  for (const a of pieces) if (a.mainStat === 'er_pct') er += a.mainStatValue;
  const counts = countSets([...pieces]);
  for (const s of genshinAdapter.sets())
    if ((counts[s.key] ?? 0) >= 2)
      er += (s.twoPiece as StatVec | undefined)?.er_pct ?? 0;
  return er;
}

/** The pieces scored against one build. */
function scoreBuild(
  p: QualityProfile,
  build: number,
  erBefore: () => number,
  pieces: readonly Artifact[],
): ArtifactQuality {
  const slots = CHECKED_SLOTS.map((slot) => {
    const a = pieces.find((x) => x.slot === slot);
    return a
      ? { slot, mainStat: a.mainStat, ok: accepted(p, a) }
      : { slot, ok: false };
  });
  const mainPoints = slots.filter((s) => s.ok).length * MAIN_STAT_POINTS;

  const sums: Partial<Record<SubStatKey, number>> = {};
  let erSubs = 0;
  for (const a of pieces)
    for (const s of a.subStats) {
      if (!isSubStatKey(s.key)) continue;
      if (s.key === 'er_pct') erSubs += s.value;
      const f = p.usable[s.key];
      if (!f) continue;
      sums[s.key] = (sums[s.key] ?? 0) + (s.value / maxRoll(s.key)) * f;
    }
  const byStat: Partial<Record<SubStatKey, number>> = {};
  for (const k of QUALITY_STAT_ORDER)
    if (sums[k] !== undefined) byStat[k] = sums[k];

  let er: ArtifactQuality['er'];
  if (p.usable.er_pct) {
    const total = erBefore() + erSubs;
    er = {
      ...(p.erMin !== undefined && { min: p.erMin }),
      total,
      short: p.erMin !== undefined ? Math.max(0, p.erMin - total) : 0,
    };
  }

  const rolls = Object.values(byStat).reduce((s, v) => s + (v ?? 0), 0);
  return {
    total: mainPoints + rolls,
    build,
    profile: p,
    main: { points: mainPoints, slots },
    rolls,
    possible: pieces.reduce((s, a) => s + possibleFor(p, a), 0),
    byStat,
    ...(er && { er }),
    ...(p.unused && { unused: p.unused }),
  };
}

/** The pieces scored against each of the character's builds, in order. */
export function artifactQualities(
  characterKey: string,
  entry: { buildLevel?: number; weaponKey?: string } | undefined,
  pieces: readonly Artifact[],
): ArtifactQuality[] {
  let before: number | undefined;
  const erBefore = () =>
    (before ??= erBeforeSubstats(characterKey, entry, pieces));
  return qualityProfiles(characterKey).map((p, i) =>
    scoreBuild(p, i, erBefore, pieces),
  );
}

/** A character's artifact quality: against the given build, or the build
 *  that fits their pieces best (the first on a tie). Null without a build. */
export function artifactQuality(
  characterKey: string,
  entry: { buildLevel?: number; weaponKey?: string } | undefined,
  pieces: readonly Artifact[],
  build?: number,
): ArtifactQuality | null {
  const all = artifactQualities(characterKey, entry, pieces);
  if (build !== undefined && all[build]) return all[build];
  return bestOf(all);
}

/** The best-scoring of several, the first on a tie; null for none. */
export function bestOf(all: readonly ArtifactQuality[]) {
  let best: ArtifactQuality | null = null;
  for (const q of all) if (!best || q.total > best.total + 1e-9) best = q;
  return best;
}

/** Whether a set is one a character's build recommends (their first build
 *  unless one is given). */
export function isRecommendedSet(
  characterKey: string,
  setKey: string,
  build = 0,
) {
  return (
    qualityProfiles(characterKey)[build]?.recommendedSets.includes(setKey) ??
    false
  );
}

/** A name compared loosely: lower case, one kind of apostrophe, no
 *  refinement ("R5"). */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+r\d\b.*$/, '')
    .trim();

/** The guide's Energy Recharge figure for the weapon a character holds, when
 *  the build gives one ("Favonius Codex" for a Favonius Codex; a generic
 *  "Favonius" for any of them). */
export function guideErForWeapon(
  profile: QualityProfile,
  weaponName: string,
): { weapon: string; min: number } | undefined {
  const name = norm(weaponName);
  return profile.erWeapons?.find((w) =>
    w.weapon
      .split('/')
      .map(norm)
      .some((part) => part.includes(name) || name.startsWith(part)),
  );
}

/** The checked slot a piece is in, if any (for labels). */
export const isCheckedSlot = (s: Slot): s is CheckedSlot =>
  (CHECKED_SLOTS as readonly string[]).includes(s);
