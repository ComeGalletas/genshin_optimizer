/**
 * The demo account (TODO 9.4): a made-up roster wearing pieces from the
 * fixed sample bag, for a reader with no account of their own. Two classic
 * teams (Neuvillette with Furina, Kazuha and Charlotte; Raiden National),
 * so every view has something to show; the rest of the bag stays in the
 * inventory for the optimizer to choose from.
 *
 * Deterministic, like the bag: each character takes, slot by slot, the
 * first free piece of their preferred set and main stat, then any piece
 * with that main stat, then any piece; the bag has one flower and one
 * plume a set, so past those a piece of their set is made for the demo
 * (from a fixed seed). Every piece has a `sample-` id,
 * which is how an import knows to replace the demo rather than merge with
 * it. Pure.
 * @packageDocumentation
 */

import type { Artifact, Slot, StatKey } from '../game/types';
import { SLOTS } from '../game/types';
import type { RosterEntry } from '../good/normalize';
import { SAMPLE_INVENTORY } from './sampleInventory';
import { genshinAdapter } from '../game/genshin/adapter';
import { mulberry32, round1 } from '../numbers';

const DEMO_SEED = 20261006;
/** A +20 piece of the member's set for a slot the bag has run out of:
 *  crit-leaning substats, like the bag's. */
function extraPiece(m: DemoMember, slot: Slot, rng: () => number): Artifact {
  const mainStat: StatKey = slot === 'flower' ? 'hp' : 'atk';
  return {
    id: `sample-demo-${m.key}-${slot}`,
    setKey: m.set,
    slot,
    rarity: 5,
    level: 20,
    mainStat,
    mainStatValue: genshinAdapter.mainStatValue(mainStat, 5, 20),
    subStats: [
      { key: 'crit_rate', value: round1(3 + rng() * 7) },
      { key: 'crit_dmg', value: round1(6 + rng() * 14) },
      { key: 'atk_pct', value: round1(4 + rng() * 8) },
      { key: 'er_pct', value: round1(4 + rng() * 8) },
    ],
  };
}

interface DemoMember {
  key: string;
  weaponKey: string;
  weaponRefinement: number;
  constellation: number;
  set: string;
  mains: Partial<Record<Slot, StatKey>>;
}

/** The demo roster, carries first so they get the best pieces. */
export const DEMO_MEMBERS: readonly DemoMember[] = [
  {
    key: 'neuvillette',
    weaponKey: 'tome_of_the_eternal_flow',
    weaponRefinement: 1,
    constellation: 0,
    set: 'GildedDreams',
    mains: { sands: 'hp_pct', goblet: 'elemental_dmg', circlet: 'crit_dmg' },
  },
  {
    key: 'raiden_shogun',
    weaponKey: 'the_catch',
    weaponRefinement: 5,
    constellation: 0,
    set: 'EmblemOfSeveredFate',
    mains: { sands: 'er_pct', goblet: 'atk_pct', circlet: 'crit_rate' },
  },
  {
    key: 'xiangling',
    weaponKey: "dragon's_bane",
    weaponRefinement: 3,
    constellation: 6,
    set: 'EmblemOfSeveredFate',
    mains: { sands: 'em', goblet: 'elemental_dmg', circlet: 'crit_rate' },
  },
  {
    key: 'xingqiu',
    weaponKey: 'sacrificial_sword',
    weaponRefinement: 3,
    constellation: 6,
    set: 'EmblemOfSeveredFate',
    mains: { sands: 'atk_pct', goblet: 'elemental_dmg', circlet: 'crit_dmg' },
  },
  {
    key: 'furina',
    weaponKey: 'favonius_sword',
    weaponRefinement: 2,
    constellation: 0,
    set: 'GladiatorsFinale',
    mains: { sands: 'hp_pct', goblet: 'hp_pct', circlet: 'crit_rate' },
  },
  {
    key: 'kaedehara_kazuha',
    weaponKey: 'favonius_sword',
    weaponRefinement: 3,
    constellation: 0,
    set: 'GildedDreams',
    mains: { sands: 'em', goblet: 'em', circlet: 'em' },
  },
  {
    key: 'bennett',
    weaponKey: 'aquila_favonia',
    weaponRefinement: 1,
    constellation: 5,
    set: 'CrimsonWitchOfFlames',
    mains: { sands: 'er_pct', goblet: 'hp_pct', circlet: 'hp_pct' },
  },
  {
    key: 'charlotte',
    weaponKey: 'favonius_codex',
    weaponRefinement: 2,
    constellation: 2,
    set: 'HuskOfOpulentDreams',
    mains: { sands: 'atk_pct', goblet: 'atk_pct', circlet: 'atk_pct' },
  },
];

/** The demo account: its artifacts (the whole bag, some worn) and roster. */
export function demoAccount(): {
  artifacts: Artifact[];
  roster: Record<string, RosterEntry>;
} {
  const free = new Map(SAMPLE_INVENTORY.map((a) => [a.id, { ...a }]));
  const rng = mulberry32(DEMO_SEED);
  const worn: Artifact[] = [];
  for (const m of DEMO_MEMBERS) {
    for (const slot of SLOTS) {
      const main = m.mains[slot];
      const pieces = [...free.values()].filter((a) => a.slot === slot);
      const pick =
        pieces.find(
          (a) => a.setKey === m.set && (!main || a.mainStat === main),
        ) ??
        pieces.find((a) => !main || a.mainStat === main) ??
        pieces[0];
      // The bag has one flower and one plume a set: past those, a piece
      // of the member's set made for the demo, from a fixed seed.
      const piece = pick ?? extraPiece(m, slot, rng);
      free.delete(piece.id);
      worn.push({ ...piece, location: m.key });
    }
  }
  const roster = Object.fromEntries(
    DEMO_MEMBERS.map((m) => [
      m.key,
      {
        buildLevel: 90,
        level: 90,
        constellation: m.constellation,
        talents: { auto: 9, skill: 9, burst: 9 },
        weaponKey: m.weaponKey,
        weaponLevel: 90,
        weaponRefinement: m.weaponRefinement,
      } satisfies RosterEntry,
    ]),
  );
  return { artifacts: [...worn, ...free.values()], roster };
}
