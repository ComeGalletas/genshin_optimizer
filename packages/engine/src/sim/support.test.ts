import { describe, it, expect } from 'vitest';
import { genshinAdapter } from '../game/genshin/adapter';
import {
  characterSupport,
  GCSIM_SUPPORT,
  setsInPlay,
  unsimulated,
  weaponSupport,
  type GcsimSupportTable,
} from './support';

describe('the probed gcsim support table (TODO 5.9)', () => {
  it('covers every character, weapon and set of the dataset, and nothing else', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(GCSIM_SUPPORT.characters)).toEqual(
      genshinAdapter
        .characters()
        .map((c) => c.key)
        .sort(),
    );
    expect(keys(GCSIM_SUPPORT.weapons)).toEqual(
      genshinAdapter
        .weapons()
        .map((w) => w.key)
        .sort(),
    );
    expect(keys(GCSIM_SUPPORT.sets)).toEqual(
      genshinAdapter
        .sets()
        .map((s) => s.key)
        .sort(),
    );
  });

  it('agrees with what gcsim’s repository holds at the pin (checked 2026-10-05)', () => {
    // Not in internal/characters at v2.48.8, among others.
    expect(characterSupport('sandrone')).toBe('unsupported');
    expect(characterSupport('zibai')).toBe('unsupported');
    // Listed there, and reported incomplete by the binary.
    expect(characterSupport('iansan')).toBe('partial');
    expect(characterSupport('furina')).toBe('full');
    expect(weaponSupport('prized_isshin_blade')).toBe('unsupported');
    expect(weaponSupport('splendor_of_tranquil_waters')).toBe('supported');
    expect(characterSupport('not_a_character')).toBe('unknown');
  });
});

describe('unsimulated', () => {
  const table: GcsimSupportTable = {
    about: '',
    gcsim: 'v9.9.9',
    commit: '',
    characters: { a: 'full', b: 'partial', c: 'unsupported' },
    weapons: { w: 'supported', x: 'unsupported' },
    sets: { S: 'supported', T: 'unsupported' },
  };
  const names = {
    character: (k: string) => k.toUpperCase(),
    weapon: (k: string) => `weapon ${k}`,
    set: (k: string) => `set ${k}`,
  };

  it('one line per thing gcsim lacks; nothing when it has it all', () => {
    expect(
      unsimulated(
        {
          characters: ['a', 'b', 'c', 'new'],
          weapons: ['w', 'x', 'x'],
          sets: ['S', 'T'],
        },
        names,
        table,
      ),
    ).toEqual([
      'gcsim v9.9.9 implements B only partly',
      "gcsim v9.9.9 doesn't implement C",
      "gcsim v9.9.9 doesn't have weapon x",
      "gcsim v9.9.9 doesn't have the set T set",
    ]);
    expect(
      unsimulated({ characters: ['a'], weapons: ['w'] }, names, table),
    ).toEqual([]);
  });

  it('only sets with two or more pieces count', () => {
    expect(
      setsInPlay([
        { setKey: 'S' },
        { setKey: 'S' },
        { setKey: 'T' },
        { setKey: 'U' },
        { setKey: 'U' },
        { setKey: 'U' },
      ]),
    ).toEqual(['S', 'U']);
  });
});
