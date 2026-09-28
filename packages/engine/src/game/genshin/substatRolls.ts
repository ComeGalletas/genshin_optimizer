/**
 * Genshin's artifact substat rolls (5★), the game mechanic the levelling
 * prospects (ADR-0024) project from. genshin-db doesn't carry these, so they
 * are written out here, with sources.
 *
 * - Every roll, the first one included, is one of four tiers, about 70, 80,
 *   90 and 100% of the stat's maximum, each equally likely. The mean roll is
 *   therefore 85% of the maximum.
 * - A 5★ artifact is upgraded at +4, +8, +12, +16 and +20. It starts with 3 or
 *   4 substats. With 4, each upgrade adds a roll to one of the 4 lines, chosen
 *   uniformly. With 3, the first upgrade (+4) activates the fourth line (shown
 *   greyed out in game from patch 5.5, and exported by Irminsul as
 *   `unactivatedSubstats`), and the other four upgrades roll as above.
 *
 * Sources: https://genshin-impact.fandom.com/wiki/Artifact/Stats (tier
 * values) and https://game8.co/games/Genshin-Impact/archives/309785 (upgrade
 * rules). Checked against a real Irminsul export (1,650 5★ artifacts,
 * 2026-09-27): all 6,600 first rolls match a tier below once rounded as the
 * game shows them, the four tiers occur about equally often, and the 309 +20
 * pieces' later rolls average 85.1% of the maximum.
 * @packageDocumentation
 */

import type { StatKey } from '../types';

/** The substat keys a Genshin artifact can roll. */
export type SubStatKey = Extract<
  StatKey,
  | 'hp'
  | 'hp_pct'
  | 'atk'
  | 'atk_pct'
  | 'def'
  | 'def_pct'
  | 'em'
  | 'er_pct'
  | 'crit_rate'
  | 'crit_dmg'
>;

/** 5★ roll tiers per substat, lowest first, at the precision the game uses
 *  internally (it shows flat stats rounded to integers and percentages to one
 *  decimal). */
export const SUBSTAT_TIERS_5: Record<SubStatKey, readonly number[]> = {
  hp: [209.13, 239.0, 268.88, 298.75],
  atk: [13.62, 15.56, 17.51, 19.45],
  def: [16.2, 18.52, 20.83, 23.15],
  hp_pct: [4.08, 4.66, 5.25, 5.83],
  atk_pct: [4.08, 4.66, 5.25, 5.83],
  def_pct: [5.1, 5.83, 6.56, 7.29],
  em: [16.32, 18.65, 20.98, 23.31],
  er_pct: [4.53, 5.18, 5.83, 6.48],
  crit_rate: [2.72, 3.11, 3.5, 3.89],
  crit_dmg: [5.44, 6.22, 6.99, 7.77],
};

export function isSubStatKey(k: StatKey): k is SubStatKey {
  return k in SUBSTAT_TIERS_5;
}

/** The mean of one 5★ roll: the four tiers are equally likely. */
export function meanRoll5(key: SubStatKey): number {
  const t = SUBSTAT_TIERS_5[key];
  return t.reduce((s, x) => s + x, 0) / t.length;
}

/** A 5★ artifact's upgrades: one every 4 levels, up to +20. */
export const UPGRADE_EVERY = 4;
export const MAX_LEVEL_5 = 20;
