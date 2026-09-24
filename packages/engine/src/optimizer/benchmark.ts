import type {
  Artifact,
  Objective,
  OptimizeRequest,
  Slot,
  StatKey,
  SubStat,
} from '../game/types';
import { SLOTS } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { buildContext } from './context';
import { searchBuilds } from './search';

/** Shared "N× fewer evaluations" formatting — used by the doc-generating
 *  benchmark script (scripts/benchmark.ts) so the concept reads consistently
 *  wherever that script reports it. */
export function formatReduction(r: number): string {
  if (r < 1) return `${r.toFixed(2)}×`;
  if (r < 10) return `${r.toFixed(1)}×`;
  return `${Math.round(r).toLocaleString('en-US')}×`;
}

/** Deterministic PRNG so committed benchmark numbers reproduce anywhere.
 *  Exported because the curated sample bag (src/sample/sampleInventory.ts)
 *  needs the same reproducibility guarantee — one generator, so "deterministic"
 *  means the same thing in both places. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The full in-game main-stat pool per slot. Same name as the table in
 *  src/sample/sampleInventory.ts and deliberately not the same contents: that
 *  one is a curated subset, this one is exhaustive. */
const MAIN_BY_SLOT: Record<Slot, StatKey[]> = {
  flower: ['hp'],
  plume: ['atk'],
  sands: ['hp_pct', 'atk_pct', 'def_pct', 'em', 'er_pct'],
  goblet: [
    'hp_pct',
    'atk_pct',
    'def_pct',
    'em',
    'elemental_dmg',
    'physical_dmg',
  ],
  circlet: [
    'hp_pct',
    'atk_pct',
    'def_pct',
    'em',
    'crit_rate',
    'crit_dmg',
    'healing',
  ],
};

const SUBSTAT_POOL: StatKey[] = [
  'hp',
  'atk',
  'def',
  'hp_pct',
  'atk_pct',
  'def_pct',
  'em',
  'er_pct',
  'crit_rate',
  'crit_dmg',
];

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Plausible single-artifact substat magnitudes; realism affects which build wins, not whether the benchmark runs. */
function subValue(stat: StatKey, rng: () => number): number {
  switch (stat) {
    case 'crit_rate':
      return round1(2 + rng() * 6);
    case 'crit_dmg':
      return round1(5 + rng() * 14);
    case 'em':
      return round1(16 + rng() * 40);
    case 'er_pct':
    case 'hp_pct':
    case 'atk_pct':
    case 'def_pct':
      return round1(4 + rng() * 10);
    case 'hp':
      return Math.round(200 + rng() * 1000);
    case 'atk':
      return Math.round(14 + rng() * 80);
    case 'def':
      return Math.round(16 + rng() * 90);
    default:
      return round1(rng() * 10);
  }
}

function pickSubstats(main: StatKey, rng: () => number): SubStat[] {
  const pool = SUBSTAT_POOL.filter((s) => s !== main);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 4).map((key) => ({ key, value: subValue(key, rng) }));
}

/** Spread `size` artifacts as evenly as possible across the five slots. */
function distribute(size: number): number[] {
  const base = Math.floor(size / SLOTS.length);
  const rem = size % SLOTS.length;
  return SLOTS.map((_, i) => base + (i < rem ? 1 : 0));
}

/** Seeded, realistic synthetic inventory (real sets, slot-legal mains, 4 substats). */
export function makeInventory(size: number, seed: number): Artifact[] {
  const rng = mulberry32(seed);
  const sets = genshinAdapter.sets();
  if (sets.length === 0)
    throw new Error('benchmark: genshinAdapter returned no artifact sets');
  const counts = distribute(size);
  const inv: Artifact[] = [];
  let seq = 0;
  SLOTS.forEach((slot, si) => {
    for (let i = 0; i < counts[si]; i++) {
      const set = sets[Math.floor(rng() * sets.length)];
      const mainPool = MAIN_BY_SLOT[slot];
      const mainStat = mainPool[Math.floor(rng() * mainPool.length)];
      inv.push({
        id: `bench-${seq++}`,
        setKey: set.key,
        slot,
        rarity: 5,
        level: 20,
        mainStat,
        mainStatValue: genshinAdapter.mainStatValue(mainStat, 5, 20),
        subStats: pickSubstats(mainStat, rng),
      });
    }
  });
  return inv;
}

export interface Scenario {
  label: string;
  objective: Objective;
}

export interface BenchRow {
  size: number;
  scenario: string;
  naive: number;
  explored: number;
  pruned: number;
  reductionFactor: number;
  ms: number;
}

/** Fixed seed so the committed report's deterministic columns reproduce. */
export const DEFAULT_SEED = 20260609;

// Each slot always has >=1 artifact when built via makeInventory(size>=5), so
// the product is never 0; searchBuilds() guards the empty-slot case independently.
export function naiveCount(inv: Artifact[]): number {
  return SLOTS.map((s) => inv.filter((a) => a.slot === s).length).reduce(
    (p, n) => p * n,
    1,
  );
}

/**
 * Times `searchBuilds()` across inventory sizes and objective scenarios.
 * `naive`/`explored`/`pruned`/`reductionFactor` are deterministic for a seed;
 * `ms` is the median of 3 runs and varies by machine.
 */
export function runBenchmark(
  sizes: number[],
  scenarios: Scenario[],
  seed: number = DEFAULT_SEED,
): BenchRow[] {
  const characterKey = genshinAdapter.characters()[0].key;
  const weaponKey = genshinAdapter.weapons()[0].key;
  const rows: BenchRow[] = [];
  for (const size of sizes) {
    const inv = makeInventory(size, seed);
    const naive = naiveCount(inv);
    for (const sc of scenarios) {
      const req: OptimizeRequest = {
        characterKey,
        weaponKey,
        buildLevel: 90,
        constraints: {},
        objective: sc.objective,
        topK: 10,
      };
      const ctx = buildContext(req);
      const times: number[] = [];
      let explored = 0;
      let pruned = 0;
      for (let run = 0; run < 3; run++) {
        const t0 = performance.now();
        const res = searchBuilds(req, inv, ctx);
        times.push(performance.now() - t0);
        explored = res.explored;
        pruned = res.pruned;
      }
      times.sort((a, b) => a - b);
      rows.push({
        size,
        scenario: sc.label,
        naive,
        explored,
        pruned,
        reductionFactor: explored > 0 ? naive / explored : 0,
        ms: times[1],
      });
    }
  }
  return rows;
}
