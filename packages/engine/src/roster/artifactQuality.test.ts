import { describe, expect, it } from 'vitest';
import type { Artifact, Slot, StatKey, SubStat } from '../game/types';
import {
  artifactQuality,
  FLAT_FACTOR,
  isRecommendedSet,
  MAIN_STAT_POINTS,
  QUALITY_STAT_ORDER,
  qualityProfile,
  UNUSED_STATS,
} from './artifactQuality';
import { GUIDE_PROFILES } from '../meta/guideProfiles';
import { META_TARGETS } from '../meta/metaTargets';
import { genshinAdapter } from '../game/genshin/adapter';
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
    expect(p.unused?.stats).toEqual(['crit_rate', 'crit_dmg']);
    expect(p.accepts.circlet).toEqual(['healing', 'hp_pct']);
    expect(p.accepts.goblet).toEqual(['elemental_dmg', 'hp_pct']);
    // An HP% or Energy Recharge sands, and five sets beside Ocean-Hued Clam
    // (KQM and genshin-builds, 2026-10-07).
    expect(p.accepts.sands).toEqual(['hp_pct', 'er_pct']);
    expect(p.recommendedSets).toHaveLength(6);
    expect(p.recommendedSets[0]).toBe('OceanHuedClam');
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

  it('counts crit and Energy Recharge for everyone but the exceptions', () => {
    // Nahida's build aims at EM; crit and ER still count.
    expect(qualityProfile('nahida')!.usable).toMatchObject({
      em: 1,
      crit_rate: 1,
      crit_dmg: 1,
      er_pct: 1,
    });
    // Their bursts don't use energy.
    for (const k of ['mavuika', 'skirk']) {
      const p = qualityProfile(k)!;
      expect(p.usable.er_pct).toBeUndefined();
      expect(p.usable.crit_rate).toBe(1);
    }
    for (const [k, e] of Object.entries(UNUSED_STATS)) {
      expect(genshinAdapter.character(k), k).toBeDefined();
      expect(e.reason.length, k).toBeGreaterThan(10);
    }
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

  it('has no profile, and so no score, without targets or a guide', () => {
    expect(qualityProfile('nobody')).toBeNull();
    expect(artifactQuality('nobody', undefined, [])).toBeNull();
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

  it('adds 7 per accepted main stat to the good rolls on usable stats', () => {
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
    expect(MAIN_STAT_POINTS).toBe(7);
    expect(q.total).toBeCloseTo(21 + q.rolls, 6);
    expect(q.er).toMatchObject({ min: 220, total: 119.5 });
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

  it('counts all Energy Recharge, past the minimum or without one', () => {
    const lots = [piece('flower', 'hp', [['er_pct', 50]])];
    // Furina (130% minimum, Splendor carries no ER): all 50 count, past it.
    const furina = artifactQuality(
      'furina',
      { buildLevel: 90, weaponKey: 'splendor_of_tranquil_waters' },
      lots,
    )!;
    expect(furina.byStat.er_pct).toBeCloseTo(50 / MAX('er_pct'), 6);
    expect(furina.er).toMatchObject({ min: 130, total: 150, short: 0 });
    // Columbina's guides give no minimum: still all of it.
    const columbina = artifactQuality('columbina', undefined, lots)!;
    expect(columbina.byStat.er_pct).toBeCloseTo(50 / MAX('er_pct'), 6);
    expect(columbina.er).toEqual({ total: 150, short: 0 });
    // Mavuika's kit makes it useless: none of it.
    const mavuika = artifactQuality('mavuika', undefined, lots)!;
    expect(mavuika.byStat.er_pct).toBeUndefined();
    expect(mavuika.er).toBeUndefined();
    expect(mavuika.unused?.reason).toMatch(/Fighting Spirit/);
  });

  it('counts crit for a support, but not for Kokomi', () => {
    const crit = [
      piece('flower', 'hp', [
        ['crit_rate', 3.9],
        ['crit_dmg', 7.8],
      ]),
    ];
    const jean = artifactQuality('jean', undefined, crit)!;
    expect(jean.byStat.crit_rate).toBeCloseTo(3.9 / MAX('crit_rate'), 6);
    expect(jean.byStat.crit_dmg).toBeCloseTo(7.8 / MAX('crit_dmg'), 6);
    const kokomi = artifactQuality('sangonomiya_kokomi', undefined, crit)!;
    expect(kokomi.rolls).toBe(0);
  });

  it('lists its stats in one order', () => {
    const q = artifactQuality('jean', undefined, [
      piece('flower', 'hp', [
        ['er_pct', 6.5],
        ['atk_pct', 5.8],
        ['crit_dmg', 7.8],
        ['crit_rate', 3.9],
      ]),
    ])!;
    expect(Object.keys(q.byStat)).toEqual([
      'crit_rate',
      'crit_dmg',
      'atk_pct',
      'er_pct',
    ]);
    expect(QUALITY_STAT_ORDER.slice(0, 2)).toEqual(['crit_rate', 'crit_dmg']);
  });

  it('counts an Energy Recharge sands toward the total, not the score', () => {
    const withSands = [
      piece('sands', 'er_pct', [], { mainStatValue: 51.8 }),
      piece('flower', 'hp', [['er_pct', 80]]),
    ];
    const q = artifactQuality('sangonomiya_kokomi', undefined, withSands)!;
    // 100 base + 51.8 from the sands + 80 from the flower, past her 220%:
    // the 80 count as rolls; the sands counts as a main stat she accepts.
    expect(q.byStat.er_pct).toBeCloseTo(80 / MAX('er_pct'), 6);
    expect(q.er!.total).toBeCloseTo(231.8, 6);
    expect(q.er!.short).toBe(0);
    expect(q.main.slots[0]).toEqual({
      slot: 'sands',
      mainStat: 'er_pct',
      ok: true,
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
    // Energy Recharge counts for everyone; no guide gives her a minimum.
    expect(p.usable.er_pct).toBe(1);
    expect(p.erMin).toBeUndefined();
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
    expect(isRecommendedSet('eula', 'PaleFlame')).toBe(true);
    expect(isRecommendedSet('nobody', 'PaleFlame')).toBe(false);
  });
});

describe('guide profiles (checked 2026-10-07)', () => {
  const sets = new Set(genshinAdapter.sets().map((x) => x.key));
  const stats = new Set<string>(genshinAdapter.statKeys);

  it('name real characters, sets and stats, and only uncurated characters', () => {
    for (const [k, g] of Object.entries(GUIDE_PROFILES)) {
      expect(genshinAdapter.character(k), k).toBeDefined();
      expect(META_TARGETS[k], k).toBeUndefined();
      for (const x of g.sets) expect(sets.has(x), `${k} ${x}`).toBe(true);
      for (const x of [...g.substats, ...Object.values(g.accepts).flat()])
        expect(stats.has(x), `${k} ${x}`).toBe(true);
      expect(g.sources.length, k).toBeGreaterThan(0);
    }
  });

  it('read Jean from her guides, and Dehya from KQM’s build only', () => {
    const jean = qualityProfile('jean')!;
    expect(jean.from).toBe('guides');
    expect(jean.accepts.sands).toEqual(['atk_pct', 'er_pct']);
    expect(jean.erMin).toBe(160);
    expect(jean.recommendedSets[0]).toBe('ViridescentVenerer');
    const dehya = qualityProfile('dehya')!;
    expect(dehya.accepts.goblet).toEqual(['em', 'hp_pct']);
    expect(GUIDE_PROFILES.dehya.alternative).toMatch(/genshin-builds/);
  });
});
