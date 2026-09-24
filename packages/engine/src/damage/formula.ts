/**
 * The damage engine (ADR-0016): the KQM damage formula as pure functions, plus
 * the curated per-character damage profiles that turn it into the `avg_damage`
 * optimisation objective.
 * @packageDocumentation
 */

// KQM damage formula, implemented verbatim from the Theorycrafting Library:
// https://library.keqingmains.com/combat-mechanics/damage/damage-formula
//
// Pure functions, no imports beyond types. Deliberately out of scope for v1
// (see ADR-0016): transformative reactions (they don't scale with the build's
// crit, so they can't rank artifacts), DEF shred/ignore, and reaction DMG
// bonus% from sets/weapons.
import type { StatVec } from '../game/types';
import type { DamageContext, DamageHit, Reaction } from './types';

/** Character-level multiplier for additive/transformative reactions, keyed by
 *  the eight BUILD_LEVELS. Transcribed from the KQM TCL player curve
 *  (https://github.com/KQM-git/TCL/blob/master/src/data/elemental_curves/player.json);
 *  checksum: level 90 = 1446.8535. */
const LEVEL_MULT: Record<number, number> = {
  1: 17.165606,
  20: 80.58478,
  40: 207.38205,
  50: 323.6016,
  60: 492.8849,
  70: 765.64026,
  80: 1077.4437,
  90: 1446.8535,
};

const LEVELS = Object.keys(LEVEL_MULT).map(Number);

/** Nearest tabulated level — buildLevel is always a BUILD_LEVEL, so this is an
 *  exact hit in practice. */
function levelMult(charLevel: number): number {
  const nearest = LEVELS.reduce((a, b) =>
    Math.abs(b - charLevel) < Math.abs(a - charLevel) ? b : a,
  );
  return LEVEL_MULT[nearest];
}

// The six helpers below are used internally by `hitFactor`/`sharedFactor`;
// their *exports* exist only so the unit tests can pin each factor of the KQM
// formula against the published one, term by term.

/** Total ATK/HP/DEF: the percentage bonus scales the character+weapon base
 *  only; everything the artifacts add beyond that base is flat. */
export function effectiveStat(
  base: StatVec,
  t: StatVec,
  stat: 'atk' | 'hp' | 'def',
): number {
  const b = base[stat] ?? 0;
  const flat = (t[stat] ?? 0) - b;
  return b * (1 + (t[`${stat}_pct`] ?? 0) / 100) + flat;
}

/** Expected-value crit multiplier (for ranking, not a single roll). */
export function evCritMult(t: StatVec): number {
  const cr = Math.min(Math.max(t.crit_rate ?? 0, 0), 100);
  const cd = Math.max(t.crit_dmg ?? 0, 0);
  return 1 + (cr / 100) * (cd / 100);
}

export function defMult(charLevel: number, enemyLevel: number): number {
  return (charLevel + 100) / (charLevel + 100 + (enemyLevel + 100));
}

export function resMult(res: number): number {
  if (res < 0) return 1 - res / 2;
  if (res < 0.75) return 1 - res;
  return 1 / (4 * res + 1);
}

const AMP: Partial<Record<Reaction, number>> = {
  'vaporize-2x': 2,
  'melt-2x': 2,
  'vaporize-1.5x': 1.5,
  'melt-1.5x': 1.5,
};

export function ampMult(reaction: Reaction, em: number): number {
  const k = AMP[reaction];
  return k === undefined ? 1 : k * (1 + (2.78 * em) / (1400 + em));
}

const ADDITIVE: Partial<Record<Reaction, number>> = {
  aggravate: 1.15,
  spread: 1.25,
};

export function additiveBase(
  reaction: Reaction,
  em: number,
  charLevel: number,
): number {
  const k = ADDITIVE[reaction];
  return k === undefined
    ? 0
    : k * levelMult(charLevel) * (1 + (5 * em) / (1200 + em));
}

/**
 * The factors shared by every hit in a rotation: expected crit, enemy DEF and
 * enemy RES depend only on the build totals and the enemy, never on the hit.
 * Hoisted so a profile with H hits computes them once instead of H times —
 * this runs at every node of the branch-and-bound search.
 */
function sharedFactor(t: StatVec, dmg: DamageContext): number {
  return (
    evCritMult(t) *
    defMult(dmg.charLevel, dmg.enemy.level) *
    resMult(dmg.enemy.res)
  );
}

/** The part of a hit's damage that actually varies per hit. */
function hitFactor(
  base: StatVec,
  t: StatVec,
  hit: DamageHit,
  dmg: DamageContext,
): number {
  const em = t.em ?? 0;
  const scale = hit.scaling === 'em' ? em : effectiveStat(base, t, hit.scaling);
  const bonus =
    (hit.bonus === 'physical'
      ? (t.physical_dmg ?? 0)
      : (t.elemental_dmg ?? 0)) / 100;
  const baseDmg =
    (hit.multiplier / 100) * scale +
    additiveBase(hit.reaction, em, dmg.charLevel);
  return baseDmg * (1 + bonus) * ampMult(hit.reaction, em);
}

/** One hit's damage in isolation — used only by the formula tests; the search
 *  path goes through `targetFunctionScore`, which hoists the shared factor. */
export function computeHitDamage(
  base: StatVec,
  t: StatVec,
  hit: DamageHit,
  dmg: DamageContext,
): number {
  return hitFactor(base, t, hit, dmg) * sharedFactor(t, dmg);
}

/** Σ weight × hit damage over the profile's hits — the `avg_damage` objective. */
export function targetFunctionScore(
  base: StatVec,
  t: StatVec,
  dmg: DamageContext,
): number {
  let total = 0;
  for (const hit of dmg.profile.hits)
    total += hit.weight * hitFactor(base, t, hit, dmg);
  // The shared factor is a constant multiplier across the sum, so it applies
  // once at the end rather than inside the loop.
  return total * sharedFactor(t, dmg);
}
