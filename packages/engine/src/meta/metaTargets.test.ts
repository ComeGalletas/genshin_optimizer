import { describe, it, expect } from 'vitest';
import { META_TARGETS, metaToConstraints } from './metaTargets';
import { genshinAdapter } from '../game/genshin/adapter';

describe('META_TARGETS', () => {
  it('every entry resolves to a real character and set in the snapshot', () => {
    const setKeys = new Set(genshinAdapter.sets().map((s) => s.key));
    const charKeys = new Set(genshinAdapter.characters().map((c) => c.key));
    for (const [key, m] of Object.entries(META_TARGETS)) {
      expect(charKeys.has(m.characterKey), `${key} characterKey`).toBe(true);
      const req = m.setRequirement;
      const keys = req.kind === '2+2' ? req.setKeys : [req.setKey];
      for (const sk of keys)
        expect(setKeys.has(sk), `${key} set ${sk}`).toBe(true);
      expect(m.source, `${key} source`).toMatch(/^https?:\/\//);
    }
  });

  it('every named weapon is one the character can equip', () => {
    for (const [key, m] of Object.entries(META_TARGETS)) {
      for (const field of ['weapon', 'weaponAccessible'] as const) {
        const w = m[field];
        if (w == null) continue;
        expect(genshinAdapter.weapon(w), `${key} ${field}`).toBeDefined();
        expect(
          genshinAdapter.canEquip(m.characterKey, w),
          `${key}.${field}: ${w} is the wrong weapon class`,
        ).toBe(true);
      }
    }
  });

  it('covers at least the four original showcase characters', () => {
    for (const key of ['furina', 'nahida', 'navia', 'neuvillette']) {
      expect(META_TARGETS[key], key).toBeTruthy();
    }
  });

  it('metaToConstraints maps a recipe to OptimizeConstraints', () => {
    const c = metaToConstraints(META_TARGETS.furina);
    expect(c.setRequirement).toEqual({ kind: '4pc', setKey: 'GoldenTroupe' });
    expect(c.mainStatLocks).toEqual({
      sands: 'hp_pct',
      goblet: 'elemental_dmg',
    });
    expect(c.minStats?.er_pct).toBe(130);
  });

  it('omits minStats when there is no ER target', () => {
    const c = metaToConstraints(META_TARGETS.nahida);
    expect(c.minStats?.er_pct).toBeUndefined();
  });
});
