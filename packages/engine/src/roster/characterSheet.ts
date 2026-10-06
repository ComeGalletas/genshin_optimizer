/**
 * A character's sheet as it stands (TODO 9.9, ADR-0055): each stat's base,
 * what the equipped artifacts add, what the weapon's substat and the
 * ascension stat add, and the total, at the character's and the weapon's
 * exact levels. The game's own sheet minus the effects it lists apart
 * (weapon passives, 4-piece bonuses, constellations), which are
 * conditional. Pure.
 * @packageDocumentation
 */

import type { Artifact, StatKey, StatVec } from '../game/types';
import { BUILD_LEVELS } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import {
  characterStatsAt,
  weaponStatsAt,
  type Details,
} from '../game/genshin/details';
import { addInto, artifactContribution, countSets } from '../optimizer/score';

/** The stats a sheet shows: the first seven always, the rest when set. */
export const SHEET_STATS = [
  'hp',
  'atk',
  'def',
  'em',
  'crit_rate',
  'crit_dmg',
  'er_pct',
  'healing',
  'elemental_dmg',
  'physical_dmg',
] as const;
export type SheetStat = (typeof SHEET_STATS)[number];
const ALWAYS = 7;

export interface SheetRow {
  stat: SheetStat;
  /** The character's own (HP, ATK, DEF; ATK with the weapon's base ATK),
   *  or the game-wide 5% CRIT Rate, 50% CRIT DMG and 100% ER. */
  base: number;
  /** Main stats, substats and 2-piece bonuses; percent HP, ATK and DEF
   *  already applied to the base. */
  artifacts: number;
  /** The weapon's substat and the ascension stat. */
  other: number;
  total: number;
}

export interface SheetInput {
  characterKey: string;
  /** 1–90; the window shows a character not in the roster at 90. */
  level: number;
  /** 0–6: which side of an ascension cap `level` is on. */
  ascension?: number;
  weaponKey?: string;
  weaponLevel?: number;
  weaponAscension?: number;
  artifacts: readonly Artifact[];
}

export interface CharacterSheet {
  rows: SheetRow[];
  /** The weapon's base ATK and substat at its level, when it is known. */
  weapon: { atk: number; sub: number; subStat: StatKey | null } | null;
}

/** What a stat vector adds to one sheet stat: HP, ATK and DEF with their
 *  percent applied to the base. */
function gain(v: StatVec, stat: SheetStat, base: number): number {
  const pct =
    stat === 'hp'
      ? v.hp_pct
      : stat === 'atk'
        ? v.atk_pct
        : stat === 'def'
          ? v.def_pct
          : undefined;
  return (v[stat] ?? 0) + (base * (pct ?? 0)) / 100;
}

/** The sheet, or null when the details don't know the character (newer
 *  than the snapshot): nothing guessed. */
export function characterSheet(
  d: Details,
  input: SheetInput,
): CharacterSheet | null {
  const c = d.characters[input.characterKey];
  if (!c) return null;
  const char = characterStatsAt(d, c, input.level, input.ascension);

  const w = input.weaponKey ? d.weapons[input.weaponKey] : undefined;
  const weaponAt = w
    ? weaponStatsAt(d, w, input.weaponLevel ?? 1, input.weaponAscension)
    : null;

  const base: Record<SheetStat, number> = {
    hp: char.hp,
    atk: char.atk + (weaponAt?.atk ?? 0),
    def: char.def,
    em: 0,
    crit_rate: 5,
    crit_dmg: 50,
    er_pct: 100,
    healing: 0,
    elemental_dmg: 0,
    physical_dmg: 0,
  };

  const fromArtifacts: StatVec = {};
  for (const a of input.artifacts)
    addInto(fromArtifacts, artifactContribution(a));
  const counts = countSets([...input.artifacts]);
  for (const s of genshinAdapter.sets())
    if ((counts[s.key] ?? 0) >= 2 && s.twoPiece)
      addInto(fromArtifacts, s.twoPiece);

  const other: StatVec = {};
  if (c.ascStat) other[c.ascStat] = char.asc;
  if (w?.subStat && weaponAt)
    other[w.subStat] = (other[w.subStat] ?? 0) + weaponAt.sub;

  const rows = SHEET_STATS.map((stat) => {
    const a = gain(fromArtifacts, stat, base[stat]);
    const o = gain(other, stat, base[stat]);
    return {
      stat,
      base: base[stat],
      artifacts: a,
      other: o,
      total: base[stat] + a + o,
    };
  }).filter((r, i) => i < ALWAYS || r.total !== 0);

  return {
    rows,
    weapon:
      w && weaponAt
        ? { atk: weaponAt.atk, sub: weaponAt.sub, subStat: w.subStat }
        : null,
  };
}

/** A character's ascension from the roster's build level, the cap the
 *  import set from it (80 is ascension 5's); undefined without one. */
export function ascensionOf(
  buildLevel: number | undefined,
): number | undefined {
  const i =
    buildLevel === undefined
      ? -1
      : (BUILD_LEVELS.slice(1) as number[]).indexOf(buildLevel);
  return i < 0 ? undefined : i;
}
