import { describe, it, expect } from 'vitest';
import { buildDataCoverage, type CoverageSources } from './dataCoverage';
import { genshinAdapter } from '../game/genshin/adapter';
import type { MetaTarget } from '../meta/metaTargets';
import type { CompArchetype } from '../teams/types';

describe('buildDataCoverage on the real snapshot and tables', () => {
  const report = buildDataCoverage();

  it('lists every snapshot character and weapon exactly once', () => {
    const charKeys = report.characters.map((c) => c.key);
    const weaponKeys = report.weapons.map((w) => w.key);
    expect(new Set(charKeys).size).toBe(charKeys.length);
    expect(new Set(weaponKeys).size).toBe(weaponKeys.length);
    for (const c of genshinAdapter.characters())
      expect(charKeys).toContain(c.key);
    for (const w of genshinAdapter.weapons())
      expect(weaponKeys).toContain(w.key);
  });

  // A genshin-db bump that renames or drops a key would silently orphan the
  // curated entries that use it.
  it('finds every curated character and weapon in genshin-db', () => {
    expect(report.summary.charactersMissingFromGenshinDb).toEqual([]);
    expect(report.summary.weaponsMissingFromGenshinDb).toEqual([]);
  });

  it('reports a fully curated character and an uncurated new one', () => {
    const furina = report.characters.find((c) => c.key === 'furina')!;
    expect(furina).toMatchObject({
      inGenshinDb: true,
      metaTarget: true,
      damageProfile: true,
      gcsim: 'unknown',
    });
    expect(furina.archetypes.length).toBeGreaterThan(0);
    expect(report.summary.charactersUncurated).toContain('vesna');
    expect(report.summary.charactersUncurated).not.toContain('furina');
  });
});

describe('buildDataCoverage on synthetic sources', () => {
  const meta = (
    characterKey: string,
    weapon?: string,
    weaponAccessible?: string,
  ) => ({ characterKey, weapon, weaponAccessible }) as MetaTarget;
  const sources: CoverageSources = {
    characters: [
      { key: 'alpha', name: 'Alpha', element: 'pyro', weaponType: 'sword' },
      { key: 'bravo', name: 'Bravo', element: 'hydro', weaponType: 'bow' },
    ],
    weapons: [{ key: 'blade', name: 'Blade', type: 'sword', rarity: 5 }],
    metaTargets: {
      alpha: meta('alpha', 'blade', 'blade'),
      ghost: meta('ghost', 'phantom_bow'),
    },
    damageProfiles: { alpha: {} },
    archetypes: [
      {
        id: 'team-one',
        slots: [
          { options: [{ characterKey: 'alpha', weight: 1 }] },
          { options: [{ characterKey: 'alpha', weight: 0.5 }] },
          { options: [] },
          { options: [] },
        ],
      } as unknown as CompArchetype,
    ],
    obtainability: { blade: {} },
  };
  const report = buildDataCoverage(sources);

  it('surfaces curated keys that genshin-db lacks, named by key', () => {
    const ghost = report.characters.find((c) => c.key === 'ghost')!;
    expect(ghost).toMatchObject({
      name: 'ghost',
      inGenshinDb: false,
      metaTarget: true,
    });
    expect(report.summary.charactersMissingFromGenshinDb).toEqual(['ghost']);
    expect(report.summary.weaponsMissingFromGenshinDb).toEqual(['phantom_bow']);
  });

  it('counts an archetype once per character and a weapon pick once per recipe', () => {
    const alpha = report.characters.find((c) => c.key === 'alpha')!;
    expect(alpha.archetypes).toEqual(['team-one']);
    const blade = report.weapons.find((w) => w.key === 'blade')!;
    expect(blade.metaPickFor).toEqual(['alpha']);
    expect(blade.obtainability).toBe(true);
  });

  it('marks a snapshot character with no curated data as uncurated', () => {
    expect(report.summary.charactersUncurated).toEqual(['bravo']);
    expect(report.summary).toMatchObject({
      characters: 3,
      charactersWithMetaTarget: 2,
      charactersWithDamageProfile: 1,
      charactersInArchetypes: 1,
      weapons: 2,
      weaponsWithObtainability: 1,
      weaponsAsMetaPick: 2,
    });
  });
});
