import { describe, it, expect } from 'vitest';
import type { Artifact, SubStat } from '../game/types';
import type { SnapshotPiece } from '../merge/merge';
import { normalizeGOOD } from '../good/normalize';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import {
  simulatePlay,
  withoutRollData,
  type PlayTruth,
} from '../test-fixtures/simulatePlay';
import { couldBeUpgrade, diffSnapshots, type ImportDiff } from './diff';

const sub = (key: SubStat['key'], value: number): SubStat => ({ key, value });
const piece = (
  over: Partial<Artifact> = {},
  extra: Partial<SnapshotPiece> = {},
): SnapshotPiece => ({
  artifact: {
    id: 'x',
    setKey: 'EmblemOfSeveredFate',
    slot: 'sands',
    rarity: 5,
    level: 0,
    mainStat: 'atk_pct',
    mainStatValue: 7,
    subStats: [sub('crit_rate', 3.9), sub('hp', 299), sub('def', 23)],
    ...over,
  },
  ...extra,
});

describe('couldBeUpgrade', () => {
  const fresh = piece({}, { unactivated: sub('crit_dmg', 7) });
  // +0 → +8: activation at +4, then one random roll (here on crit rate).
  const at8 = piece({
    level: 8,
    subStats: [
      sub('crit_rate', 7.4),
      sub('hp', 299),
      sub('def', 23),
      sub('crit_dmg', 7),
    ],
  });

  it('accepts gains the upgrades in between can roll', () => {
    expect(couldBeUpgrade(fresh, at8)).toBe(true);
    // Without the unactivated line, its value is one more roll to explain.
    expect(couldBeUpgrade(piece(), at8)).toBe(true);
  });

  it('rejects what the rolls cannot make', () => {
    const tooMuch = piece({
      ...at8.artifact,
      subStats: [
        sub('crit_rate', 11.3), // two rolls' worth; only one was available
        sub('hp', 299),
        sub('def', 23),
        sub('crit_dmg', 7),
      ],
    });
    expect(couldBeUpgrade(fresh, tooMuch)).toBe(false);
    const wrongLine = piece({
      ...at8.artifact,
      subStats: [...at8.artifact.subStats.slice(0, 3), sub('atk_pct', 5.8)],
    });
    expect(couldBeUpgrade(fresh, wrongLine)).toBe(false);
    expect(couldBeUpgrade(fresh, piece({ ...at8.artifact, level: 3 }))).toBe(
      false,
    );
    expect(
      couldBeUpgrade(fresh, piece({ ...at8.artifact, setKey: 'GoldenTroupe' })),
    ).toBe(false);
  });
});

describe('diffSnapshots', () => {
  it('reports a move, a lock change, a new and a gone piece', () => {
    const a = piece({ location: 'furina' }, { lock: true });
    const gone = piece({ slot: 'flower', mainStat: 'hp' });
    const moved = piece({ location: 'chevreuse' }, { lock: false });
    const drop = piece({ slot: 'circlet', mainStat: 'crit_rate' });
    const d = diffSnapshots([a, gone], [drop, moved]);
    expect(d).toEqual({
      added: [0],
      removed: [1],
      upgraded: [],
      moved: [{ before: 0, after: 1, from: 'furina', to: 'chevreuse' }],
      lockChanged: [{ before: 0, after: 1, lock: false }],
      unchanged: 0,
      unexplained: [],
    });
  });

  it('pairs one of two identical pieces with its upgrade', () => {
    // Identical +0 pieces are interchangeable: either one will do.
    const twin = piece({}, { unactivated: sub('crit_dmg', 7) });
    const at4 = piece({
      level: 4,
      subStats: [...twin.artifact.subStats, sub('crit_dmg', 7)],
    });
    const d = diffSnapshots([twin, twin], [twin, at4]);
    expect(d.upgraded).toEqual([{ before: 1, after: 1, by: 'rolls' }]);
  });

  it('leaves a piece that two different pieces could have become unpaired', () => {
    // From crit rate 3.9 (+3.5) or from 3.5 (+3.9): both are one roll.
    const a = piece({}, { unactivated: sub('crit_dmg', 7) });
    const b = piece(
      { subStats: [sub('crit_rate', 3.5), sub('hp', 299), sub('def', 23)] },
      { unactivated: sub('crit_dmg', 7) },
    );
    const at8 = piece({
      level: 8,
      subStats: [
        sub('crit_rate', 7.4),
        sub('hp', 299),
        sub('def', 23),
        sub('crit_dmg', 7),
      ],
    });
    const d = diffSnapshots([a, b], [at8]);
    expect(d.upgraded).toEqual([]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([0, 1]);
    expect(d.unexplained).toEqual([
      {
        after: 0,
        why: expect.stringMatching(/new, or an upgrade of one of 2/),
      },
    ]);
  });

  it('tells two same-shape pieces apart by their first rolls', () => {
    const first = (p: SnapshotPiece) =>
      Object.fromEntries(
        [...p.artifact.subStats, p.unactivated!].map((s) => [s.key, s.value]),
      );
    const gone = piece({}, { unactivated: sub('crit_dmg', 7) });
    const drop = piece(
      { subStats: [sub('crit_rate', 2.7), sub('hp', 209), sub('def', 16)] },
      { unactivated: sub('crit_dmg', 5.4) },
    );
    // Without first rolls, a misread can't be ruled out.
    expect(diffSnapshots([gone], [drop]).unexplained).toHaveLength(1);
    const d = diffSnapshots(
      [{ ...gone, extras: { initialValues: first(gone) } }],
      [{ ...drop, extras: { initialValues: first(drop) } }],
    );
    expect(d).toMatchObject({ added: [0], removed: [0], unexplained: [] });
  });
});

// Simulated play on a synthetic account: the diff must recover exactly what
// the simulation did.
describe('diff against simulated play', () => {
  const sample = normalizeGOOD(loadSampleGOOD())!.artifacts!;
  // A bigger account: the sample plus 400 new drops shaped like its pieces.
  const account = simulatePlay(
    sample,
    { upgrades: 0, moves: 0, locks: 0, consumed: 0, drops: 400 },
    11,
  ).after;
  const counts = {
    upgrades: 40,
    moves: 25,
    locks: 20,
    consumed: 60,
    drops: 50,
  };
  const pairs = (xs: { before: number; after: number }[]) =>
    xs.map((x) => [x.before, x.after]).sort((p, q) => p[0] - q[0]);
  /** The diff must match the truth. Without first rolls, a consumed piece
   *  and a new drop of the same shape may stay unexplained (a misread can't
   *  be ruled out), but nothing may be paired wrongly. */
  const expectExact = (
    d: ImportDiff,
    t: PlayTruth,
    allowUnexplained = false,
  ) => {
    const doubt = d.unexplained;
    if (!allowUnexplained) expect(doubt).toEqual([]);
    for (const u of doubt) {
      expect(t.removed).toContain(u.before);
      expect(t.added).toContain(u.after);
    }
    const outB = new Set(doubt.map((u) => u.before));
    const outA = new Set(doubt.map((u) => u.after));
    expect(pairs(d.upgraded)).toEqual(t.upgraded);
    expect([...d.added].sort((a, b) => a - b)).toEqual(
      t.added.filter((j) => !outA.has(j)),
    );
    expect(d.removed).toEqual(t.removed.filter((i) => !outB.has(i)));
    expect(pairs(d.moved)).toEqual(t.moved);
    expect(pairs(d.lockChanged)).toEqual(t.lockChanged);
  };

  it.each([1, 2, 3])('recovers it exactly with first rolls (seed %i)', (s) => {
    const { after, truth } = simulatePlay(account, counts, s);
    const d = diffSnapshots(account, after);
    expectExact(d, truth);
    // Pieces with first rolls pair by them; the sample's own pieces have none.
    for (const u of d.upgraded)
      expect(u.by).toBe(account[u.before].extras ? 'first-rolls' : 'rolls');
  });

  it.each([1, 2, 3])(
    'recovers it exactly from values alone, as an OCR scan (seed %i)',
    (s) => {
      const { after, truth } = simulatePlay(account, counts, s);
      const d = diffSnapshots(withoutRollData(account), withoutRollData(after));
      expectExact(d, truth, true);
      expect(d.upgraded.every((u) => u.by === 'rolls')).toBe(true);
    },
  );
});
