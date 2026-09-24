import { describe, it, expect } from 'vitest';
import { artifactHash, mergeNew } from './dedupe';
import type { Artifact } from '../game/types';

const base: Artifact = {
  id: 'x',
  setKey: 'EmblemOfSeveredFate',
  slot: 'sands',
  rarity: 5,
  level: 20,
  mainStat: 'atk_pct',
  mainStatValue: 46.6,
  subStats: [{ key: 'crit_dmg', value: 14 }],
};

describe('artifactHash', () => {
  it('is identical for the same content regardless of id', () => {
    expect(artifactHash(base)).toBe(artifactHash({ ...base, id: 'different' }));
  });

  it('differs when a sub-stat value differs', () => {
    expect(artifactHash(base)).not.toBe(
      artifactHash({ ...base, subStats: [{ key: 'crit_dmg', value: 15 }] }),
    );
  });

  it('is identical regardless of the order sub-stats were recorded in', () => {
    // Exercises the sort comparator (dedupe.ts:13), which never runs a real
    // comparison when a piece has 0-1 substats — GOOD exports and hand-built
    // fixtures elsewhere in the suite happen to only use one. A real 4-line
    // piece must hash the same no matter what order Enka/GOOD emitted its
    // substats in, or re-importing the same piece would wrongly look new.
    const multiA: Artifact = {
      ...base,
      subStats: [
        { key: 'crit_dmg', value: 14 },
        { key: 'atk_pct', value: 5.8 },
        { key: 'crit_rate', value: 3.5 },
      ],
    };
    const multiB: Artifact = {
      ...base,
      subStats: [
        { key: 'crit_rate', value: 3.5 },
        { key: 'crit_dmg', value: 14 },
        { key: 'atk_pct', value: 5.8 },
      ],
    };
    expect(artifactHash(multiA)).toBe(artifactHash(multiB));
  });
});

describe('mergeNew', () => {
  it('drops incoming pieces whose content already exists (ignoring id)', () => {
    const existing = [base];
    const incoming = [{ ...base, id: 'dup' }];
    expect(mergeNew(existing, incoming)).toEqual([]);
  });

  it('keeps incoming pieces with distinct content', () => {
    const distinct: Artifact = { ...base, id: 'y', slot: 'goblet' };
    expect(mergeNew([base], [distinct])).toEqual([distinct]);
  });

  it('dedups against every existing piece, not just the first', () => {
    const a2: Artifact = { ...base, id: 'a2', slot: 'circlet' };
    const incoming = [
      { ...base, id: 'dup' },
      { ...a2, id: 'dup2' },
    ];
    expect(mergeNew([base, a2], incoming)).toEqual([]);
  });

  it('returns all incoming when existing is empty', () => {
    expect(mergeNew([], [base])).toEqual([base]);
  });

  // Contract: mergeNew filters incoming against `existing` only — it does NOT
  // dedup within the incoming batch. Matches the pre-refactor behaviour; GOOD
  // exports carry unique pieces so this is not exercised in practice.
  it('keeps intra-batch content duplicates (no within-incoming dedup)', () => {
    const dup: Artifact = { ...base, id: 'dup' };
    expect(mergeNew([], [base, dup])).toEqual([base, dup]);
  });
});
