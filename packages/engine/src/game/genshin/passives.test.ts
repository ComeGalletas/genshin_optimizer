import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import {
  CHARACTER_PASSIVES,
  REFINEMENTS,
  UNMODELLED_WEAPON_PASSIVES,
  WEAPON_PASSIVES,
  hasErDerivedPassive,
  passiveAssumptions,
  passiveVector,
  resolvePassives,
  type PassiveQuery,
} from './passives';
import { genshinAdapter } from './adapter';

// The snapshot's source (a devDependency, read only here): the drift check
// below holds every curated number to the passive text it came from.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const genshindb: any = createRequire(import.meta.url)('genshin-db');

const q = (over: Partial<PassiveQuery>): PassiveQuery => ({
  characterKey: 'furina',
  weaponKey: 'favonius_sword',
  buildLevel: 90,
  erFloor: 100,
  ...over,
});

describe('the curated passive tables (ADR-0042)', () => {
  it('keys every weapon and character the dataset has', () => {
    for (const key of [
      ...Object.keys(WEAPON_PASSIVES),
      ...Object.keys(UNMODELLED_WEAPON_PASSIVES),
    ])
      expect(genshinAdapter.weapon(key), key).toBeDefined();
    for (const key of Object.keys(CHARACTER_PASSIVES))
      expect(genshinAdapter.character(key), key).toBeDefined();
  });

  it('lists a weapon as modelled or unmodelled, never both', () => {
    for (const key of Object.keys(UNMODELLED_WEAPON_PASSIVES))
      expect(WEAPON_PASSIVES[key], key).toBeUndefined();
  });

  it('transcribes every weapon value, at every refinement, from genshin-db', () => {
    for (const [key, passive] of Object.entries(WEAPON_PASSIVES)) {
      const w = genshindb.weapons(genshinAdapter.weapon(key)!.name);
      expect(w, key).toBeTruthy();
      for (const g of passive.grants)
        for (const r of REFINEMENTS) {
          const values: string[] = w[`r${r}`].values;
          // "16%/32%/48%" (per stack): the first is one stack.
          const num = (i: number) => parseFloat(values[i].split('/')[0]);
          expect(g.values[r - 1], `${key} R${r}`).toBe(num(g.param));
          if (g.fromEr?.cap)
            expect(g.fromEr.cap[r - 1], `${key} R${r} cap`).toBe(
              num(g.fromEr.capParam!),
            );
        }
    }
  });

  it('transcribes every character value from genshin-db’s passive text', () => {
    for (const [key, passive] of Object.entries(CHARACTER_PASSIVES)) {
      const text: string = genshindb
        .talents(genshinAdapter.character(key)!.name)
        [passive.talent].description.replace(/<[^>]+>/g, '');
      for (const g of passive.grants) {
        // Raiden's "0.4% ... per 1% above 100%" is stored as 40% of the
        // ER above 100.
        const shown = g.fromEr?.above === 100 ? g.value / 100 : g.value;
        expect(text, key).toContain(`${Math.abs(shown)}%`);
      }
    }
  });
});

describe('resolvePassives / passiveVector', () => {
  it('scales a static weapon passive with refinement, R1 by default', () => {
    expect(passiveVector(q({ weaponKey: 'aquila_favonia' }))).toEqual({
      atk_pct: 20,
    });
    expect(
      passiveVector(q({ weaponKey: 'aquila_favonia', refinement: 5 })),
    ).toEqual({ atk_pct: 40 });
    expect(passiveVector(q({ weaponKey: 'favonius_sword' }))).toEqual({});
  });

  it('refuses a refinement outside 1 to 5', () => {
    for (const bad of [0, 6, 2.5, NaN])
      expect(() =>
        passiveVector(q({ weaponKey: 'aquila_favonia', refinement: bad })),
      ).toThrow(/refinement/);
  });

  it('puts an all-DMG bonus in both DMG stats', () => {
    expect(
      passiveVector(q({ weaponKey: 'freedomsworn', refinement: 2 })),
    ).toEqual({ elemental_dmg: 12.5, physical_dmg: 12.5 });
  });

  it('resolves Engulfing Lightning at the ER floor, capped', () => {
    const at = (erFloor: number, refinement = 1) =>
      passiveVector(
        q({
          characterKey: 'xiangling',
          weaponKey: 'engulfing_lightning',
          refinement,
          erFloor,
        }),
      ).atk_pct ?? 0;
    expect(at(100)).toBe(0);
    expect(at(160)).toBeCloseTo(16.8, 9);
    expect(at(1000)).toBe(80); // R1 cap
    expect(at(1000, 5)).toBe(120); // R5 cap
    expect(at(80)).toBe(0); // a floor under 100 grants nothing, not less
  });

  it('resolves Mona’s on all of her ER and Raiden’s on the part above 100%', () => {
    expect(
      passiveVector(
        q({ characterKey: 'mona', weaponKey: 'favonius_codex', erFloor: 180 }),
      ),
    ).toEqual({ elemental_dmg: 36 });
    expect(
      passiveVector(
        q({
          characterKey: 'raiden_shogun',
          weaponKey: 'favonius_lance',
          erFloor: 250,
        }),
      ).elemental_dmg,
    ).toBeCloseTo(60, 9);
  });

  it('counts an Ascension 4 passive from build level 70, an innate one always', () => {
    const xq = (buildLevel: 60 | 70) =>
      passiveVector(q({ characterKey: 'xingqiu', buildLevel }));
    expect(xq(60)).toEqual({});
    expect(xq(70)).toEqual({ elemental_dmg: 20 });
    expect(
      passiveVector(
        q({
          characterKey: 'sangonomiya_kokomi',
          weaponKey: 'favonius_codex',
          buildLevel: 1,
        }),
      ),
    ).toEqual({ healing: 25, crit_rate: -100 });
  });

  it('adds weapon and character passives together', () => {
    const grants = resolvePassives(
      q({
        characterKey: 'raiden_shogun',
        weaponKey: 'engulfing_lightning',
        erFloor: 200,
      }),
    );
    expect(grants.map((g) => [g.source, g.stat, g.atEr])).toEqual([
      ['weapon', 'atk_pct', 200],
      ['character', 'elemental_dmg', 200],
    ]);
  });

  it('knows which queries depend on the ER floor', () => {
    expect(hasErDerivedPassive(q({ weaponKey: 'engulfing_lightning' }))).toBe(
      true,
    );
    expect(hasErDerivedPassive(q({ characterKey: 'mona' }))).toBe(true);
    expect(
      hasErDerivedPassive(q({ characterKey: 'mona', buildLevel: 60 })),
    ).toBe(false);
    expect(hasErDerivedPassive(q({ weaponKey: 'aquila_favonia' }))).toBe(false);
  });
});

describe('passiveAssumptions', () => {
  const names = { weapon: 'W', character: 'C' };

  it('says what a static passive counts and what it leaves out', () => {
    expect(
      passiveAssumptions(
        q({ weaponKey: 'mistsplitter_reforged', refinement: 3 }),
        names,
      ),
    ).toEqual([
      'W R3 passive: +18% Elemental DMG. Not counted: Mistsplitter’s Emblem stacks (up to +28% at R1).',
    ]);
  });

  it('says at which ER an ER-derived passive was counted', () => {
    const [weapon, character] = passiveAssumptions(
      q({
        characterKey: 'raiden_shogun',
        weaponKey: 'engulfing_lightning',
        erFloor: 250,
      }),
      names,
    );
    expect(weapon).toContain('+42% ATK% (28% of the ER above 100%, max 80%)');
    expect(weapon).toContain('counted at 250% Energy Recharge');
    expect(character).toContain(
      '+60% Elemental DMG (40% of the ER above 100%)',
    );
  });

  it('names an unmodelled passive and a locked character passive', () => {
    expect(
      passiveAssumptions(q({ weaponKey: 'beacon_of_the_reed_sea' }), names)[0],
    ).toMatch(/^W passive not counted: Max HP \+32%/);
    expect(
      passiveAssumptions(q({ characterKey: 'xingqiu', buildLevel: 60 }), names),
    ).toEqual([
      'C’s passive unlocks at Ascension 4 (build level 70): not counted at level 60.',
    ]);
  });

  it('is empty for a weapon and character with no passive to report', () => {
    expect(passiveAssumptions(q({}), names)).toEqual([]);
  });
});
