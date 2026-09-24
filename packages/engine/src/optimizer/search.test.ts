import { describe, it, expect } from 'vitest';
import { searchBuilds, bruteForce } from './search';
import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
  OptimizeResult,
  SetRequirement,
  Slot,
} from '../game/types';
import { SLOTS } from '../game/types';
import type { DamageProfile } from '../damage/types';

/** Narrow a search result to its feasible variant; fails the test (with a
 *  clear message) instead of a TS error if the search was unexpectedly
 *  infeasible. Every test in this file that inspects `.builds` expects one. */
function expectOk(
  r: OptimizeResult,
): Extract<OptimizeResult, { status: 'ok' }> {
  if (r.status !== 'ok') {
    throw new Error(
      `expected a feasible result, got infeasible (explored=${r.explored}, pruned=${r.pruned})`,
    );
  }
  return r;
}

/** Every returned build's score, in rank order. The oracle comparisons assert
 *  this whole list, not just the winner: `minKeptScore` prunes at the k-th
 *  anti-clone survivor, and ranks 2..K are exact only while the incremental
 *  greedy inside `offer` agrees with a from-scratch run over everything
 *  feasible. Comparing builds[0] alone cannot see that divergence.
 *  `bruteForce` applies the same anti-clone cap over all feasible leaves, so
 *  the two lists are directly comparable. */
function scoresOf(r: Extract<OptimizeResult, { status: 'ok' }>): number[] {
  return r.builds.map((b) => b.score);
}

/** scoresOf equality for float-valued objectives (avg_damage). */
function expectScoresClose(a: number[], b: number[], digits = 6): void {
  expect(a).toHaveLength(b.length);
  a.forEach((s, i) => expect(s).toBeCloseTo(b[i], digits));
}

const ctx: OptimizeContext = {
  base: { crit_rate: 5, crit_dmg: 50 },
  setBonuses: {},
};

let counter = 0;
function mk(slot: Slot, cr = 0, cd = 0, setKey = 'A'): Artifact {
  return {
    id: `id${counter++}`,
    setKey,
    slot,
    rarity: 5,
    level: 20,
    mainStat: 'crit_rate',
    mainStatValue: cr,
    subStats: cd ? [{ key: 'crit_dmg', value: cd }] : [],
  };
}

function inventory(perSlot: number): Artifact[] {
  const arr: Artifact[] = [];
  for (const slot of SLOTS)
    for (let i = 0; i < perSlot; i++) arr.push(mk(slot, i, i * 2));
  return arr;
}

const req: OptimizeRequest = {
  characterKey: 'c',
  weaponKey: 'w',
  buildLevel: 90,
  constraints: {},
  objective: 'crit_value',
  topK: 5,
};

describe('searchBuilds', () => {
  it('returns NO_FEASIBLE_BUILD when a slot pool is empty', () => {
    const inv = inventory(2).filter((a) => a.slot !== 'circlet');
    const r = searchBuilds(req, inv, ctx);
    expect(r.status).toBe('infeasible');
  });

  it('finds the maximum crit_value build', () => {
    counter = 0;
    const inv = inventory(3);
    const r = expectOk(searchBuilds(req, inv, ctx));
    expect(r.builds.length).toBeGreaterThan(0);
    // best picks the highest cr/cd in every slot: cr main=2 each (5 slots), cd sub=4 each
    // totals: crit_rate = 5 + 5*2 = 15 ; crit_dmg = 50 + 5*4 = 70 ; cv = 15*2 + 70 = 100
    expect(r.builds[0].objectiveValue).toBe((5 + 5 * 2) * 2 + (50 + 5 * 4));
  });

  it('honours a minStats constraint (infeasible)', () => {
    counter = 0;
    const inv = inventory(3);
    const r = searchBuilds(
      { ...req, constraints: { minStats: { crit_dmg: 1000 } } },
      inv,
      ctx,
    );
    expect(r.status).toBe('infeasible');
  });

  it('branch-and-bound matches brute force on small inventories (correctness)', () => {
    for (let seed = 0; seed < 20; seed++) {
      counter = seed * 1000;
      const inv = inventory(3);
      const bnb = expectOk(searchBuilds(req, inv, ctx));
      const bf = expectOk(bruteForce(req, inv, ctx));
      expect(scoresOf(bnb)).toEqual(scoresOf(bf));
    }
  });

  it('matches brute force with set bonuses active (2+2 ceiling admissibility)', () => {
    // Two sets each grant +20 er_pct at 2pc. For an er_pct objective a 2+2 build
    // activates BOTH (+40), which exceeds any single set's bonus. The pruning
    // ceiling must account for this or it could prune the true optimum.
    const ctxSets: OptimizeContext = {
      base: { er_pct: 100 },
      setBonuses: { A: { two: { er_pct: 20 } }, B: { two: { er_pct: 20 } } },
    };
    const reqEr: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: {},
      objective: 'er_pct',
      topK: 5,
    };
    let n = 0;
    const rnd = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
    for (let seed = 0; seed < 30; seed++) {
      n = seed * 7919 + 1;
      let id = 0;
      const inv: Artifact[] = [];
      for (const slot of SLOTS) {
        for (let i = 0; i < 3; i++) {
          const setKey = rnd() % 2 === 0 ? 'A' : 'B';
          const er = rnd() % 15; // er_pct sub 0..14
          inv.push({
            id: `e${id++}`,
            setKey,
            slot,
            rarity: 5,
            level: 20,
            mainStat: 'er_pct',
            mainStatValue: er,
            subStats: [],
          });
        }
      }
      const bnb = expectOk(searchBuilds(reqEr, inv, ctxSets));
      const bf = expectOk(bruteForce(reqEr, inv, ctxSets));
      expect(scoresOf(bnb)).toEqual(scoresOf(bf));
    }
  });

  // The oracle above only ever runs with empty constraints. mainStatLocks,
  // setRequirement, and critRatioTarget are each unit-tested in isolation
  // (score.test.ts) but never through the brute-force oracle — which is the
  // admissibility guarantee ADR-0004 actually leans on. These three extend
  // it to cover those dimensions, asserting .score (not just
  // .objectiveValue) so the penalty-omitted pruning bound is verified too.

  it('branch-and-bound matches brute force with a mainStatLocks constraint (score)', () => {
    let n = 0;
    const rnd = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
    for (let seed = 0; seed < 20; seed++) {
      n = seed * 7919 + 1;
      let id = 0;
      const altStats: Artifact['mainStat'][] = ['atk_pct', 'hp_pct', 'em'];
      const inv: Artifact[] = [];
      for (const slot of SLOTS) {
        for (let i = 0; i < 4; i++) {
          // Force at least one crit_rate candidate per slot (index 0) so the
          // sands lock below is always satisfiable; randomize the rest so the
          // lock genuinely narrows some pools before the bound is computed.
          const locked = i === 0 || rnd() % 2 === 0;
          inv.push({
            id: `ms${id++}`,
            setKey: 'A',
            slot,
            rarity: 5,
            level: 20,
            mainStat: locked ? 'crit_rate' : altStats[rnd() % altStats.length],
            mainStatValue: rnd() % 50,
            subStats: rnd() % 3 ? [{ key: 'crit_dmg', value: rnd() % 20 }] : [],
          });
        }
      }
      const reqLocked: OptimizeRequest = {
        ...req,
        constraints: { mainStatLocks: { sands: 'crit_rate' } },
      };
      const bnb = expectOk(searchBuilds(reqLocked, inv, ctx));
      const bf = expectOk(bruteForce(reqLocked, inv, ctx));
      expect(scoresOf(bnb)).toEqual(scoresOf(bf));
    }
  });

  it('branch-and-bound matches brute force with a 4pc setRequirement constraint (score)', () => {
    let n = 0;
    const rnd = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
    for (let seed = 0; seed < 20; seed++) {
      n = seed * 7919 + 1;
      let id = 0;
      const inv: Artifact[] = [];
      for (const slot of SLOTS) {
        for (let i = 0; i < 4; i++) {
          // Guarantee a Target piece in every slot (index 0) so the 4pc
          // requirement is always reachable; the rest are split across two
          // other sets, so satisfies() genuinely rejects many leaves.
          const setKey =
            i === 0 ? 'Target' : rnd() % 2 === 0 ? 'Other1' : 'Other2';
          inv.push({
            id: `sr${id++}`,
            setKey,
            slot,
            rarity: 5,
            level: 20,
            mainStat: 'crit_rate',
            mainStatValue: rnd() % 50,
            subStats: rnd() % 3 ? [{ key: 'crit_dmg', value: rnd() % 20 }] : [],
          });
        }
      }
      const reqSet: OptimizeRequest = {
        ...req,
        constraints: { setRequirement: { kind: '4pc', setKey: 'Target' } },
      };
      const bnb = expectOk(searchBuilds(reqSet, inv, ctx));
      const bf = expectOk(bruteForce(reqSet, inv, ctx));
      expect(scoresOf(bnb)).toEqual(scoresOf(bf));
    }
  });

  // 2pc and 2+2 share meetsSetRequirement's count-based check (score.ts) with
  // 4pc, but not the pruning bounds: setCeilingVector branches on the
  // requirement kind into three separate ceilings, and only 2+2 arms the
  // second-set feasibility bound (remainingB). 4pc is therefore not
  // representative — each kind needs its own oracle run, with a minStats floor
  // so setCeilingVector's result is actually load-bearing.

  /** Three sets in every slot, each with a scorable bonus, so a requirement of
   *  any kind is satisfiable and the set-bonus ceilings genuinely bind. */
  const ctxSetReq: OptimizeContext = {
    base: { crit_rate: 5, crit_dmg: 50 },
    setBonuses: {
      A: { two: { crit_rate: 10 }, four: { crit_dmg: 40 } },
      B: { two: { crit_dmg: 30 } },
      C: { two: { crit_rate: 8 } },
    },
  };

  function setInventory(seed: number): Artifact[] {
    let n = seed * 7919 + 1;
    const rnd = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
    const keys = ['A', 'B', 'C', 'A'];
    const inv: Artifact[] = [];
    let id = 0;
    for (const slot of SLOTS)
      for (let i = 0; i < keys.length; i++)
        inv.push({
          id: `sq${seed}-${id++}`,
          setKey: keys[i],
          slot,
          rarity: 5,
          level: 20,
          mainStat: 'crit_rate',
          mainStatValue: rnd() % 50,
          subStats: rnd() % 3 ? [{ key: 'crit_dmg', value: rnd() % 20 }] : [],
        });
    return inv;
  }

  const setReqCases: [string, SetRequirement][] = [
    ['2pc', { kind: '2pc', setKey: 'A' }],
    ['2+2', { kind: '2+2', setKeys: ['B', 'C'] }],
    // ['A','A'] collapses to "≥2 of A", which a five-piece build can satisfy
    // while also activating A's 4pc. A ceiling that just summed A's 2pc twice
    // missed that 4pc entirely and reported feasible builds as infeasible.
    ['2+2 naming the same set twice', { kind: '2+2', setKeys: ['A', 'A'] }],
  ];

  it.each(setReqCases)(
    'branch-and-bound matches brute force with a %s setRequirement (full top-K)',
    (_label, setRequirement) => {
      let feasibleSeeds = 0;
      for (let seed = 0; seed < 20; seed++) {
        const inv = setInventory(seed);
        const reqSet: OptimizeRequest = {
          ...req,
          constraints: { setRequirement, minStats: { crit_dmg: 110 } },
        };
        const bnb = searchBuilds(reqSet, inv, ctxSetReq);
        const bf = bruteForce(reqSet, inv, ctxSetReq);
        expect(bnb.status).toBe(bf.status);
        if (bnb.status === 'ok' && bf.status === 'ok') {
          expect(scoresOf(bnb)).toEqual(scoresOf(bf));
          feasibleSeeds++;
        }
      }
      // An all-infeasible run would pass vacuously — that is exactly the bug
      // the inadmissible ceilings produced.
      expect(feasibleSeeds).toBeGreaterThan(0);
    },
  );

  it('prunes a sparse 4pc setRequirement without exploring the full pool (regression)', () => {
    // Regression for a real-account perf cliff: a setRequirement used to be
    // checked only at the leaf (satisfies()), so on an inventory spanning many
    // sets almost every branch was explored to full depth just to be
    // rejected. 15 artifacts/slot = 15^5 = 759,375 raw combinations; only 2
    // per slot match the required set, so a leaf-only check would explore a
    // large fraction of that. The feasibility bound (suffixSetPotential) must
    // keep explored+pruned far below the raw pool size.
    let n = 0;
    const rnd = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
    let id = 0;
    const inv: Artifact[] = [];
    for (const slot of SLOTS) {
      for (let i = 0; i < 15; i++) {
        const setKey = i < 2 ? 'Target' : `Other${i % 5}`;
        inv.push({
          id: `sparse${id++}`,
          setKey,
          slot,
          rarity: 5,
          level: 20,
          mainStat: 'crit_rate',
          mainStatValue: rnd() % 50,
          subStats: rnd() % 3 ? [{ key: 'crit_dmg', value: rnd() % 20 }] : [],
        });
      }
    }
    const reqSet: OptimizeRequest = {
      ...req,
      constraints: { setRequirement: { kind: '4pc', setKey: 'Target' } },
    };
    const r = expectOk(searchBuilds(reqSet, inv, ctx));
    expect(r.explored + r.pruned).toBeLessThan(50_000); // << 15^5 = 759,375
  });

  it('prunes an unconstrained search despite a scorable 2pc set bonus (regression)', () => {
    // Regression for a real-account perf cliff: the set-bonus ceiling used to
    // be one flat constant computed once up front, added to every branch's
    // bound regardless of whether that branch could still reach the bonus's
    // 2pc/4pc threshold. On an inventory where the bonus-granting set is rare,
    // that slack alone kept nearly every branch "unprunable" until the leaf.
    // No setRequirement here — this is the default "Optimise" click.
    const ctxWithBonus: OptimizeContext = {
      base: { crit_rate: 5, crit_dmg: 50 },
      setBonuses: { Bonus: { two: { crit_rate: 12 } } },
    };
    let n = 0;
    const rnd = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
    let id = 0;
    const inv: Artifact[] = [];
    for (const slot of SLOTS) {
      for (let i = 0; i < 15; i++) {
        const setKey = i < 2 ? 'Bonus' : `Other${i % 5}`;
        inv.push({
          id: `bonus${id++}`,
          setKey,
          slot,
          rarity: 5,
          level: 20,
          mainStat: 'crit_rate',
          mainStatValue: rnd() % 50,
          subStats: rnd() % 3 ? [{ key: 'crit_dmg', value: rnd() % 20 }] : [],
        });
      }
    }
    const r = expectOk(searchBuilds(req, inv, ctxWithBonus));
    expect(r.explored + r.pruned).toBeLessThan(50_000); // << 15^5 = 759,375
  });

  it('branch-and-bound matches brute force with a critRatioTarget tiebreak (score)', () => {
    for (let seed = 0; seed < 20; seed++) {
      counter = seed * 1000;
      const inv = inventory(3);
      const reqRatio: OptimizeRequest = {
        ...req,
        constraints: { critRatioTarget: 1 / 3 }, // conventional 1:2 CR:CD
      };
      const bnb = expectOk(searchBuilds(reqRatio, inv, ctx));
      const bf = expectOk(bruteForce(reqRatio, inv, ctx));
      expect(scoresOf(bnb)).toEqual(scoresOf(bf));
    }
  });

  it('applies an anti-clone cap so top results are not all identical cores', () => {
    counter = 0;
    const inv = inventory(4);
    const r = expectOk(searchBuilds({ ...req, topK: 5 }, inv, ctx));
    const cores = r.builds.map((b) =>
      SLOTS.slice(0, 4)
        .map((s) => b.artifactIds[s])
        .join(','),
    );
    expect(new Set(cores).size).toBeGreaterThan(1);
  });

  it('emits explored/pruned counts and per-build diagnostics', () => {
    counter = 0;
    const inv = inventory(3);
    const r = expectOk(searchBuilds(req, inv, ctx));
    expect(r.explored).toBeGreaterThan(0);
    expect(r.builds[0].diagnostics.marginalBySlot).toBeTruthy();
    expect(typeof r.builds[0].diagnostics.explored).toBe('number');
  });

  it('returns NO_FEASIBLE_BUILD for a fully empty inventory', () => {
    const r = searchBuilds(req, [], ctx);
    expect(r.status).toBe('infeasible');
  });

  it('defaults topK to 10 when the request omits it', () => {
    counter = 0;
    const { topK: _omit, ...noK } = req; // eslint-disable-line @typescript-eslint/no-unused-vars
    const r = expectOk(searchBuilds(noK as OptimizeRequest, inventory(3), ctx));
    expect(r.builds.length).toBeGreaterThan(0);
    expect(r.builds.length).toBeLessThanOrEqual(10);
  });

  it('stays exact when the kept list is truncated hard (topK=1)', () => {
    counter = 0;
    const inv = inventory(3); // 3^5 = 243 feasible leaves, all but 1 discarded
    const bnb = expectOk(searchBuilds({ ...req, topK: 1 }, inv, ctx));
    const bf = expectOk(bruteForce({ ...req, topK: 1 }, inv, ctx));
    expect(scoresOf(bnb)).toEqual(scoresOf(bf));
  });

  it('throws on a non-finite scalar contribution instead of pruning silently', () => {
    // A NaN contribution makes every `upper <= threshold` comparison false, so
    // the bound stops pruning and stops being meaningful; Infinity prunes
    // everything. A corrupt inventory must fail loudly, not return a
    // confident-looking wrong answer.
    counter = 0;
    const inv = inventory(3);
    inv[0] = { ...inv[0], mainStatValue: Number.NaN };
    expect(() => searchBuilds(req, inv, ctx)).toThrow(/non-finite/);
  });

  it('drops exact-duplicate builds via the seenExact guard', () => {
    // Two artifacts sharing an id in one slot make two recursion paths produce
    // the identical 5-slot id tuple; seenExact must keep only the first.
    const mkId = (slot: Slot, id: string): Artifact => ({
      id,
      setKey: 'A',
      slot,
      rarity: 5,
      level: 20,
      mainStat: 'crit_rate',
      mainStatValue: 1,
      subStats: [],
    });
    const inv: Artifact[] = SLOTS.map((s) => mkId(s, `${s}-0`));
    inv.push(mkId('flower', 'flower-0')); // duplicate id in the flower slot
    const r = expectOk(searchBuilds({ ...req, topK: 5 }, inv, ctx));
    const tuples = r.builds.map((b) =>
      SLOTS.map((s) => b.artifactIds[s]).join(','),
    );
    expect(new Set(tuples).size).toBe(tuples.length); // no exact duplicates returned
    expect(r.builds).toHaveLength(1); // the two identical-id paths collapse to one
  });
});

describe('searchBuilds with the avg_damage objective', () => {
  const profile: DamageProfile = {
    characterKey: 'test',
    source: 'https://example.test/',
    hits: [
      {
        name: 'skill',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 250,
        bonus: 'elemental',
        reaction: 'vaporize-2x',
        weight: 1,
      },
      {
        name: 'burst',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 400,
        bonus: 'elemental',
        reaction: 'none',
        weight: 0.5,
      },
    ],
  };
  const dmgCtx: OptimizeContext = {
    base: { atk: 900, crit_rate: 5, crit_dmg: 50, er_pct: 100 },
    setBonuses: {
      // Non-empty `four` on both sets: the vector bound folds the set-bonus
      // ceiling into the optimistic stat vector, so a 4pc that only lights up
      // at the leaf is exactly the case that could make it inadmissible
      // (ADR-0020 routes every curated 4pc through this same channel).
      SetA: { two: { atk_pct: 18 }, four: { crit_dmg: 40 } },
      SetB: { two: { elemental_dmg: 15 }, four: { elemental_dmg: 25 } },
    },
    damage: { profile, enemy: { level: 100, res: 0.1 }, charLevel: 90 },
  };
  const dmgReq: OptimizeRequest = {
    characterKey: 'x',
    weaponKey: 'w',
    buildLevel: 90,
    constraints: {},
    objective: 'avg_damage',
    topK: 1,
  };

  /** Deterministic mixed-stat inventory — the same LCG idiom the oracle tests
   *  above use, but rolling every damage-relevant stat so the vector bound is
   *  exercised on all of its components. */
  function randomInventory(seed: number, perSlot: number): Artifact[] {
    let n = seed * 7919 + 1;
    const rnd = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
    const mains = [
      'atk',
      'atk_pct',
      'crit_rate',
      'crit_dmg',
      'elemental_dmg',
      'em',
    ] as const;
    const subs = [
      'atk',
      'atk_pct',
      'crit_rate',
      'crit_dmg',
      'em',
      'er_pct',
    ] as const;
    const inv: Artifact[] = [];
    let id = 0;
    for (const slot of SLOTS) {
      for (let i = 0; i < perSlot; i++) {
        const main = mains[rnd() % mains.length];
        inv.push({
          id: `d${seed}-${id++}`,
          setKey: rnd() % 2 === 0 ? 'SetA' : 'SetB',
          slot,
          rarity: 5,
          level: 20,
          mainStat: main,
          mainStatValue: 5 + (rnd() % 40),
          subStats: [
            { key: subs[rnd() % subs.length], value: 1 + (rnd() % 20) },
            { key: subs[rnd() % subs.length], value: 1 + (rnd() % 20) },
          ].filter(
            (s, i, a) =>
              a.findIndex((x) => x.key === s.key) === i && s.key !== main,
          ),
        });
      }
    }
    return inv;
  }

  it('avg_damage: branch-and-bound matches brute force on randomized inventories', () => {
    let totalPruned = 0;
    for (let seed = 0; seed < 20; seed++) {
      const inv = randomInventory(seed, 6);
      const fast = expectOk(searchBuilds(dmgReq, inv, dmgCtx));
      const slow = expectOk(bruteForce(dmgReq, inv, dmgCtx));
      expectScoresClose(scoresOf(fast), scoresOf(slow));
      totalPruned += fast.pruned;
    }
    // The bound has to actually engage — an unpruned exhaustive walk would
    // also match brute force, which is not what ADR-0004 promises.
    expect(totalPruned).toBeGreaterThan(0);
  });

  it('avg_damage honours constraints (ER floor + 4pc) exactly', () => {
    const constrained: OptimizeRequest = {
      ...dmgReq,
      constraints: {
        minStats: { er_pct: 110 },
        setRequirement: { kind: '4pc', setKey: 'SetA' },
      },
    };
    let checked = 0;
    for (let seed = 0; seed < 20; seed++) {
      const inv = randomInventory(seed, 6);
      const fast = searchBuilds(constrained, inv, dmgCtx);
      const slow = bruteForce(constrained, inv, dmgCtx);
      expect(fast.status).toBe(slow.status);
      if (fast.status === 'ok' && slow.status === 'ok') {
        expectScoresClose(scoresOf(fast), scoresOf(slow));
        for (const b of fast.builds) {
          expect(b.totals.er_pct ?? 0).toBeGreaterThanOrEqual(110);
          const ids = SLOTS.map((s) => b.artifactIds[s]);
          const setA = ids.filter(
            (id) => inv.find((a) => a.id === id)!.setKey === 'SetA',
          );
          expect(setA.length).toBeGreaterThanOrEqual(4);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
