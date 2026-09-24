import { describe, it, expect } from 'vitest';
import {
  effectiveStat,
  evCritMult,
  defMult,
  resMult,
  ampMult,
  additiveBase,
  computeHitDamage,
} from './formula';
import { DEFAULT_ENEMY, type DamageContext, type DamageHit } from './types';

const base = { atk: 800 };
const t = {
  atk: 1111,
  atk_pct: 46.6,
  crit_rate: 50,
  crit_dmg: 100,
  elemental_dmg: 46.6,
};
const hit: DamageHit = {
  name: 'test',
  kind: 'skill',
  scaling: 'atk',
  multiplier: 200,
  bonus: 'elemental',
  reaction: 'none',
  weight: 1,
};
const dmg: DamageContext = {
  profile: { characterKey: 'x', hits: [hit], source: 'test' },
  enemy: DEFAULT_ENEMY,
  charLevel: 90,
};

describe('formula pieces', () => {
  it('effectiveStat splits base-scaled pct from flat', () => {
    // 800*1.466 + (1111-800) = 1172.8 + 311 = 1483.8
    expect(effectiveStat(base, t, 'atk')).toBeCloseTo(1483.8, 5);
  });
  it('EV crit clamps crit rate at 100', () => {
    expect(evCritMult({ crit_rate: 50, crit_dmg: 100 })).toBeCloseTo(1.5, 10);
    expect(evCritMult({ crit_rate: 120, crit_dmg: 100 })).toBeCloseTo(2.0, 10);
    expect(evCritMult({})).toBeCloseTo(1, 10);
    // crit_dmg is clamped at 0 like crit_rate: a negative one must not make
    // the expected multiplier drop below 1.
    expect(evCritMult({ crit_rate: 50, crit_dmg: -100 })).toBeCloseTo(1, 10);
  });
  it('def multiplier at 90 vs 100', () => {
    expect(defMult(90, 100)).toBeCloseTo(190 / 390, 10);
  });
  it('res multiplier piecewise', () => {
    expect(resMult(-0.2)).toBeCloseTo(1.1, 10);
    expect(resMult(0.1)).toBeCloseTo(0.9, 10);
    expect(resMult(0.8)).toBeCloseTo(1 / 4.2, 10);
  });
  it('amplifying vaporize 2x with 100 EM', () => {
    expect(ampMult('vaporize-2x', 100)).toBeCloseTo(
      2 * (1 + (2.78 * 100) / 1500),
      10,
    );
    expect(ampMult('none', 100)).toBe(1);
    expect(ampMult('aggravate', 100)).toBe(1); // additive, not amplifying
  });
});

describe('levelMult at non-default levels (via additiveBase)', () => {
  // additiveBase = k * levelMult(charLevel) * (1 + 5*em/(1200+em)); em=0
  // collapses the reaction-scaling term to 1, isolating levelMult's lookup.
  it('exact hit at a tabulated level other than the default 90', () => {
    // aggravate k=1.15, levelMult(60) = 492.8849 (tabulated exactly)
    expect(additiveBase('aggravate', 0, 60)).toBeCloseTo(1.15 * 492.8849, 5);
  });
  it('nearest-match between two tabulated entries', () => {
    // 45 is equidistant from 40 and 50; the table lookup keeps the first
    // (lower) candidate found, so it resolves to level 40's entry.
    expect(additiveBase('aggravate', 0, 45)).toBeCloseTo(1.15 * 207.38205, 5);
  });
  it('below the table minimum snaps to level 1', () => {
    expect(additiveBase('aggravate', 0, 0)).toBeCloseTo(1.15 * 17.165606, 5);
  });
  it('above the table maximum snaps to level 90', () => {
    expect(additiveBase('aggravate', 0, 200)).toBeCloseTo(1.15 * 1446.8535, 5);
  });
});

describe('computeHitDamage end-to-end', () => {
  it('no-reaction ATK scaler', () => {
    // 2967.6 * 1.466 * 1.5 * (190/390) * 0.9 = 2861.29…
    expect(computeHitDamage(base, t, hit, dmg)).toBeCloseTo(2861.29, 1);
  });
  it('vaporize-2x multiplies the same hit by the amp factor', () => {
    const v = { ...hit, reaction: 'vaporize-2x' as const };
    const em100 = { ...t, em: 100 };
    const plain = computeHitDamage(base, em100, hit, dmg);
    expect(computeHitDamage(base, em100, v, dmg)).toBeCloseTo(
      plain * 2 * (1 + 278 / 1500),
      3,
    );
  });
  it('aggravate adds level-scaled base damage before multipliers', () => {
    const a = { ...hit, reaction: 'aggravate' as const };
    // additiveBase(aggravate, em 0, lv90) = 1.15 * 1446.85 = 1663.8775
    const expected =
      ((2967.6 + 1663.8775) / 2967.6) * computeHitDamage(base, t, hit, dmg);
    expect(computeHitDamage(base, t, a, dmg)).toBeCloseTo(expected, 1);
  });
  it('is monotone in every damage-relevant stat (bound admissibility)', () => {
    const keys = [
      'atk',
      'atk_pct',
      'crit_rate',
      'crit_dmg',
      'elemental_dmg',
      'em',
    ] as const;
    for (const k of keys) {
      const more = {
        ...t,
        em: 50,
        [k]: ((t as Record<string, number>)[k] ?? 50) + 10,
      };
      const v = { ...hit, reaction: 'vaporize-2x' as const };
      expect(computeHitDamage(base, more, v, dmg)).toBeGreaterThanOrEqual(
        computeHitDamage(base, { ...t, em: 50 }, v, dmg),
      );
    }
  });
});
