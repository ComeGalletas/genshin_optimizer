import { describe, expect, it } from 'vitest';
import type { Artifact, Slot, StatKey, SubStat } from '../game/types';
import {
  artifactQuality,
  FLAT_FACTOR,
  isRecommendedSet,
  MAIN_STAT_POINTS,
  qualityProfile,
} from './artifactQuality';
import { SUBSTAT_TIERS_5 } from '../game/genshin/substatRolls';
import { mulberry32 } from '../numbers';

let n = 0;
const piece = (
  slot: Slot,
  mainStat: StatKey,
  subStats: [StatKey, number][],
  extra: Partial<Artifact> = {},
): Artifact => ({
  id: `q${n++}`,
  setKey: 'OceanHuedClam',
  slot,
  rarity: 5,
  level: 20,
  mainStat,
  mainStatValue: 46.6,
  subStats: subStats.map(([key, value]) => ({ key, value })),
  ...extra,
});

const MAX = (k: keyof typeof SUBSTAT_TIERS_5) => SUBSTAT_TIERS_5[k][3];

describe('qualityProfile', () => {
  it('reads Kokomi: HP and Energy Recharge, no crit, a healing circlet', () => {
    const p = qualityProfile('sangonomiya_kokomi')!;
    expect(p.usable).toEqual({ hp_pct: 1, hp: FLAT_FACTOR, er_pct: 1 });
    expect(p.erMin).toBe(220);
    expect(p.erScales).toBe(false);
    expect(p.accepts.circlet).toEqual(['healing', 'hp_pct']);
    expect(p.accepts.goblet).toEqual(['elemental_dmg', 'hp_pct']);
    expect(p.recommendedSets).toEqual(['OceanHuedClam']);
  });

  it('reads Furina: HP and crit, an HP sands, a crit or HP circlet', () => {
    const p = qualityProfile('furina')!;
    expect(p.usable).toMatchObject({
      hp_pct: 1,
      hp: FLAT_FACTOR,
      crit_rate: 1,
      crit_dmg: 1,
      er_pct: 1,
    });
    expect(p.accepts.sands).toEqual(['hp_pct']);
    expect(p.accepts.circlet).toEqual(['crit_rate', 'crit_dmg', 'hp_pct']);
  });

  it('lets Raiden’s Energy Recharge scale, and EM count for Nahida', () => {
    expect(qualityProfile('raiden_shogun')!.erScales).toBe(true);
    expect(qualityProfile('nahida')!.usable.em).toBe(1);
  });

  // Checked on the owner's account (2026-10-06): what the curated targets
  // leave out, until TODO 10.2 gives substat priorities.
  it('adds Kuki’s HP and her and Bennett’s Healing Bonus circlet', () => {
    const kuki = qualityProfile('kuki_shinobu')!;
    expect(kuki.usable).toMatchObject({ em: 1, hp_pct: 1, hp: FLAT_FACTOR });
    expect(kuki.accepts.circlet).toContain('healing');
    expect(qualityProfile('bennett')!.accepts.circlet).toContain('healing');
    expect(qualityProfile('xingqiu')!.accepts.circlet).not.toContain('healing');
  });

  it('has no profile, and so no score, without curated targets', () => {
    expect(qualityProfile('eula')).toBeNull();
    expect(artifactQuality('eula', undefined, [])).toBeNull();
  });
});

describe('artifactQuality', () => {
  const kokomi = [
    piece('flower', 'hp', [
      ['hp_pct', 11.7],
      ['er_pct', 6.5],
      ['crit_rate', 3.9],
      ['atk', 19],
    ]),
    piece('sands', 'hp_pct', [['hp', 299]]),
    piece('goblet', 'elemental_dmg', [['hp_pct', 5.8]], { element: 'hydro' }),
    piece('circlet', 'healing', [['er_pct', 13]]),
  ];

  it('adds 10 per accepted main stat to the good rolls on usable stats', () => {
    const q = artifactQuality('sangonomiya_kokomi', undefined, kokomi)!;
    expect(q.main.points).toBe(3 * MAIN_STAT_POINTS);
    expect(q.main.slots.map((s) => s.ok)).toEqual([true, true, true]);
    // Crit and flat ATK are no use to her; flat HP counts at 0.4; all her
    // Energy Recharge counts, being under her 220% minimum.
    expect(q.byStat.hp_pct).toBeCloseTo((11.7 + 5.8) / MAX('hp_pct'), 6);
    expect(q.byStat.hp).toBeCloseTo((299 / MAX('hp')) * FLAT_FACTOR, 6);
    expect(q.byStat.er_pct).toBeCloseTo(19.5 / MAX('er_pct'), 6);
    expect(q.byStat.crit_rate).toBeUndefined();
    expect(q.rolls).toBeCloseTo(
      (11.7 + 5.8) / MAX('hp_pct') +
        (299 / MAX('hp')) * FLAT_FACTOR +
        19.5 / MAX('er_pct'),
      6,
    );
    expect(q.total).toBeCloseTo(30 + q.rolls, 6);
    expect(q.er).toMatchObject({ min: 220, total: 119.5, scales: false });
    expect(q.er!.short).toBeCloseTo(100.5, 6);
  });

  it('checks an elemental goblet’s element, and counts a missing slot as unmet', () => {
    const pyro = kokomi.map((a) =>
      a.slot === 'goblet' ? { ...a, element: 'pyro' as const } : a,
    );
    const q = artifactQuality(
      'sangonomiya_kokomi',
      undefined,
      pyro.filter((a) => a.slot !== 'circlet'),
    )!;
    expect(q.main.slots).toEqual([
      { slot: 'sands', mainStat: 'hp_pct', ok: true },
      { slot: 'goblet', mainStat: 'elemental_dmg', ok: false },
      { slot: 'circlet', ok: false },
    ]);
    expect(q.main.points).toBe(MAIN_STAT_POINTS);
  });

  it('counts Energy Recharge up to the minimum, or all of it when it scales', () => {
    const lots = [piece('flower', 'hp', [['er_pct', 50]])];
    // Furina (130% minimum, Splendor carries no ER): 30% of the 50 counts.
    const furina = artifactQuality(
      'furina',
      { buildLevel: 90, weaponKey: 'splendor_of_tranquil_waters' },
      lots,
    )!;
    expect(furina.byStat.er_pct).toBeCloseTo(30 / MAX('er_pct'), 6);
    expect(furina.er!.short).toBe(0);
    // Raiden: every roll counts, past her minimum too.
    const raiden = artifactQuality(
      'raiden_shogun',
      { buildLevel: 90, weaponKey: 'engulfing_lightning' },
      lots,
    )!;
    expect(raiden.byStat.er_pct).toBeCloseTo(50 / MAX('er_pct'), 6);
    expect(raiden.er!.total).toBeGreaterThan(200);
  });

  it('counts what an Energy Recharge sands already gives toward the minimum', () => {
    const withSands = [
      piece('sands', 'er_pct', [], { mainStatValue: 51.8 }),
      piece('flower', 'hp', [['er_pct', 80]]),
    ];
    const q = artifactQuality('sangonomiya_kokomi', undefined, withSands)!;
    // 100 base + 51.8 from the sands: 68.2 of her 220 minimum is left, so
    // 68.2 of the 80 counts. (Her sands isn't one she accepts: HP% only.)
    expect(q.byStat.er_pct).toBeCloseTo(68.2 / MAX('er_pct'), 6);
    expect(q.er!.short).toBe(0);
    expect(q.main.slots[0]).toEqual({
      slot: 'sands',
      mainStat: 'er_pct',
      ok: false,
    });
  });

  it('gives the most good rolls each piece could hold', () => {
    // Kokomi's flower can't roll flat HP (its main stat): HP% and ER lines,
    // and five upgrades into a full-weight one.
    const flower = artifactQuality('sangonomiya_kokomi', undefined, [
      piece('flower', 'hp', []),
    ])!;
    expect(flower.possible).toBeCloseTo(2 + 5, 6);
    // Her HP% sands: flat HP (0.4) and ER (1) lines, upgrades into ER.
    const sands = artifactQuality('sangonomiya_kokomi', undefined, [
      piece('sands', 'hp_pct', []),
    ])!;
    expect(sands.possible).toBeCloseTo(1.4 + 5, 6);
  });

  it('never scores more good rolls than the pieces could hold', () => {
    const rand = mulberry32(57);
    const keys = Object.keys(
      SUBSTAT_TIERS_5,
    ) as (keyof typeof SUBSTAT_TIERS_5)[];
    const slots: [Slot, StatKey][] = [
      ['flower', 'hp'],
      ['plume', 'atk'],
      ['sands', 'hp_pct'],
      ['goblet', 'elemental_dmg'],
      ['circlet', 'crit_rate'],
    ];
    for (let t = 0; t < 200; t++) {
      const pieces = slots.map(([slot, main]) => {
        const lines = keys
          .filter((k) => k !== main)
          .sort(() => rand() - 0.5)
          .slice(0, 4);
        const rolls = [1, 1, 1, 1];
        for (let u = 0; u < 5; u++) rolls[Math.floor(rand() * 4)]++;
        const subs: SubStat[] = lines.map((k, i) => ({
          key: k,
          value: rolls[i] * MAX(k),
        }));
        return { ...piece(slot, main, []), subStats: subs };
      });
      for (const c of ['furina', 'sangonomiya_kokomi', 'raiden_shogun']) {
        const q = artifactQuality(c, undefined, pieces)!;
        expect(q.rolls).toBeLessThanOrEqual(q.possible + 1e-9);
      }
    }
  });
});

describe('Chiori, checked against three guides (2026-10-06)', () => {
  it('uses crit, DEF% and ATK%, and recommends two sets', () => {
    const p = qualityProfile('chiori')!;
    expect(p.usable).toMatchObject({
      crit_rate: 1,
      crit_dmg: 1,
      def_pct: 1,
      def: FLAT_FACTOR,
      atk_pct: 1,
      atk: FLAT_FACTOR,
    });
    expect(p.usable.er_pct).toBeUndefined();
    expect(p.accepts.sands).toEqual(['def_pct', 'atk_pct']);
    expect(p.recommendedSets).toEqual(['GoldenTroupe', 'HuskOfOpulentDreams']);
    expect(isRecommendedSet('chiori', 'HuskOfOpulentDreams')).toBe(true);
  });
});

describe('isRecommendedSet', () => {
  it('marks the set the build recommends', () => {
    expect(isRecommendedSet('sangonomiya_kokomi', 'OceanHuedClam')).toBe(true);
    expect(isRecommendedSet('sangonomiya_kokomi', 'GladiatorsFinale')).toBe(
      false,
    );
    expect(isRecommendedSet('eula', 'PaleFlame')).toBe(false);
  });
});
