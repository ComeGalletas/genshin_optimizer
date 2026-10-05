/**
 * A gcsim config from our data (TODO 5.5): each character with their level,
 * constellation and talents, weapon, artifact sets and the **summed stat
 * lines of their artifacts**, plus the fight (enemy, energy, duration) and
 * the rotation. Pure; the server runs it.
 *
 * The one place units change (ADR-0023): the engine keeps percent where the
 * game shows percent (crit rate 31.1), gcsim takes fractions (`cr=0.311`).
 * Elemental DMG goes to the goblet's own element (`hydro%`), so an
 * off-element goblet does nothing in gcsim, as in game. gcsim adds the
 * character's base, the weapon and the set bonuses itself, so only the
 * artifacts' lines are passed. Names follow gcsim's at the pinned version
 * (research note 2026-10-05): lowercase without separators.
 * @packageDocumentation
 */

import type { Artifact, StatKey } from '../game/types';

/** Our stat keys in gcsim's names. `elemental_dmg` is per element. */
const GCSIM_STAT: Record<Exclude<StatKey, 'elemental_dmg'>, string> = {
  hp: 'hp',
  hp_pct: 'hp%',
  atk: 'atk',
  atk_pct: 'atk%',
  def: 'def',
  def_pct: 'def%',
  em: 'em',
  er_pct: 'er',
  crit_rate: 'cr',
  crit_dmg: 'cd',
  physical_dmg: 'phys%',
  healing: 'heal',
};

/** Flat stats pass as they are; the rest are percent, passed as fractions. */
const FLAT = new Set<StatKey>(['hp', 'atk', 'def', 'em']);

/** gcsim's names: lowercase, letters and digits only (`raiden_shogun` →
 *  `raidenshogun`, `wolf's_gravestone` → `wolfsgravestone`,
 *  `GoldenTroupe` → `goldentroupe`). */
export const gcsimName = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface SimCharacter {
  /** Dataset key, e.g. `raiden_shogun`. */
  key: string;
  level: number;
  /** The level cap of the character's ascension (90 at full). */
  maxLevel: number;
  constellation: number;
  /** Base talent levels, without constellation bonuses (gcsim adds those). */
  talents: { auto: number; skill: number; burst: number };
  weapon: {
    key: string;
    level: number;
    maxLevel: number;
    refinement: number;
  };
  /** The pieces the character wears in this build (up to 5). */
  artifacts: readonly Artifact[];
}

export interface SimTeam {
  characters: readonly SimCharacter[];
  /** Dataset key of the character on field at the start. */
  active: string;
  /** The action list, in gcsim's syntax, using gcsim names. */
  rotation: string;
  enemy?: { level?: number; /** percent */ res?: number };
  /** Fight length in seconds. */
  duration?: number;
  iterations?: number;
  /** Frames between swaps. */
  swapDelay?: number;
  /** A gcsim `energy` line; particles from the enemy over the fight. */
  energy?: string;
}

/** One build's artifact lines, summed per stat in gcsim's names and units.
 *  Values are rounded to 1e-9 so binary noise never reaches the config. */
export function gcsimStats(artifacts: readonly Artifact[]): [string, number][] {
  const sums = new Map<string, number>();
  const add = (stat: StatKey, value: number, element?: string) => {
    if (stat === 'elemental_dmg' && !element)
      throw new Error('an Elemental DMG goblet needs its element');
    const name = stat === 'elemental_dmg' ? `${element}%` : GCSIM_STAT[stat];
    const v = FLAT.has(stat) ? value : value / 100;
    sums.set(name, (sums.get(name) ?? 0) + v);
  };
  for (const a of artifacts) {
    add(a.mainStat, a.mainStatValue, a.element);
    for (const s of a.subStats) add(s.key, s.value);
  }
  return [...sums].map(([k, v]) => [k, Math.round(v * 1e9) / 1e9]);
}

/** Which artifact sets a build has, and how many pieces of each (2 or more:
 *  fewer do nothing). */
export function gcsimSets(artifacts: readonly Artifact[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const a of artifacts)
    counts.set(a.setKey, (counts.get(a.setKey) ?? 0) + 1);
  return [...counts]
    .filter(([, n]) => n >= 2)
    .map(([k, n]) => [gcsimName(k), n] as [string, number])
    .sort(([a], [b]) => a.localeCompare(b));
}

const num = (x: number) => String(x);

export const DEFAULT_ENERGY = 'energy every interval=480,720 amount=1;';

/** The config text. */
export function gcsimConfig(team: SimTeam): string {
  const lines: string[] = [];
  const opts = [
    `iteration=${team.iterations ?? 1000}`,
    `duration=${team.duration ?? 90}`,
    `swap_delay=${team.swapDelay ?? 12}`,
  ];
  lines.push(`options ${opts.join(' ')};`);
  // No target hp: with one, gcsim fights until the target dies instead of
  // for the duration (TODO 5.3).
  lines.push(
    `target lvl=${team.enemy?.level ?? 100} resist=${num((team.enemy?.res ?? 10) / 100)};`,
  );
  lines.push(team.energy ?? DEFAULT_ENERGY, '');
  for (const c of team.characters) {
    const n = gcsimName(c.key);
    lines.push(
      `${n} char lvl=${c.level}/${c.maxLevel} cons=${c.constellation} talent=${c.talents.auto},${c.talents.skill},${c.talents.burst};`,
      `${n} add weapon="${gcsimName(c.weapon.key)}" refine=${c.weapon.refinement} lvl=${c.weapon.level}/${c.weapon.maxLevel};`,
    );
    for (const [set, count] of gcsimSets(c.artifacts))
      lines.push(`${n} add set="${set}" count=${count};`);
    const stats = gcsimStats(c.artifacts);
    if (stats.length)
      lines.push(
        `${n} add stats ${stats.map(([k, v]) => `${k}=${num(v)}`).join(' ')};`,
      );
    lines.push('');
  }
  lines.push(`active ${gcsimName(team.active)};`, '', team.rotation.trim(), '');
  return lines.join('\n');
}
