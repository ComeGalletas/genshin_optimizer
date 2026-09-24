import { describe, it, expect } from 'vitest';
import { buildContext } from './context';
import { genshinAdapter } from '../game/genshin/adapter';

describe('buildContext', () => {
  it('produces a base vector and set-bonus map from the adapter', () => {
    const chars = genshinAdapter.characters();
    const weapons = genshinAdapter.weapons();
    const ctx = buildContext({
      characterKey: chars[0].key,
      weaponKey: weapons[0].key,
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    });
    expect(ctx.base.atk ?? 0).toBeGreaterThan(0);
    expect(Object.keys(ctx.setBonuses).length).toBeGreaterThan(0);
    // Populated so the worker can render set-requirement diagnostics without
    // itself importing the adapter (see `OptimizeContext.setNames`).
    expect(ctx.setNames?.[genshinAdapter.sets()[0].key]).toBe(
      genshinAdapter.sets()[0].name,
    );
  });

  it('attaches the damage context only for the avg_damage objective', () => {
    const weapon = genshinAdapter.weapons()[0].key;
    const req = {
      characterKey: 'neuvillette',
      weaponKey: weapon,
      buildLevel: 90,
      constraints: {},
    } as const;
    expect(
      buildContext({ ...req, objective: 'crit_value' }).damage,
    ).toBeUndefined();
    const dmg = buildContext({ ...req, objective: 'avg_damage' }).damage;
    expect(dmg?.profile.characterKey).toBe('neuvillette');
    expect(dmg?.charLevel).toBe(90);
  });

  it('throws for avg_damage on a character with no profile', () => {
    const weapon = genshinAdapter.weapons()[0].key;
    const noProfile = genshinAdapter
      .characters()
      .find((c) => c.key === 'amber')!;
    expect(() =>
      buildContext({
        characterKey: noProfile.key,
        weaponKey: weapon,
        buildLevel: 90,
        constraints: {},
        objective: 'avg_damage',
      }),
    ).toThrow(/Unknown damage profile/);
  });
});
