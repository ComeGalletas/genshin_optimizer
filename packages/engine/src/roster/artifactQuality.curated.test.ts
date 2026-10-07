import { describe, expect, it, vi } from 'vitest';
import { FLAT_FACTOR, qualityProfiles } from './artifactQuality';

// A character the guides don't cover is scored against their curated target
// (ADR-0059). Every character has guide builds today, so hide them here.
vi.mock('../meta/guideBuilds', () => ({ GUIDE_BUILDS: {} }));

describe('curated fallback', () => {
  it('reads Kokomi’s curated target as one build', () => {
    const builds = qualityProfiles('sangonomiya_kokomi');
    expect(builds).toHaveLength(1);
    const [p] = builds;
    expect(p.from).toBe('curated');
    expect(p.name).toBe('Curated build');
    expect(p.sources).toEqual([]);
    expect(p.usable).toEqual({ hp_pct: 1, hp: FLAT_FACTOR, er_pct: 1 });
    expect(p.erMin).toBe(220);
    expect(p.accepts).toEqual({
      sands: ['hp_pct'],
      goblet: ['elemental_dmg', 'hp_pct'],
      circlet: ['healing', 'hp_pct'],
    });
    expect(p.recommendedSets[0]).toBe('OceanHuedClam');
  });

  it('accepts a crit circlet when the target aims at crit', () => {
    const [p] = qualityProfiles('furina');
    expect(p.accepts.circlet).toEqual(['crit_rate', 'crit_dmg', 'hp_pct']);
  });

  it('has no build without a target either', () => {
    expect(qualityProfiles('eula')).toEqual([]);
  });
});
