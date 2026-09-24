import { describe, it, expect } from 'vitest';
import {
  isPersistedArtifact,
  MAX_KEY_LEN,
  validateArtifactDraft,
} from './artifactValidation';

describe('validateArtifactDraft', () => {
  // NaN and Infinity fail every comparison, so the range check below can't see
  // them; each importer used to carry its own duplicate guard.
  it.each([NaN, Infinity, -Infinity])(
    'rejects a non-finite level (%s)',
    (level) => {
      expect(
        validateArtifactDraft({ mainStat: 'atk_pct', level, subStats: [] }),
      ).toMatch(/Level/);
    },
  );

  it('accepts level 0 — an unlevelled artifact is a real artifact', () => {
    expect(
      validateArtifactDraft({ mainStat: 'atk_pct', level: 0, subStats: [] }),
    ).toBeNull();
  });

  it('rejects >4 sub-stats', () => {
    const err = validateArtifactDraft({
      mainStat: 'atk_pct',
      level: 20,
      subStats: [
        { key: 'crit_rate', value: 1 },
        { key: 'crit_dmg', value: 1 },
        { key: 'em', value: 1 },
        { key: 'hp', value: 1 },
        { key: 'def', value: 1 },
      ],
    });
    expect(err).toBe(
      'An artifact can have at most 4 sub-stats, none matching the main stat.',
    );
  });

  it('rejects a sub-stat equal to the main stat', () => {
    const err = validateArtifactDraft({
      mainStat: 'atk_pct',
      level: 20,
      subStats: [{ key: 'atk_pct', value: 5 }],
    });
    expect(err).toBe(
      'An artifact can have at most 4 sub-stats, none matching the main stat.',
    );
  });

  it('rejects a repeated sub-stat key', () => {
    // Duplicates are rendered keyed by stat (BuildCard), so they collide as
    // React keys as well as being an impossible roll.
    const err = validateArtifactDraft({
      mainStat: 'atk_pct',
      level: 20,
      subStats: [
        { key: 'crit_rate', value: 3 },
        { key: 'crit_rate', value: 4 },
      ],
    });
    expect(err).toBe('Each sub-stat can appear only once.');
  });

  it('rejects level out of range', () => {
    const err = validateArtifactDraft({
      mainStat: 'atk_pct',
      level: 21,
      subStats: [],
    });
    expect(err).toBe('Level must be between 0 and 20.');
  });

  it('accepts a valid draft', () => {
    const err = validateArtifactDraft({
      mainStat: 'atk_pct',
      level: 20,
      subStats: [{ key: 'crit_dmg', value: 14 }],
    });
    expect(err).toBeNull();
  });
});

describe('isPersistedArtifact', () => {
  const ok = {
    id: 'a1',
    setKey: 'EmblemOfSeveredFate',
    slot: 'sands',
    rarity: 5,
    level: 20,
    mainStat: 'atk_pct',
    mainStatValue: 46.6,
    subStats: [{ key: 'crit_dmg', value: 14 }],
  };

  it('accepts a well-formed piece', () => {
    expect(isPersistedArtifact(ok)).toBe(true);
  });

  // An unlevelled artifact is a real artifact — the player just hasn't spent
  // on it yet, and a falsy-level guard would have thrown it away.
  it('accepts a level 0 piece', () => {
    expect(isPersistedArtifact({ ...ok, level: 0 })).toBe(true);
  });

  it.each([
    ['a non-object', 42],
    ['a missing id', { ...ok, id: '' }],
    ['an unknown slot', { ...ok, slot: 'backpack' }],
    ['a NaN level', { ...ok, level: NaN }],
    ['an out-of-range level', { ...ok, level: 21 }],
    ['an unknown main stat', { ...ok, mainStat: 'luck' }],
    ['a non-array subStats', { ...ok, subStats: 'none' }],
    [
      'a sub-stat duplicating the main stat',
      {
        ...ok,
        subStats: [{ key: 'atk_pct', value: 5 }],
      },
    ],
    ['an element on a non-goblet', { ...ok, element: 'pyro' }],
    ['an over-long setKey', { ...ok, setKey: 'x'.repeat(MAX_KEY_LEN + 1) }],
  ])('rejects %s', (_label, value) => {
    expect(isPersistedArtifact(value)).toBe(false);
  });

  it('accepts an element on an elemental_dmg goblet', () => {
    expect(
      isPersistedArtifact({
        ...ok,
        slot: 'goblet',
        mainStat: 'elemental_dmg',
        element: 'pyro',
      }),
    ).toBe(true);
  });
});
