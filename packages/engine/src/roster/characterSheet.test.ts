import { beforeAll, describe, expect, it } from 'vitest';
import { genshinAdapter } from '../game/genshin/adapter';
import {
  loadCharacterTexts,
  loadDetails,
  passiveText,
  talentValues,
  phaseAt,
  talentBonus,
  type Details,
} from '../game/genshin/details';
import type { Artifact } from '../game/types';
import { characterSheet } from './characterSheet';

let d: Details;
beforeAll(async () => {
  d = await loadDetails();
});

const CAPS = [20, 40, 50, 60, 70, 80, 90];

describe('phaseAt', () => {
  it('is the next phase past a cap, and the export says which side at one', () => {
    expect(phaseAt(CAPS, 1)).toBe(0);
    expect(phaseAt(CAPS, 20)).toBe(0);
    expect(phaseAt(CAPS, 20, 0)).toBe(0);
    expect(phaseAt(CAPS, 20, 1)).toBe(1);
    expect(phaseAt(CAPS, 21)).toBe(1);
    expect(phaseAt(CAPS, 80, 5)).toBe(5);
    expect(phaseAt(CAPS, 80, 6)).toBe(6);
    expect(phaseAt(CAPS, 90)).toBe(6);
  });
});

describe('details', () => {
  it('covers every character and weapon in the dataset', () => {
    const chars = genshinAdapter.characters().map((c) => c.key);
    expect(chars.filter((k) => !d.characters[k])).toEqual([]);
    const weapons = genshinAdapter.weapons().map((w) => w.key);
    expect(weapons.filter((k) => !d.weapons[k])).toEqual([]);
  });

  it('knows which talents C3 and C5 raise for all but Aloy', () => {
    const missing = Object.entries(d.characters)
      .filter(([, c]) => !c.c3 || !c.c5)
      .map(([k]) => k);
    expect(missing).toEqual(['aloy']);
    // Spot checks against the game: Hu Tao's C3 is her skill, Furina's her
    // burst.
    expect(d.characters.hu_tao.c3).toBe('skill');
    expect(d.characters.hu_tao.c5).toBe('burst');
    expect(d.characters.furina.c3).toBe('burst');
  });

  it('gives +3 per constellation reached, nothing before C3', () => {
    const furina = d.characters.furina;
    expect(talentBonus(furina, 2)).toEqual({ auto: 0, skill: 0, burst: 0 });
    expect(talentBonus(furina, 3)).toEqual({ auto: 0, skill: 0, burst: 3 });
    expect(talentBonus(furina, 6)).toEqual({ auto: 0, skill: 3, burst: 3 });
    expect(talentBonus(d.characters.aloy, 6)).toEqual({
      auto: 0,
      skill: 0,
      burst: 0,
    });
  });

  it('fills a passive with its refinement’s values', () => {
    const w = d.weapons.mistsplitter_reforged;
    const r1 = passiveText(w, 1)!;
    const r5 = passiveText(w, 5)!;
    expect(r1).toContain('12%');
    expect(r5).toContain('24%');
    expect(r1).not.toMatch(/\{\d+\}/);
    // Out of range clamps rather than leaving holes.
    expect(passiveText(w, 9)).toBe(r5);
    expect(passiveText(d.weapons.dull_blade)).toBeNull();
  });
});

describe('characterSheet', () => {
  it('matches the optimiser’s level 90 base for every character', () => {
    for (const c of genshinAdapter.characters()) {
      const weapon = genshinAdapter.weaponsOfType(c.weaponType)[0];
      const sheet = characterSheet(d, {
        characterKey: c.key,
        level: 90,
        ascension: 6,
        weaponKey: weapon.key,
        weaponLevel: 90,
        weaponAscension: 6,
        artifacts: [],
      })!;
      const b = genshinAdapter.baseStats(c.key, weapon.key, 90);
      const want = (stat: string) =>
        stat === 'hp'
          ? b.hp! * (1 + (b.hp_pct ?? 0) / 100)
          : stat === 'atk'
            ? b.atk! * (1 + (b.atk_pct ?? 0) / 100)
            : stat === 'def'
              ? b.def! * (1 + (b.def_pct ?? 0) / 100)
              : (b[stat as keyof typeof b] ?? 0);
      for (const r of sheet.rows) {
        expect(r.artifacts).toBe(0);
        expect(r.total, `${c.key} ${r.stat}`).toBeCloseTo(want(r.stat), 1);
      }
    }
  });

  it('splits base, artifacts and the rest, percent applied to the base', () => {
    const piece = (a: Partial<Artifact>): Artifact => ({
      id: String(Math.random()),
      setKey: 'GladiatorsFinale',
      slot: 'flower',
      rarity: 5,
      level: 20,
      mainStat: 'hp',
      mainStatValue: 4780,
      subStats: [],
      ...a,
    });
    const sheet = characterSheet(d, {
      characterKey: 'furina',
      level: 90,
      ascension: 6,
      weaponKey: 'splendor_of_tranquil_waters',
      weaponLevel: 90,
      weaponAscension: 6,
      artifacts: [
        piece({ subStats: [{ key: 'hp_pct', value: 10 }] }),
        // Two Gladiator's: +18% ATK.
        piece({
          slot: 'plume',
          mainStat: 'atk',
          mainStatValue: 311,
          subStats: [{ key: 'crit_rate', value: 3.9 }],
        }),
      ],
    })!;
    const row = (s: string) => sheet.rows.find((r) => r.stat === s)!;
    const hp = row('hp');
    expect(hp.base).toBeCloseTo(15307, 0);
    expect(hp.artifacts).toBeCloseTo(4780 + hp.base * 0.1, 3);
    expect(hp.other).toBe(0);
    const atk = row('atk');
    expect(atk.base).toBeCloseTo(244 + 542, 0);
    expect(atk.artifacts).toBeCloseTo(311 + atk.base * 0.18, 3);
    const cr = row('crit_rate');
    expect(cr.base).toBe(5);
    expect(cr.artifacts).toBeCloseTo(3.9);
    expect(cr.other).toBeCloseTo(19.2, 1); // the ascension stat
    expect(row('crit_dmg').other).toBeCloseTo(88.2, 1); // the weapon's
    expect(cr.total).toBeCloseTo(cr.base + cr.artifacts + cr.other);
    expect(row('elemental_dmg')).toBeUndefined();
    expect(sheet.weapon).toMatchObject({ subStat: 'crit_dmg' });
  });

  it('reads stats at the exact level: 80 before and after ascending', () => {
    const at = (ascension: number) =>
      characterSheet(d, {
        characterKey: 'furina',
        level: 80,
        ascension,
        artifacts: [],
      })!.rows.find((r) => r.stat === 'hp')!.base;
    expect(at(6)).toBeGreaterThan(at(5));
  });

  it('is null for a character the details don’t know', () => {
    expect(
      characterSheet(d, { characterKey: 'nobody', level: 90, artifacts: [] }),
    ).toBeNull();
  });
});

describe('texts (TODO 9.10)', () => {
  it('has every set’s effects in the details', () => {
    const sets = genshinAdapter.sets().map((s) => s.key);
    expect(sets.filter((k) => !d.sets[k]?.two)).toEqual([]);
    expect(d.sets.GoldenTroupe.two).toBe(
      'Increases Elemental Skill DMG by 20%.',
    );
  });

  it('loads one character’s talents and constellations', async () => {
    const t = (await loadCharacterTexts('furina'))!;
    expect(t.talents.map((x) => x?.name)).toEqual(d.characters.furina.talents);
    expect(t.constellations).toHaveLength(6);
    expect(t.talents[1]!.description).not.toMatch(/<|\{/);
    expect(await loadCharacterTexts('nobody')).toBeNull();
    expect(await loadCharacterTexts('../details.generated')).toBeNull();
  });

  it('writes a talent’s values in the game’s formats at a level', async () => {
    const t = (await loadCharacterTexts('furina'))!;
    const at = (lvl: number) =>
      Object.fromEntries(
        talentValues(t.talents[1]!, lvl).map((v) => [v.label, v.value]),
      );
    expect(at(1)['Ousia Bubble DMG']).toBe('7.9% Max HP');
    expect(at(10)['Ousia Bubble DMG']).toBe('14.2% Max HP');
    expect(at(10)['Duration']).toBe('30.0s');
    // Clamped to the 15 levels there are.
    expect(at(20)).toEqual(at(15));
    expect(
      talentValues(
        {
          name: 'x',
          description: '',
          labels: ['A|{param9:I}', 'B|{param1:P}'],
          params: { param1: [0.484] },
        },
        1,
      ),
    ).toEqual([
      { label: 'A', value: '?' },
      { label: 'B', value: '48%' },
    ]);
  });

  it('has texts for every character', async () => {
    const missing: string[] = [];
    for (const c of genshinAdapter.characters())
      if (!(await loadCharacterTexts(c.key))) missing.push(c.key);
    expect(missing).toEqual([]);
  });
});
