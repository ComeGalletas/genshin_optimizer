import { describe, it, expect } from 'vitest';
import { normalizeGOOD } from './normalize';
import { goodCharacterKey, toGOOD, toGOODAccount } from './export';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import { simulatePlay } from '../test-fixtures/simulatePlay';
import type { SnapshotPiece } from '../merge/merge';

const withoutIds = (ps: readonly SnapshotPiece[]) =>
  ps.map((p) => ({
    ...p,
    artifact: { ...p.artifact, id: '' },
  }));
/** Normalized entries as snapshot pieces (without their file index). */
const pieces = (ps: ReturnType<typeof normalizeGOOD>): SnapshotPiece[] =>
  ps!.artifacts!.map((e) => {
    const p: Partial<typeof e> = { ...e };
    delete p.index;
    return p as SnapshotPiece;
  });

describe('toGOOD', () => {
  it('writes GOOD character keys', () => {
    expect(goodCharacterKey('raiden_shogun')).toBe('RaidenShogun');
    expect(goodCharacterKey('furina')).toBe('Furina');
  });

  it('round-trips through normalizeGOOD, extras included', () => {
    const sample = pieces(normalizeGOOD(loadSampleGOOD()));
    // New drops carry first rolls, roll counts and unactivated lines.
    const { after } = simulatePlay(
      sample,
      { upgrades: 5, moves: 5, locks: 5, consumed: 0, drops: 40 },
      3,
    );
    const back = normalizeGOOD(toGOOD(after, 'Irminsul'))!;
    expect(back.issues).toEqual([]);
    expect(back.source).toBe('Irminsul');
    expect(withoutIds(pieces(back))).toEqual(withoutIds(after));
  });
});

describe('toGOODAccount', () => {
  it('round-trips a whole account: artifacts, roster and weapons', () => {
    const good = normalizeGOOD(loadSampleGOOD())!;
    expect(Object.keys(good.roster).length).toBeGreaterThan(0);
    expect(good.weapons.length).toBeGreaterThan(0);
    const out = toGOODAccount(
      { pieces: pieces(good), roster: good.roster, weapons: good.weapons },
      'genshin-build-lab',
    );
    const back = normalizeGOOD(out)!;
    expect(back.issues).toEqual([]);
    expect(back.source).toBe('genshin-build-lab');
    expect(withoutIds(pieces(back))).toEqual(withoutIds(pieces(good)));
    expect(back.roster).toEqual(good.roster);
    expect(back.weapons).toEqual(good.weapons);
  });

  it('keeps a roster entry that only an equipped weapon implies', () => {
    const out = toGOODAccount(
      {
        pieces: [],
        roster: { furina: { weaponKey: 'splendor_of_tranquil_waters' } },
        weapons: [
          { index: 0, key: 'splendor_of_tranquil_waters', location: 'furina' },
        ],
      },
      'x',
    );
    expect(out.characters).toEqual([{ key: 'Furina' }]);
    expect(normalizeGOOD(out)!.roster).toEqual({
      furina: { weaponKey: 'splendor_of_tranquil_waters' },
    });
  });
});
