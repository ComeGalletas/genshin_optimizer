import { describe, it, expect } from 'vitest';
import { parseGOOD, parseGOODRoster } from './good';

const goodFile = {
  format: 'GOOD',
  version: 2,
  source: 'test',
  artifacts: [
    {
      setKey: 'EmblemOfSeveredFate',
      slotKey: 'sands',
      rarity: 5,
      level: 20,
      mainStatKey: 'atk_',
      substats: [
        { key: 'critDMG_', value: 14 },
        { key: 'critRate_', value: 7 },
      ],
    },
  ],
};

describe('parseGOOD', () => {
  it('rejects non-GOOD input', () => {
    expect(parseGOOD({ foo: 1 })).toEqual({ error: 'BAD_FORMAT' });
  });

  it('skips malformed (null/primitive) array elements, keeping the valid one', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [null, 'garbage', goodFile.artifacts[0]],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(1);
    expect(arr[0].setKey).toBe('EmblemOfSeveredFate'); // the valid element survived
  });

  it('tolerates a non-array substats field instead of throwing', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [{ ...goodFile.artifacts[0], substats: 'not-an-array' }],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(1);
    expect(arr[0].subStats).toEqual([]);
  });

  it.each([
    ['a non-string setKey', 42],
    ['an empty setKey', ''],
    ['an over-long setKey', 'x'.repeat(129)],
  ])('skips an artifact with %s', (_label, setKey) => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [{ ...goodFile.artifacts[0], setKey }],
    });
    expect(out).toEqual([]);
  });

  it('skips an artifact carrying duplicate substat keys', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [
        {
          ...goodFile.artifacts[0],
          substats: [
            { key: 'critRate_', value: 3 },
            { key: 'critRate_', value: 4 },
          ],
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it('maps a GOOD artifact to our Artifact shape', () => {
    const out = parseGOOD(goodFile);
    expect(Array.isArray(out)).toBe(true);
    const arr = out as import('../game/types').Artifact[];
    expect(arr[0].setKey).toBe('EmblemOfSeveredFate');
    expect(arr[0].slot).toBe('sands');
    expect(arr[0].mainStat).toBe('atk_pct');
    expect(arr[0].subStats).toContainEqual({ key: 'crit_dmg', value: 14 });
  });

  it('skips an artifact with a non-numeric rarity', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [{ ...goodFile.artifacts[0], rarity: 'five' }],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(0);
  });

  it('skips an artifact with a rarity outside 4|5', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [{ ...goodFile.artifacts[0], rarity: 3 }],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(0);
  });

  it('skips an artifact with a non-finite level', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [{ ...goodFile.artifacts[0], level: NaN }],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(0);
  });

  it('skips an artifact with a level outside 0..20', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [{ ...goodFile.artifacts[0], level: 999 }],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(0);
  });

  it('drops a substat with a non-finite value, keeping the rest of the artifact', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [
        {
          ...goodFile.artifacts[0],
          substats: [
            { key: 'critDMG_', value: NaN },
            { key: 'critRate_', value: 7 },
          ],
        },
      ],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(1);
    expect(arr[0].subStats).toEqual([{ key: 'crit_rate', value: 7 }]);
  });

  it('skips an artifact whose sub-stats include the main stat', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [
        {
          ...goodFile.artifacts[0], // mainStatKey 'atk_' -> atk_pct
          substats: [{ key: 'atk_', value: 10 }],
        },
      ],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(0);
  });

  it('skips an artifact with more than 4 sub-stats', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [
        {
          ...goodFile.artifacts[0],
          substats: [
            { key: 'critDMG_', value: 1 },
            { key: 'critRate_', value: 1 },
            { key: 'hp_', value: 1 },
            { key: 'def_', value: 1 },
            { key: 'eleMas', value: 1 },
          ],
        },
      ],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(0);
  });

  it('tolerates null/primitive substat elements instead of throwing', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [
        {
          ...goodFile.artifacts[0],
          substats: [null, 5, { key: 'critRate_', value: 7 }],
        },
      ],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(1);
    expect(arr[0].subStats).toEqual([{ key: 'crit_rate', value: 7 }]);
  });

  it('rejects a GOOD file whose artifacts array is oversized', () => {
    const artifacts = Array.from({ length: 4001 }, () => goodFile.artifacts[0]);
    expect(parseGOOD({ format: 'GOOD', artifacts })).toEqual({
      error: 'BAD_FORMAT',
    });
  });

  it('accepts a GOOD file at exactly the array size cap', () => {
    const artifacts = Array.from({ length: 4000 }, () => goodFile.artifacts[0]);
    const out = parseGOOD({ format: 'GOOD', artifacts });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(4000);
  });

  it('captures the element of an elemental_dmg goblet (ADR-0014)', () => {
    const out = parseGOOD({
      format: 'GOOD',
      artifacts: [
        {
          ...goodFile.artifacts[0],
          slotKey: 'goblet',
          mainStatKey: 'pyro_dmg_',
        },
      ],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr[0].mainStat).toBe('elemental_dmg');
    expect(arr[0].element).toBe('pyro');
  });

  it('leaves element unset for a non-elemental-dmg main stat', () => {
    const out = parseGOOD(goodFile); // mainStatKey 'atk_'
    const arr = out as import('../game/types').Artifact[];
    expect(arr[0].element).toBeUndefined();
  });

  it('still parses artifacts unaffected when characters/weapons arrays are also present', () => {
    const out = parseGOOD({
      ...goodFile,
      characters: [{ key: 'RaidenShogun', ascension: 6 }],
      weapons: [{ key: 'TheCatch', location: 'RaidenShogun' }],
    });
    const arr = out as import('../game/types').Artifact[];
    expect(arr.length).toBe(1);
    expect(arr[0].setKey).toBe('EmblemOfSeveredFate');
  });
});

describe('parseGOODRoster', () => {
  it('returns {} for non-GOOD input', () => {
    expect(parseGOODRoster({ foo: 1 })).toEqual({});
    expect(parseGOODRoster(null)).toEqual({});
  });

  it('returns {} for a GOOD file with no characters/weapons arrays', () => {
    expect(parseGOODRoster(goodFile)).toEqual({});
  });

  it('matches a character key and derives build level from ascension', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      characters: [{ key: 'RaidenShogun', ascension: 6 }],
    });
    expect(out['raiden_shogun']).toEqual({ buildLevel: 90 });
  });

  it('maps ascension to the correct level cap across the range', () => {
    const asc = (n: number) =>
      parseGOODRoster({
        format: 'GOOD',
        characters: [{ key: 'RaidenShogun', ascension: n }],
      })['raiden_shogun'].buildLevel;
    expect(asc(0)).toBe(20);
    expect(asc(5)).toBe(80);
    expect(asc(6)).toBe(90);
  });

  it('omits buildLevel for out-of-range or non-numeric ascension', () => {
    const noLevel = (ascension: unknown) =>
      parseGOODRoster({
        format: 'GOOD',
        characters: [{ key: 'RaidenShogun', ascension }],
      })['raiden_shogun'];
    expect(noLevel(7)).toEqual({});
    expect(noLevel('x')).toEqual({});
    expect(noLevel(undefined)).toEqual({});
  });

  it('resolves an equipped weapon via location, including apostrophe keys', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      weapons: [{ key: 'AmosBow', location: 'RaidenShogun' }],
    });
    expect(out['raiden_shogun']).toEqual({ weaponKey: "amos'_bow" });
  });

  it('resolves TheCatch to the_catch', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      weapons: [{ key: 'TheCatch', location: 'RaidenShogun' }],
    });
    expect(out['raiden_shogun'].weaponKey).toBe('the_catch');
  });

  it('ignores unequipped weapons (empty location)', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      weapons: [{ key: 'TheCatch', location: '' }],
    });
    expect(out).toEqual({});
  });

  it('creates an entry for a weapon equipped on a character absent from characters[]', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      weapons: [{ key: 'TheCatch', location: 'RaidenShogun' }],
    });
    expect(out['raiden_shogun']).toEqual({ weaponKey: 'the_catch' });
  });

  it('skips an unresolvable character key (TravelerAnemo) without throwing', () => {
    expect(() =>
      parseGOODRoster({
        format: 'GOOD',
        characters: [{ key: 'TravelerAnemo', ascension: 6 }],
      }),
    ).not.toThrow();
    const out = parseGOODRoster({
      format: 'GOOD',
      characters: [{ key: 'TravelerAnemo', ascension: 6 }],
    });
    expect(out).toEqual({});
  });

  it('tolerates malformed array elements (null/primitive) without throwing', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      characters: [null, 'garbage', { key: 'RaidenShogun', ascension: 6 }],
      weapons: [null, 42, { key: 'TheCatch', location: 'RaidenShogun' }],
    });
    expect(out['raiden_shogun']).toEqual({
      buildLevel: 90,
      weaponKey: 'the_catch',
    });
  });

  it('combines a character and its equipped weapon into one entry', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      characters: [{ key: 'RaidenShogun', ascension: 6 }],
      weapons: [{ key: 'TheCatch', location: 'RaidenShogun' }],
    });
    expect(out['raiden_shogun']).toEqual({
      buildLevel: 90,
      weaponKey: 'the_catch',
    });
  });
});

describe('parseGOODRoster — richer entries (v2)', () => {
  it('captures level, constellation, talents and weapon refinement', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      characters: [
        {
          key: 'Neuvillette',
          level: 90,
          constellation: 0,
          ascension: 6,
          talent: { auto: 9, skill: 9, burst: 9 },
        },
      ],
      weapons: [
        {
          key: 'SplendorOfTranquilWaters',
          level: 90,
          refinement: 1,
          location: 'Neuvillette',
        },
      ],
    });
    expect(out['neuvillette']).toEqual({
      buildLevel: 90,
      level: 90,
      constellation: 0,
      talents: { auto: 9, skill: 9, burst: 9 },
      weaponKey: 'splendor_of_tranquil_waters',
      weaponLevel: 90,
    });
  });

  it('drops malformed fields one by one, still creating the entry', () => {
    const out = parseGOODRoster({
      format: 'GOOD',
      characters: [
        {
          key: 'Neuvillette',
          level: '90',
          constellation: 9,
          talent: { auto: 99, skill: 9, burst: 9 },
        },
      ],
    });
    expect(out['neuvillette']).toEqual({});
  });
});

describe('parseGOOD — artifact location (v2)', () => {
  const withLocation = (location: unknown) =>
    parseGOOD({
      ...goodFile,
      artifacts: [{ ...goodFile.artifacts[0], location }],
    });

  it('resolves an equipped artifact to a dataset character key', () => {
    const out = withLocation('Neuvillette');
    expect(Array.isArray(out)).toBe(true);
    expect((out as { location?: string }[])[0].location).toBe('neuvillette');
  });

  it('leaves location undefined when empty, missing or unresolvable', () => {
    for (const loc of ['', undefined, 'NotACharacter', 42]) {
      const out = withLocation(loc) as { location?: string }[];
      expect(out[0].location).toBeUndefined();
    }
  });
});
