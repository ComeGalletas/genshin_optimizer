import type { Artifact, Slot, StatKey, SubStat } from '../game/types';
import { SLOTS } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { mulberry32 } from '../optimizer/benchmark';

// Featured sets present in the snapshot. GladiatorsFinale appears in every slot
// so Navia's 4pc is always formable; the rest add realism and anti-clone variety.
const FEATURED_SETS = [
  'GladiatorsFinale',
  'GildedDreams',
  'EmblemOfSeveredFate',
  'CrimsonWitchOfFlames',
  'HuskOfOpulentDreams',
];

// Slot-legal main stats we populate so presets + the optimiser have real choices.
// Same name as the table in src/optimizer/benchmark.ts and deliberately not the
// same contents: that one is the full in-game pool, this one is the curated
// subset the sample inventory ships.
const MAIN_BY_SLOT: Record<Slot, StatKey[]> = {
  flower: ['hp'],
  plume: ['atk'],
  sands: ['er_pct', 'em', 'atk_pct', 'hp_pct'],
  goblet: ['elemental_dmg', 'em', 'atk_pct', 'hp_pct'],
  circlet: ['crit_rate', 'crit_dmg', 'atk_pct', 'em'],
};

// Crit-first substat priority. The first two entries are load-bearing: every
// piece that can carry crit_rate and crit_dmg does, so the objective
// (crit_value) actually discriminates between pieces and the preset results
// don't come back as a wall of ties.
const SUB_PRIORITY: StatKey[] = [
  'crit_rate',
  'crit_dmg',
  'er_pct',
  'em',
  'atk_pct',
  'hp_pct',
];

// Per-substat [min, max] for the *accumulated* value on one +20 piece (i.e. a
// few rolls' worth), not a single roll. Ranges rather than the one fixed value
// this table used to hold: with a fixed value every piece of a given main stat
// was interchangeable, every preset returned a wall of exactly-tied builds, and
// the results list read as a rendering bug.
//
// Two ranges are deliberately narrow rather than realistic:
//  · er_pct stays high enough that an ER sands plus ~3 ER substats still clears
//    Furina's 200% floor from the 100% base — the preset must stay feasible.
//  · em stays low (one weak roll) so Nahida's 550 EM floor is NOT reachable
//    from substats alone (base ~380 + 5 low rolls < 550), which is what forces
//    an EM sands/goblet main and makes that preset demonstrate anything.
const SUB_RANGE: Partial<Record<StatKey, [number, number]>> = {
  crit_rate: [3.9, 7.8],
  crit_dmg: [7.8, 15.5],
  er_pct: [13.0, 19.4],
  em: [14, 19],
  atk_pct: [7.0, 11.7],
  hp_pct: [7.0, 11.7],
};

/** Fixed seed: the sample bag is a demo, and a demo whose numbers move between
 *  reloads can't be screenshotted, cited, or regression-tested. Distinct from
 *  benchmark.ts's DEFAULT_SEED so the two datasets can't be confused. */
const SAMPLE_SEED = 20260821;

const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Three or four distinct substats, never equal to the main, crit-leaning.
 *
 * Substat magnitudes are drawn independently of `level` — a +16 piece here can
 * carry a +20 piece's roll spread. Known simplification: the bag exists to give
 * the optimiser distinguishable choices, and modelling roll counts per level
 * would buy realism the demo never shows.
 */
function subsFor(main: StatKey, rng: () => number): SubStat[] {
  const pool = SUB_PRIORITY.filter((s) => s !== main);
  const count = rng() < 0.35 ? 3 : 4;
  return pool.slice(0, count).map((key) => {
    const [lo, hi] = SUB_RANGE[key] ?? [0, 0];
    return { key, value: round1(lo + rng() * (hi - lo)) };
  });
}

function build(): Artifact[] {
  const rng = mulberry32(SAMPLE_SEED);
  const inv: Artifact[] = [];
  let n = 0;
  for (const setKey of FEATURED_SETS) {
    for (const slot of SLOTS) {
      for (const mainStat of MAIN_BY_SLOT[slot]) {
        // Sets and slot main stats stay a fixed grid — every preset's intended
        // build has to remain formable, so only the substats, the level and the
        // substat count vary. A bag that randomised main stats could drop the
        // one elemental_dmg goblet a preset locks to.
        const level = rng() < 0.3 ? 16 : 20;
        inv.push({
          id: `sample-${n++}`,
          setKey,
          slot,
          rarity: 5,
          level,
          mainStat,
          mainStatValue: genshinAdapter.mainStatValue(mainStat, 5, level),
          subStats: subsFor(mainStat, rng),
        });
      }
    }
  }
  return inv;
}

/** Deterministic curated sample inventory (~70 pieces), built once at import. */
export const SAMPLE_INVENTORY: Artifact[] = build();
