import { describe, expect, it } from 'vitest';
import { crossCheck } from './crossCheck';
import { qualityProfiles } from './artifactQuality';
import { GENSHIN_GG, GENSHIN_GG_BUILDS } from '../meta/genshinGg';
import { genshinAdapter } from '../game/genshin/adapter';

describe('crossCheck', () => {
  it('finds where genshin.gg differs from Kokomi’s healer build', () => {
    const [healer, , bloom] = qualityProfiles('sangonomiya_kokomi');
    const c = crossCheck('sangonomiya_kokomi', healer)!;
    expect(c.url).toBe('https://genshin.gg/characters/kokomi/');
    expect(c.role).toBe('Support');
    // Its top set, Tenacity, is one the healer build recommends.
    expect(c.topSet).toEqual(['TenacityOfTheMillelith']);
    expect(c.topSetAgrees).toBe(true);
    // It also lists ATK% substats, which no Kokomi build uses.
    expect(c.extraSubstats).toEqual(['atk_pct']);
    expect(c.agrees).toBe(false);
    // Against her Bloom build, its HP% goblet still fits, but not its sets.
    const b = crossCheck('sangonomiya_kokomi', bloom)!;
    expect(b.topSetAgrees).toBe(false);
    expect(b.extraMains.map((m) => m.slot)).not.toContain('goblet');
  });

  it('agrees when the build covers everything the site lists', () => {
    const build = {
      ...qualityProfiles('zibai')[0],
      recommendedSets: ['NightOfTheSkysUnveiling'],
      accepts: {
        sands: ['def_pct' as const],
        goblet: ['def_pct' as const],
        circlet: ['crit_rate' as const, 'crit_dmg' as const],
      },
      usable: { crit_rate: 1, crit_dmg: 1, def_pct: 1, er_pct: 1 },
    };
    expect(crossCheck('zibai', build)!.agrees).toBe(true);
  });

  it('is null for a character the site doesn’t have', () => {
    expect(crossCheck('vesna', qualityProfiles('vesna')[0])).toBeNull();
  });
});

describe('genshin.gg builds', () => {
  const sets = new Set(genshinAdapter.sets().map((s) => s.key));
  const stats = new Set<string>(genshinAdapter.statKeys);

  it('are read from genshin.gg, for real characters, sets and stats', () => {
    expect(GENSHIN_GG.source).toBe('https://genshin.gg');
    expect(GENSHIN_GG.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(GENSHIN_GG_BUILDS).length).toBeGreaterThan(100);
    for (const [k, b] of Object.entries(GENSHIN_GG_BUILDS)) {
      expect(genshinAdapter.character(k), k).toBeDefined();
      expect(b.url, k).toMatch(/^https:\/\/genshin\.gg\/characters\//);
      expect(['Main DPS', 'Sub DPS', 'Support', 'DPS'], k).toContain(b.role);
      expect(b.sets.length, k).toBeGreaterThan(0);
      for (const s of b.sets.flat())
        expect(sets.has(s), `${k} ${s}`).toBe(true);
      for (const x of [...b.substats, ...Object.values(b.mains).flat()])
        expect(stats.has(x), `${k} ${x}`).toBe(true);
    }
  });
});
