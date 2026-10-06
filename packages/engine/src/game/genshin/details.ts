/**
 * Character and weapon details at their exact current state (TODO 9.9,
 * ADR-0055): stats at any level and ascension from the game's growth
 * curves, a weapon's passive at its refinement, talent names and the
 * constellations that raise them. Read from `details.generated.json`,
 * which the dataset build writes from genshin-db and checks, at every
 * level, against genshin-db's own numbers. Loaded when a character window
 * first opens. Pure.
 * @packageDocumentation
 */

import type { StatKey } from '../types';

export type TalentKind = 'auto' | 'skill' | 'burst';

export interface CharacterDetails {
  rarity: number;
  /** HP, ATK and DEF growth curves, by name in `curves.characters`. */
  curve: [string, string, string];
  /** HP, ATK and DEF at level 1. */
  base: [number, number, number];
  /** The ascension stat (percent where the game shows percent). */
  ascStat: StatKey | null;
  /** Per ascension phase: [max level, HP, ATK, DEF, ascension stat]. */
  promotion: [number, number, number, number, number][];
  /** Normal Attack, Elemental Skill and Elemental Burst names. */
  talents: [string, string, string] | null;
  /** The talent C3 and C5 raise by 3, when known. */
  c3: TalentKind | null;
  c5: TalentKind | null;
}

export interface WeaponDetails {
  rarity: number;
  /** Base ATK and substat growth curves, in `curves.weapons`. */
  curve: [string, string | null];
  /** Base ATK and substat at level 1 (the substat in percent, or flat EM). */
  base: [number, number];
  subStat: StatKey | null;
  /** Per ascension phase: [max level, ATK]. */
  promotion: [number, number][];
  /** The passive: its name, its text with {0}, {1}… for the values, and
   *  the values at R1 to R5. */
  passive: { name: string; text: string; values: string[][] } | null;
  description: string;
}

export interface Details {
  genshinDbVersion: string;
  curves: {
    /** Each curve's multiplier at levels 1 to 100, by level − 1 (null
     *  past a weapon's 90). */
    characters: Record<string, (number | null)[]>;
    weapons: Record<string, (number | null)[]>;
  };
  characters: Record<string, CharacterDetails>;
  weapons: Record<string, WeaponDetails>;
}

/** The ascension phase at a level: past a phase's cap it is the next; at
 *  the cap, the export's ascension says which side (genshin-db's rule). */
export function phaseAt(
  caps: readonly number[],
  level: number,
  ascension?: number,
): number {
  for (let i = caps.length - 2; i >= 0; i--) {
    if (level > caps[i]) return i + 1;
    if (level === caps[i])
      return ascension !== undefined && ascension > i ? i + 1 : i;
  }
  return 0;
}

const curveAt = (curve: (number | null)[] | undefined, level: number) =>
  curve?.[level - 1] ?? NaN;

/** A character's base HP, ATK and DEF and ascension stat at a level. */
export function characterStatsAt(
  d: Details,
  c: CharacterDetails,
  level: number,
  ascension?: number,
): { hp: number; atk: number; def: number; asc: number } {
  const phase = phaseAt(
    c.promotion.map((p) => p[0]),
    level,
    ascension,
  );
  const [, hp, atk, def, asc] = c.promotion[phase];
  const curves = d.curves.characters;
  return {
    hp: c.base[0] * curveAt(curves[c.curve[0]], level) + hp,
    atk: c.base[1] * curveAt(curves[c.curve[1]], level) + atk,
    def: c.base[2] * curveAt(curves[c.curve[2]], level) + def,
    asc,
  };
}

/** A weapon's base ATK and substat at a level. */
export function weaponStatsAt(
  d: Details,
  w: WeaponDetails,
  level: number,
  ascension?: number,
): { atk: number; sub: number } {
  const phase = phaseAt(
    w.promotion.map((p) => p[0]),
    level,
    ascension,
  );
  const curves = d.curves.weapons;
  return {
    atk: w.base[0] * curveAt(curves[w.curve[0]], level) + w.promotion[phase][1],
    sub: w.curve[1] ? w.base[1] * curveAt(curves[w.curve[1]], level) : 0,
  };
}

/** A weapon's passive text with its values at a refinement (1–5). */
export function passiveText(w: WeaponDetails, refinement = 1): string | null {
  if (!w.passive) return null;
  const values =
    w.passive.values[Math.min(Math.max(refinement, 1), 5) - 1] ?? [];
  return w.passive.text.replace(/\{(\d+)\}/g, (_, i: string) =>
    String(values[Number(i)] ?? '?'),
  );
}

/** The +3 each talent gets from the constellations a character has. */
export function talentBonus(
  c: CharacterDetails,
  constellation = 0,
): Record<TalentKind, number> {
  const bonus = { auto: 0, skill: 0, burst: 0 };
  if (c.c3 && constellation >= 3) bonus[c.c3] += 3;
  if (c.c5 && constellation >= 5) bonus[c.c5] += 3;
  return bonus;
}

/** The details file, loaded when first asked for. */
export function loadDetails(): Promise<Details> {
  return import('./details.generated.json').then(
    (m) => (m.default ?? m) as unknown as Details,
  );
}
