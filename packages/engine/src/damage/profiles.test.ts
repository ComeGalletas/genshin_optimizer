import { describe, it, expect } from 'vitest';
import { DAMAGE_PROFILES, getDamageProfile } from './profiles';
import { genshinAdapter } from '../game/genshin/adapter';

describe('damage profile registry', () => {
  it('every profile references a real character and has sane hits', () => {
    const keys = new Set(genshinAdapter.characters().map((c) => c.key));
    for (const [key, p] of Object.entries(DAMAGE_PROFILES)) {
      expect(keys.has(key), `unknown character: ${key}`).toBe(true);
      expect(p.characterKey).toBe(key);
      expect(p.hits.length).toBeGreaterThan(0);
      expect(p.source).toMatch(/^https:\/\//);
      for (const h of p.hits) {
        expect(h.multiplier).toBeGreaterThan(0);
        expect(h.weight).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(DAMAGE_PROFILES).length).toBeGreaterThanOrEqual(15);
  });

  it('getDamageProfile resolves known keys and returns undefined otherwise', () => {
    expect(getDamageProfile('neuvillette')?.characterKey).toBe('neuvillette');
    expect(getDamageProfile('not_a_character')).toBeUndefined();
  });
});
