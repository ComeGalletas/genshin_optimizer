import { describe, expect, it } from 'vitest';
import type { Artifact, Slot, StatKey, SubStat } from '../game/types';
import {
  artifactQualities,
  artifactQuality,
  FLAT_FACTOR,
  guideErForWeapon,
  isRecommendedSet,
  MAIN_STAT_POINTS,
  QUALITY_STAT_ORDER,
  qualityProfile,
  qualityProfiles,
  unscoredBuilds,
  UNUSED_STATS,
} from './artifactQuality';
import { GUIDE_BUILDS } from '../meta/guideBuilds';
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

describe('qualityProfiles', () => {
  it('reads Kokomi’s three builds: two healers and Bloom', () => {
    const builds = qualityProfiles('sangonomiya_kokomi');
    expect(builds.map((b) => b.role)).toEqual([
      'healer',
      'healer',
      'reaction_dps',
    ]);
    const [onField, offField, bloom] = builds;
    // HP and Energy Recharge, no crit (her passive), a healing circlet.
    expect(onField.usable).toEqual({ hp_pct: 1, hp: FLAT_FACTOR, er_pct: 1 });
    expect(onField.unused?.stats).toEqual(['crit_rate', 'crit_dmg']);
    expect(onField.accepts).toEqual({
      sands: ['hp_pct', 'er_pct'],
      goblet: ['elemental_dmg', 'hp_pct'],
      circlet: ['healing', 'hp_pct'],
    });
    expect(onField.sources).toEqual(['kqm', 'genshinBuilds']);
    expect(onField.recommendedSets[0]).toBe('OceanHuedClam');
    // Each build has its own Energy Recharge minimum.
    expect([onField.erMin, offField.erMin, bloom.erMin]).toEqual([
      195,
      260,
      undefined,
    ]);
    expect(bloom.usable.em).toBe(1);
    expect(bloom.accepts.goblet).toContain('em');
    expect(bloom.recommendedSets[0]).toBe('FlowerOfParadiseLost');
  });

  it('reads Furina: HP and crit, an HP or Energy Recharge sands', () => {
    const p = qualityProfile('furina')!;
    expect(p.usable).toMatchObject({
      hp_pct: 1,
      hp: FLAT_FACTOR,
      crit_rate: 1,
      crit_dmg: 1,
      er_pct: 1,
    });
    expect(p.accepts.sands).toEqual(['hp_pct', 'er_pct']);
    expect(p.accepts.circlet).toEqual(['crit_rate', 'crit_dmg']);
  });

  it('counts crit and Energy Recharge for everyone but the exceptions', () => {
    // Nahida's builds aim at EM; crit and ER still count.
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

  it('gives Kuki and Bennett a healing build with a Healing Bonus circlet', () => {
    const heals = (k: string) =>
      qualityProfiles(k).some((b) => b.accepts.circlet.includes('healing'));
    expect(heals('kuki_shinobu')).toBe(true);
    expect(heals('bennett')).toBe(true);
    expect(qualityProfile('kuki_shinobu')!.usable.hp_pct).toBe(1);
  });

  it('lists the builds a guide leaves stats out of, and why', () => {
    expect(unscoredBuilds('faruzan')).toEqual([
      expect.objectContaining({
        source: 'kqm',
        reason: 'the guide gives no goblet main stat',
      }),
    ]);
    expect(unscoredBuilds('furina')).toEqual([]);
  });

  it('has no build, and so no score, for a character it doesn’t know', () => {
    expect(qualityProfiles('nobody')).toEqual([]);
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
    // Her on-field healer build fits these pieces best.
    expect(q.build).toBe(0);
    expect(q.profile.name).toBe(qualityProfiles('sangonomiya_kokomi')[0].name);
    expect(q.main.points).toBe(3 * MAIN_STAT_POINTS);
    expect(q.main.slots.map((s) => s.ok)).toEqual([true, true, true]);
    // Crit and flat ATK are no use to her; flat HP counts at 0.4; all her
    // Energy Recharge counts.
    expect(q.byStat.hp_pct).toBeCloseTo((11.7 + 5.8) / MAX('hp_pct'), 6);
    expect(q.byStat.hp).toBeCloseTo((299 / MAX('hp')) * FLAT_FACTOR, 6);
    expect(q.byStat.er_pct).toBeCloseTo(19.5 / MAX('er_pct'), 6);
    expect(q.byStat.crit_rate).toBeUndefined();
    expect(MAIN_STAT_POINTS).toBe(7);
    expect(q.total).toBeCloseTo(21 + q.rolls, 6);
    // The build's own minimum: 195%.
    expect(q.er).toMatchObject({ min: 195, total: 119.5 });
    expect(q.er!.short).toBeCloseTo(75.5, 6);
  });

  it('scores every build and counts the one that fits best', () => {
    const bloom = [
      piece('sands', 'em', [['em', 40]]),
      piece('goblet', 'em', [['hp_pct', 5.8]]),
      piece('circlet', 'healing', [['em', 21]]),
    ];
    const all = artifactQualities('sangonomiya_kokomi', undefined, bloom);
    expect(all).toHaveLength(3);
    // The healer builds accept only her Healing Bonus circlet here; Bloom
    // accepts all three, and counts her EM.
    expect(all.map((q) => q.main.points)).toEqual([7, 7, 21]);
    expect(all[2].byStat.em).toBeCloseTo(61 / MAX('em'), 6);
    const best = artifactQuality('sangonomiya_kokomi', undefined, bloom)!;
    expect(best.build).toBe(2);
    expect(best.total).toBe(Math.max(...all.map((q) => q.total)));
    // A build can be asked for by its index.
    expect(
      artifactQuality('sangonomiya_kokomi', undefined, bloom, 0)!.build,
    ).toBe(0);
  });

  it('takes the first build on a tie', () => {
    const q = artifactQuality('sangonomiya_kokomi', undefined, [])!;
    expect(q.total).toBe(0);
    expect(q.build).toBe(0);
  });

  it('checks an elemental goblet’s element, and counts a missing slot as unmet', () => {
    const pyro = kokomi.map((a) =>
      a.slot === 'goblet' ? { ...a, element: 'pyro' as const } : a,
    );
    const q = artifactQuality(
      'sangonomiya_kokomi',
      undefined,
      pyro.filter((a) => a.slot !== 'circlet'),
      0,
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
    // Furina (200% minimum, Splendor carries no ER): all 50 count.
    const furina = artifactQuality(
      'furina',
      { buildLevel: 90, weaponKey: 'splendor_of_tranquil_waters' },
      lots,
    )!;
    expect(furina.byStat.er_pct).toBeCloseTo(50 / MAX('er_pct'), 6);
    expect(furina.er).toMatchObject({ min: 200, total: 150, short: 50 });
    // Columbina's second build gives no minimum: still all of it.
    const columbina = artifactQuality('columbina', undefined, lots, 1)!;
    expect(columbina.profile.erMin).toBeUndefined();
    expect(columbina.byStat.er_pct).toBeCloseTo(50 / MAX('er_pct'), 6);
    expect(columbina.er).toEqual({ total: 150, short: 0 });
    // Her first build carries the guide's weapon figures too.
    expect(qualityProfile('columbina')!.erWeapons?.length).toBeGreaterThan(0);
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
    const q = artifactQuality('sangonomiya_kokomi', undefined, withSands, 0)!;
    // 100 base + 51.8 from the sands + 80 from the flower, past her 195%:
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
    const flower = artifactQuality(
      'sangonomiya_kokomi',
      undefined,
      [piece('flower', 'hp', [])],
      0,
    )!;
    expect(flower.possible).toBeCloseTo(2 + 5, 6);
    // Her HP% sands: flat HP (0.4) and ER (1) lines, upgrades into ER.
    const sands = artifactQuality(
      'sangonomiya_kokomi',
      undefined,
      [piece('sands', 'hp_pct', [])],
      0,
    )!;
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
      for (const c of ['furina', 'sangonomiya_kokomi', 'raiden_shogun'])
        for (const q of artifactQualities(c, undefined, pieces))
          expect(q.rolls).toBeLessThanOrEqual(q.possible + 1e-9);
    }
  });
});

describe('Chiori', () => {
  it('uses crit, DEF% and ATK%, and recommends Golden Troupe first', () => {
    const p = qualityProfile('chiori')!;
    expect(p.usable).toMatchObject({
      crit_rate: 1,
      crit_dmg: 1,
      def_pct: 1,
      def: FLAT_FACTOR,
      atk_pct: 1,
      atk: FLAT_FACTOR,
      er_pct: 1,
    });
    expect(p.erMin).toBeUndefined();
    expect(p.accepts.sands).toEqual(['def_pct']);
    expect(p.recommendedSets.slice(0, 2)).toEqual([
      'GoldenTroupe',
      'HuskOfOpulentDreams',
    ]);
  });
});

describe('isRecommendedSet', () => {
  it('marks the sets the build recommends', () => {
    expect(isRecommendedSet('sangonomiya_kokomi', 'OceanHuedClam')).toBe(true);
    expect(isRecommendedSet('sangonomiya_kokomi', 'GladiatorsFinale')).toBe(
      false,
    );
    // Flower of Paradise Lost is her Bloom build's, not her healer's.
    expect(isRecommendedSet('sangonomiya_kokomi', 'FlowerOfParadiseLost')).toBe(
      false,
    );
    expect(
      isRecommendedSet('sangonomiya_kokomi', 'FlowerOfParadiseLost', 2),
    ).toBe(true);
    expect(isRecommendedSet('eula', 'PaleFlame')).toBe(true);
    expect(isRecommendedSet('nobody', 'PaleFlame')).toBe(false);
  });
});

describe('guide builds (checked 2026-10-07)', () => {
  const sets = new Set(genshinAdapter.sets().map((x) => x.key));
  const stats = new Set<string>(genshinAdapter.statKeys);
  const roles = [
    'on_field_dps',
    'off_field_dps',
    'support',
    'healer',
    'shield',
    'reaction_dps',
  ];

  it('cover every character, with real sets, stats and roles', () => {
    for (const c of genshinAdapter.characters())
      expect(GUIDE_BUILDS[c.key]?.builds.length, c.key).toBeGreaterThan(0);
    for (const [k, g] of Object.entries(GUIDE_BUILDS)) {
      expect(genshinAdapter.character(k), k).toBeDefined();
      expect(g.kqm ?? g.genshinBuilds, k).toBeTruthy();
      for (const b of g.builds) {
        expect(roles, `${k} ${b.name}`).toContain(b.role);
        expect(b.sources.length, `${k} ${b.name}`).toBeGreaterThan(0);
        for (const x of b.sets) expect(sets.has(x), `${k} ${x}`).toBe(true);
        for (const x of [...b.substats, ...Object.values(b.accepts).flat()])
          expect(stats.has(x), `${k} ${x}`).toBe(true);
        for (const slot of ['sands', 'goblet', 'circlet'] as const)
          expect(
            b.accepts[slot].length,
            `${k} ${b.name} ${slot}`,
          ).toBeGreaterThan(0);
        expect(b.substats.length, `${k} ${b.name}`).toBeGreaterThan(0);
      }
      for (const u of g.unscored ?? [])
        expect(u.reason, k).toMatch(/^the guide gives no /);
    }
  });
});

describe('guideErForWeapon', () => {
  it('finds the guide’s figure for the weapon held', () => {
    const p = qualityProfile('columbina')!;
    expect(guideErForWeapon(p, 'Favonius Codex')?.min).toBe(190);
    expect(guideErForWeapon(p, 'Prototype Amber')?.min).toBe(165);
    expect(guideErForWeapon(p, 'Nocturne’s Curtain Call')?.min).toBe(165);
    expect(guideErForWeapon(p, 'Skyward Atlas')).toBeUndefined();
    expect(
      guideErForWeapon(qualityProfile('furina')!, 'Favonius Sword'),
    ).toBeUndefined();
  });
});
