import { describe, it, expect } from 'vitest';
import {
  totals,
  objectiveValue,
  evaluateObjective,
  satisfies,
  critRatioPenalty,
  countSets,
  addInto,
  critValue,
} from './score';
import type {
  Artifact,
  OptimizeContext,
  OptimizeConstraints,
  StatVec,
} from '../game/types';

const ctx: OptimizeContext = {
  base: { atk: 800, crit_rate: 5, crit_dmg: 50, er_pct: 100 },
  setBonuses: {
    Emblem: { two: { er_pct: 20 }, four: {} },
    Gladiator: { two: { atk_pct: 18 } },
  },
};

const art = (
  slot: Artifact['slot'],
  setKey: string,
  main: [keyof StatVec, number],
  subs: Artifact['subStats'] = [],
): Artifact => ({
  id: `${slot}-${setKey}`,
  setKey,
  slot,
  rarity: 5,
  level: 20,
  mainStat: main[0] as Artifact['mainStat'],
  mainStatValue: main[1],
  subStats: subs,
});

const build: Artifact[] = [
  art('flower', 'Emblem', ['hp', 4780]),
  art('plume', 'Emblem', ['atk', 311]),
  art('sands', 'Emblem', ['atk_pct', 46.6]),
  art('goblet', 'Emblem', ['elemental_dmg', 46.6]),
  art(
    'circlet',
    'Gladiator',
    ['crit_rate', 31.1],
    [{ key: 'crit_dmg', value: 14 }],
  ),
];

describe('countSets', () => {
  it('counts pieces per set', () => {
    expect(countSets(build)).toEqual({ Emblem: 4, Gladiator: 1 });
  });
});

describe('addInto', () => {
  it('adds a vector into an accumulator', () => {
    const acc: StatVec = { atk: 10 };
    addInto(acc, { atk: 5, em: 20 });
    expect(acc).toEqual({ atk: 15, em: 20 });
  });
});

describe('totals', () => {
  it('applies a 2pc bonus only when 2 pieces are present', () => {
    const t = totals(ctx, build);
    expect(t.atk).toBe(800 + 311); // base + plume main
    expect(t.atk_pct).toBe(46.6); // Gladiator only 1pc -> no +18
    expect(t.er_pct).toBe(100 + 20); // Emblem 4pc -> 2pc er bonus applies
    expect(t.crit_dmg).toBe(50 + 14); // base + circlet substat
    expect(t.crit_rate).toBe(5 + 31.1); // base + circlet main
  });

  it('applies the 2pc bonus once two pieces are present', () => {
    const glad2: Artifact[] = [
      art('flower', 'Gladiator', ['hp', 4780]),
      art('plume', 'Gladiator', ['atk', 311]),
      art('sands', 'Emblem', ['atk_pct', 46.6]),
      art('goblet', 'Emblem', ['elemental_dmg', 46.6]),
      art('circlet', 'Emblem', ['crit_rate', 31.1]),
    ];
    const t = totals(ctx, glad2);
    expect(t.atk_pct).toBeCloseTo(46.6 + 18, 5); // Gladiator 2pc -> +18 on top of sands main
    expect(t.er_pct).toBe(100 + 20); // Emblem 3pc -> 2pc bonus applies
  });
});

describe('objectiveValue', () => {
  it('computes crit_value as crit_rate*2 + crit_dmg', () => {
    expect(objectiveValue({ crit_rate: 60, crit_dmg: 120 }, 'crit_value')).toBe(
      240,
    );
  });
  it('reads a plain stat objective', () => {
    expect(objectiveValue({ em: 200 }, 'em')).toBe(200);
    expect(objectiveValue({}, 'em')).toBe(0);
  });
});

describe('critValue', () => {
  it('weights crit rate 2:1 against crit dmg', () => {
    expect(critValue(60, 120)).toBe(240);
    expect(critValue(0, 0)).toBe(0);
  });
});

describe('satisfies', () => {
  const t: StatVec = { er_pct: 150, atk_pct: 46.6 };
  it('passes when minStats are met', () => {
    const c: OptimizeConstraints = { minStats: { er_pct: 120 } };
    expect(satisfies(c, build, t)).toBe(true);
  });
  it('fails when a minStat is unmet', () => {
    const c: OptimizeConstraints = { minStats: { er_pct: 160 } };
    expect(satisfies(c, build, t)).toBe(false);
  });
  it('enforces a 4pc set requirement', () => {
    expect(
      satisfies(
        { setRequirement: { kind: '4pc', setKey: 'Emblem' } },
        build,
        t,
      ),
    ).toBe(true);
    expect(
      satisfies(
        { setRequirement: { kind: '4pc', setKey: 'Gladiator' } },
        build,
        t,
      ),
    ).toBe(false);
  });
  it('enforces a 2+2 set requirement', () => {
    const mixed: Artifact[] = [
      art('flower', 'Emblem', ['hp', 1]),
      art('plume', 'Emblem', ['atk', 1]),
      art('sands', 'Gladiator', ['atk_pct', 1]),
      art('goblet', 'Gladiator', ['elemental_dmg', 1]),
      art('circlet', 'Emblem', ['crit_rate', 1]),
    ];
    expect(
      satisfies(
        { setRequirement: { kind: '2+2', setKeys: ['Emblem', 'Gladiator'] } },
        mixed,
        {},
      ),
    ).toBe(true);
  });
  it('enforces main-stat locks', () => {
    expect(satisfies({ mainStatLocks: { sands: 'atk_pct' } }, build, t)).toBe(
      true,
    );
    expect(satisfies({ mainStatLocks: { sands: 'em' } }, build, t)).toBe(false);
  });
});

describe('critRatioPenalty', () => {
  it('is zero at the target ratio and positive away from it', () => {
    // ratio = crit_rate/(crit_rate+crit_dmg); equal values => ratio=0.5 => penalty=0
    expect(critRatioPenalty({ crit_rate: 100, crit_dmg: 100 }, 0.5)).toBe(0);
    expect(
      critRatioPenalty({ crit_rate: 10, crit_dmg: 200 }, 0.5),
    ).toBeGreaterThan(0);
  });
  it('is zero when target is undefined', () => {
    expect(critRatioPenalty({ crit_rate: 10, crit_dmg: 200 })).toBe(0);
  });
});

describe('evaluateObjective', () => {
  it('routes avg_damage through the target function', () => {
    const dmgCtx: OptimizeContext = {
      base: { atk: 800 },
      setBonuses: {},
      damage: {
        profile: {
          characterKey: 'x',
          source: 't',
          hits: [
            {
              name: 'h',
              kind: 'skill',
              scaling: 'atk',
              multiplier: 100,
              bonus: 'elemental',
              reaction: 'none',
              weight: 1,
            },
          ],
        },
        enemy: { level: 100, res: 0.1 },
        charLevel: 90,
      },
    };
    const t = { atk: 800, crit_rate: 0, crit_dmg: 0 };
    // 800 * 1 * 1 * (190/390) * 0.9
    expect(evaluateObjective(dmgCtx, 'avg_damage', t)).toBeCloseTo(
      800 * (190 / 390) * 0.9,
      3,
    );
    expect(() =>
      evaluateObjective({ base: {}, setBonuses: {} }, 'avg_damage', t),
    ).toThrow();
    expect(
      evaluateObjective(dmgCtx, 'crit_value', { crit_rate: 10, crit_dmg: 20 }),
    ).toBe(40);
  });
});
