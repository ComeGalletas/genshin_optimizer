/**
 * Artifact quality (ADR-0057): how good a character's equipped artifacts are
 * for them, as a score with no cap.
 *
 * - **Main stats, up to 30:** 10 for each of sands, goblet and circlet whose
 *   main stat the character accepts (a slot can accept several).
 * - **Good rolls:** each substat the character uses counts its value ÷ that
 *   stat's largest single 5★ roll (a perfect roll is 1, the lowest tier 0.7).
 *   Flat HP, ATK and DEF count at 0.4. Energy Recharge counts only up to the
 *   character's minimum, or all of it for one whose damage scales with it.
 *
 * The score compares artifacts for one character. The most good rolls their
 * pieces could hold is given beside it, which is how two characters are read
 * together. Which stats a character uses comes from the curated targets until
 * the build sources (TODO 10.2) give substat priorities; a character without
 * targets has no profile, and no score is guessed. Pure.
 * @packageDocumentation
 */

import type { Artifact, Element, Slot, StatKey, StatVec } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import {
  isSubStatKey,
  SUBSTAT_TIERS_5,
  type SubStatKey,
} from '../game/genshin/substatRolls';
import { META_TARGETS } from '../meta/metaTargets';
import { countSets } from '../optimizer/score';

/** Points for each checked slot whose main stat the character accepts. */
export const MAIN_STAT_POINTS = 10;
/** What one roll of a flat stat counts for, against its percent version. */
export const FLAT_FACTOR = 0.4;
/** Pieces whose main stat varies, and so is checked. */
export const CHECKED_SLOTS = ['sands', 'goblet', 'circlet'] as const;
export type CheckedSlot = (typeof CHECKED_SLOTS)[number];

/** Characters whose damage grows with Energy Recharge: every roll of it
 *  counts, past their minimum too. */
const ER_SCALES = new Set(['raiden_shogun']);

/** What the curated targets leave out, until the build sources (TODO 10.2)
 *  give substat priorities. Checked against the owner's account on
 *  2026-10-06, each from the character's KQM guide: */
const EXTRA_USABLE: Record<string, StatKey[]> = {
  // Her skill's damage and healing scale with HP: EM > ER > HP%.
  kuki_shinobu: ['hp_pct'],
};
const EXTRA_MAINS: Record<string, Partial<Record<CheckedSlot, StatKey[]>>> = {
  // A Healing Bonus circlet when she or he is the team's healer.
  kuki_shinobu: { circlet: ['healing'] },
  bennett: { circlet: ['healing'] },
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
/** A stat a target names, as the percent stat it asks for (a target on total
 *  HP is met mostly by HP% rolls). */
const TARGET_STAT: Partial<Record<StatKey, StatKey>> = {
  hp: 'hp_pct',
  atk: 'atk_pct',
  def: 'def_pct',
};

/** What a character uses, and the main stats they accept. */
export interface QualityProfile {
  /** Each usable substat and what one of its rolls counts for. */
  usable: Partial<Record<SubStatKey, number>>;
  /** Their Energy Recharge minimum, including the base 100%. */
  erMin?: number;
  /** Whether every Energy Recharge roll counts (their damage scales with it). */
  erScales: boolean;
  accepts: Record<CheckedSlot, StatKey[]>;
  element?: Element | 'physical';
  /** The sets their build recommends (one 4-piece, a 2-piece, or 2+2). */
  recommendedSets: string[];
}

const unique = <T>(xs: (T | undefined)[]): T[] => [
  ...new Set(xs.filter((x): x is T => x !== undefined)),
];

/** A character's profile from the curated targets, or null without them. */
export function qualityProfile(characterKey: string): QualityProfile | null {
  const m = META_TARGETS[characterKey];
  if (!m) return null;
  const objective = m.objective as StatKey | string;
  const scaling: StatKey = SCALING_STATS.includes(objective as StatKey)
    ? (objective as StatKey)
    : m.mains.sands && SCALING_STATS.includes(m.mains.sands)
      ? m.mains.sands
      : 'atk_pct';
  const targets = Object.keys(m.statTargets ?? {}) as StatKey[];
  const crit =
    objective === 'crit_value' ||
    objective === 'avg_damage' ||
    targets.some((t) => t === 'crit_rate' || t === 'crit_dmg');
  const erScales = ER_SCALES.has(characterKey);

  const usable: Partial<Record<SubStatKey, number>> = {};
  const addUsable = (k: StatKey) => {
    if (!isSubStatKey(k)) return;
    usable[k] = Math.max(usable[k] ?? 0, 1);
    const flat = FLAT_OF[k];
    if (flat) usable[flat] = Math.max(usable[flat] ?? 0, FLAT_FACTOR);
  };
  addUsable(scaling);
  for (const t of targets) addUsable(TARGET_STAT[t] ?? t);
  for (const k of EXTRA_USABLE[characterKey] ?? []) addUsable(k);
  if (crit) {
    usable.crit_rate = 1;
    usable.crit_dmg = 1;
  }
  if (m.erTarget !== undefined || erScales) usable.er_pct = 1;

  const element = genshinAdapter.character(characterKey)?.element;
  const extra = EXTRA_MAINS[characterKey] ?? {};
  const recommendedSets =
    m.setRequirement.kind === '2+2'
      ? [...m.setRequirement.setKeys]
      : [m.setRequirement.setKey];
  return {
    usable,
    ...(m.erTarget !== undefined && { erMin: m.erTarget }),
    erScales,
    accepts: {
      sands: unique([m.mains.sands, scaling, ...(extra.sands ?? [])]),
      goblet: unique<StatKey>([
        m.mains.goblet,
        element === 'physical' ? 'physical_dmg' : 'elemental_dmg',
        scaling,
        ...(extra.goblet ?? []),
      ]),
      circlet: unique<StatKey>([
        m.mains.circlet,
        ...(crit ? (['crit_rate', 'crit_dmg'] as StatKey[]) : []),
        scaling,
        ...(extra.circlet ?? []),
      ]),
    },
    ...(element && { element }),
    recommendedSets,
  };
}

export interface ArtifactQuality {
  /** Main stat points plus good rolls. */
  total: number;
  main: {
    points: number;
    /** The checked slots, worn or not. */
    slots: { slot: CheckedSlot; mainStat?: StatKey; ok: boolean }[];
  };
  /** Good rolls, in roll-equivalents. */
  rolls: number;
  /** The most good rolls the worn pieces could hold. */
  possible: number;
  /** Good rolls by stat. */
  byStat: Partial<Record<SubStatKey, number>>;
  /** Energy Recharge against the minimum, when the character has one. */
  er?: { min?: number; total: number; short: number; scales: boolean };
}

/** The largest single 5★ roll of a substat. */
const maxRoll = (k: SubStatKey) => SUBSTAT_TIERS_5[k][3];

/** Whether a piece's main stat is one the character accepts in its slot; an
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

/** A character's artifact quality, or null when they have no profile. */
export function artifactQuality(
  characterKey: string,
  entry: { buildLevel?: number; weaponKey?: string } | undefined,
  pieces: readonly Artifact[],
): ArtifactQuality | null {
  const p = qualityProfile(characterKey);
  if (!p) return null;

  const slots = CHECKED_SLOTS.map((slot) => {
    const a = pieces.find((x) => x.slot === slot);
    return a
      ? { slot, mainStat: a.mainStat, ok: accepted(p, a) }
      : { slot, ok: false };
  });
  const mainPoints = slots.filter((s) => s.ok).length * MAIN_STAT_POINTS;

  const byStat: Partial<Record<SubStatKey, number>> = {};
  let erSubs = 0;
  for (const a of pieces)
    for (const s of a.subStats) {
      if (!isSubStatKey(s.key)) continue;
      if (s.key === 'er_pct') {
        erSubs += s.value;
        continue;
      }
      const f = p.usable[s.key];
      if (!f) continue;
      byStat[s.key] = (byStat[s.key] ?? 0) + (s.value / maxRoll(s.key)) * f;
    }

  // Energy Recharge: up to the minimum, or all of it when it scales.
  let er: ArtifactQuality['er'];
  if (p.usable.er_pct) {
    const before = erBeforeSubstats(characterKey, entry, pieces);
    const counted = p.erScales
      ? erSubs
      : Math.min(erSubs, Math.max(0, (p.erMin ?? 0) - before));
    if (counted > 0) byStat.er_pct = counted / maxRoll('er_pct');
    const total = before + erSubs;
    er = {
      ...(p.erMin !== undefined && { min: p.erMin }),
      total,
      short: p.erMin !== undefined ? Math.max(0, p.erMin - total) : 0,
      scales: p.erScales,
    };
  }

  const rolls = Object.values(byStat).reduce((s, v) => s + (v ?? 0), 0);
  return {
    total: mainPoints + rolls,
    main: { points: mainPoints, slots },
    rolls,
    possible: pieces.reduce((s, a) => s + possibleFor(p, a), 0),
    byStat,
    ...(er && { er }),
  };
}

/** Whether a set is one the character's build recommends. */
export function isRecommendedSet(characterKey: string, setKey: string) {
  return (
    qualityProfile(characterKey)?.recommendedSets.includes(setKey) ?? false
  );
}

/** The checked slot a piece is in, if any (for labels). */
export const isCheckedSlot = (s: Slot): s is CheckedSlot =>
  (CHECKED_SLOTS as readonly string[]).includes(s);
