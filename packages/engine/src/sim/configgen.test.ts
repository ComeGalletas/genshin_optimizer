import { describe, it, expect } from 'vitest';
import type { Artifact } from '../game/types';
import {
  gcsimConfig,
  gcsimName,
  gcsimSets,
  gcsimStats,
  type SimCharacter,
} from './configgen';

const piece = (p: Partial<Artifact>): Artifact => ({
  id: 'x',
  setKey: 'GoldenTroupe',
  slot: 'flower',
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 4780,
  subStats: [],
  ...p,
});

describe('gcsimName', () => {
  it('lowercases and drops everything but letters and digits', () => {
    expect(gcsimName('raiden_shogun')).toBe('raidenshogun');
    expect(gcsimName('kaedehara_kazuha')).toBe('kaedeharakazuha');
    expect(gcsimName("wolf's_gravestone")).toBe('wolfsgravestone');
    expect(gcsimName('GoldenTroupe')).toBe('goldentroupe');
    expect(gcsimName('ScrollOfTheHeroOfCinderCity')).toBe(
      'scrolloftheheroofcindercity',
    );
  });
});

describe('gcsimStats: the one unit change (ADR-0023)', () => {
  it('sums every line, flat stats as they are, percent stats as fractions', () => {
    const stats = new Map(
      gcsimStats([
        piece({
          mainStat: 'hp',
          mainStatValue: 4780,
          subStats: [
            { key: 'crit_rate', value: 3.9 },
            { key: 'crit_dmg', value: 7.8 },
          ],
        }),
        piece({
          slot: 'plume',
          mainStat: 'atk',
          mainStatValue: 311,
          subStats: [
            { key: 'crit_rate', value: 10.5 },
            { key: 'em', value: 23 },
            { key: 'er_pct', value: 5.2 },
          ],
        }),
        piece({
          slot: 'circlet',
          mainStat: 'crit_rate',
          mainStatValue: 31.1,
          subStats: [{ key: 'hp_pct', value: 9.9 }],
        }),
      ]),
    );
    expect(stats).toEqual(
      new Map([
        ['hp', 4780],
        ['cr', 0.455], // 3.9 + 10.5 + 31.1, in fractions
        ['cd', 0.078],
        ['atk', 311],
        ['em', 23],
        ['er', 0.052],
        ['hp%', 0.099],
      ]),
    );
  });

  it('routes Elemental DMG to the goblet’s element, and names physical and healing gcsim’s way', () => {
    expect(
      gcsimStats([
        piece({
          slot: 'goblet',
          mainStat: 'elemental_dmg',
          mainStatValue: 46.6,
          element: 'hydro',
        }),
      ]),
    ).toEqual([['hydro%', 0.466]]);
    // An off-element goblet stays its own element: useless in gcsim too.
    expect(
      gcsimStats([
        piece({
          slot: 'goblet',
          mainStat: 'elemental_dmg',
          mainStatValue: 46.6,
          element: 'pyro',
        }),
      ]),
    ).toEqual([['pyro%', 0.466]]);
    expect(
      gcsimStats([
        piece({
          slot: 'goblet',
          mainStat: 'physical_dmg',
          mainStatValue: 58.3,
        }),
        piece({ slot: 'circlet', mainStat: 'healing', mainStatValue: 35.9 }),
      ]),
    ).toEqual([
      ['phys%', 0.583],
      ['heal', 0.359],
    ]);
    expect(() =>
      gcsimStats([
        piece({
          slot: 'goblet',
          mainStat: 'elemental_dmg',
          mainStatValue: 46.6,
        }),
      ]),
    ).toThrow(/needs its element/);
  });

  it('leaves no binary noise in the numbers', () => {
    const [[, cr]] = gcsimStats([
      piece({ mainStat: 'crit_rate', mainStatValue: 0.1 }),
      piece({ slot: 'plume', mainStat: 'crit_rate', mainStatValue: 0.2 }),
    ]);
    expect(String(cr)).toBe('0.003');
  });
});

describe('gcsimSets', () => {
  it('counts the pieces of each set, keeping 2 or more, in gcsim names', () => {
    expect(
      gcsimSets([
        piece({ setKey: 'GoldenTroupe' }),
        piece({ setKey: 'GoldenTroupe' }),
        piece({ setKey: 'GoldenTroupe' }),
        piece({ setKey: 'GoldenTroupe' }),
        piece({ setKey: 'GildedDreams' }),
      ]),
    ).toEqual([['goldentroupe', 4]]);
    expect(
      gcsimSets([
        piece({ setKey: 'MarechausseeHunter' }),
        piece({ setKey: 'MarechausseeHunter' }),
        piece({ setKey: 'GoldenTroupe' }),
        piece({ setKey: 'GoldenTroupe' }),
      ]),
    ).toEqual([
      ['goldentroupe', 2],
      ['marechausseehunter', 2],
    ]);
  });
});

describe('gcsimConfig', () => {
  const furina: SimCharacter = {
    key: 'furina',
    level: 90,
    maxLevel: 90,
    constellation: 0,
    talents: { auto: 1, skill: 9, burst: 9 },
    weapon: {
      key: 'splendor_of_tranquil_waters',
      level: 90,
      maxLevel: 90,
      refinement: 1,
    },
    artifacts: [
      piece({ subStats: [{ key: 'crit_rate', value: 7 }] }),
      piece({ slot: 'plume', mainStat: 'atk', mainStatValue: 311 }),
    ],
  };

  it('writes the whole config', () => {
    expect(
      gcsimConfig({
        characters: [furina],
        active: 'furina',
        rotation: 'while 1 {\n  furina skill, burst;\n}',
        enemy: { level: 95, res: -20 },
        iterations: 500,
        duration: 120,
      }),
    ).toBe(
      [
        'options iteration=500 duration=120 swap_delay=12;',
        'target lvl=95 resist=-0.2;',
        'energy every interval=480,720 amount=1;',
        '',
        'furina char lvl=90/90 cons=0 talent=1,9,9;',
        'furina add weapon="splendoroftranquilwaters" refine=1 lvl=90/90;',
        'furina add set="goldentroupe" count=2;',
        'furina add stats hp=4780 cr=0.07 atk=311;',
        '',
        'active furina;',
        '',
        'while 1 {\n  furina skill, burst;\n}',
        '',
      ].join('\n'),
    );
  });

  it('defaults: 1000 iterations, 90 s, a level 100 enemy at 10%, and never a target hp', () => {
    const c = gcsimConfig({
      characters: [furina],
      active: 'furina',
      rotation: 'furina attack;',
    });
    expect(c).toMatch(/^options iteration=1000 duration=90 swap_delay=12;$/m);
    expect(c).toMatch(/^target lvl=100 resist=0\.1;$/m);
    // A target hp would make gcsim fight to the death instead (TODO 5.3).
    expect(c).not.toMatch(/^target[^\n]*\bhp=/m);
  });
});
