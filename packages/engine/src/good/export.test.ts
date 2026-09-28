import { describe, it, expect } from 'vitest';
import { normalizeGOOD } from './normalize';
import { goodCharacterKey, toGOOD } from './export';
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
