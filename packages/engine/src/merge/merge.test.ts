import { describe, it, expect } from 'vitest';
import type { Artifact, SubStat } from '../game/types';
import {
  mergeSnapshots,
  reconcile,
  scanFault,
  sourceKind,
  type SnapshotPiece,
  type SourceSnapshot,
} from './merge';
import { mulberry32 } from '../numbers';

const sub = (key: SubStat['key'], value: number): SubStat => ({ key, value });
let id = 0;
const art = (over: Partial<Artifact> = {}): Artifact => ({
  id: String(id++),
  setKey: 'GoldenTroupe',
  slot: 'sands',
  rarity: 5,
  level: 20,
  mainStat: 'hp_pct',
  mainStatValue: 46.6,
  subStats: [
    sub('crit_rate', 9.7),
    sub('er_pct', 11),
    sub('def', 21),
    sub('def_pct', 18.9),
  ],
  ...over,
});
const piece = (
  over: Partial<Artifact> = {},
  extra: Partial<SnapshotPiece> = {},
) => ({
  artifact: art(over),
  ...extra,
});
const snap = (
  id: string,
  kind: SourceSnapshot['kind'],
  takenAt: string,
  pieces: SnapshotPiece[],
): SourceSnapshot => ({ id, kind, takenAt, pieces });

describe('sourceKind', () => {
  it('ranks the exporters this app has seen', () => {
    expect(sourceKind('Irminsul')).toBe('irminsul');
    expect(sourceKind('AdeptiScanner')).toBe('ocr');
    expect(sourceKind('Inventory_Kamera')).toBe('ocr');
    expect(sourceKind('GenshinOptimizer')).toBe('good');
    expect(sourceKind(undefined)).toBe('good');
  });
});

describe('scanFault', () => {
  it('flags 3 copies of a piece, not 2', () => {
    const a = piece();
    expect(scanFault([a, a])).toBeUndefined();
    expect(scanFault([a, a, a, piece({ level: 16 })])).toEqual({
      repeatedPieces: 1,
      extraEntries: 2,
    });
  });
});

describe('reconcile', () => {
  it('pairs exact and fuzzy, and lists moves and pieces on one side only', () => {
    const a = [
      piece({ location: 'furina' }),
      piece({ slot: 'flower', mainStat: 'hp' }),
      piece({ level: 16 }),
    ];
    const b = [
      piece({ subStats: [...art().subStats.slice(0, 3), sub('def_pct', 19)] }),
      piece({ slot: 'flower', mainStat: 'hp', location: 'chevreuse' }),
      piece({ slot: 'circlet', mainStat: 'crit_rate' }),
    ];
    const r = reconcile(a, b);
    expect(r.pairs).toEqual([
      { a: 1, b: 1, kind: 'exact' },
      { a: 0, b: 0, kind: 'fuzzy' },
    ]);
    expect(r.moved).toEqual([
      { a: 1, b: 1 },
      { a: 0, b: 0 },
    ]);
    expect(r.onlyA).toEqual([2]);
    expect(r.onlyB).toEqual([2]);
    expect(r.mismatches).toEqual([]);
  });

  it('reports a same-shape piece too far off as a mismatch, unpaired', () => {
    const far = art({
      subStats: [...art().subStats.slice(0, 3), sub('def_pct', 24.1)],
    });
    const r = reconcile([piece()], [{ artifact: far }]);
    expect(r.pairs).toEqual([]);
    expect(r.mismatches).toEqual([{ a: 0, b: 0, stats: ['def_pct'] }]);
    expect(r.onlyA).toEqual([]);
    expect(r.onlyB).toEqual([]);
  });

  it('pairs a piece levelled in between by its first rolls', () => {
    const first = { crit_rate: 3.9, er_pct: 5.2, def: 21, def_pct: 5.8 };
    const before = piece(
      {
        level: 0,
        subStats: [
          sub('crit_rate', 3.9),
          sub('er_pct', 5.2),
          sub('def', 21),
          sub('def_pct', 5.8),
        ],
      },
      { extras: { initialValues: first } },
    );
    const after = piece({}, { extras: { initialValues: first } });
    expect(reconcile([before], [after]).pairs).toEqual([
      { a: 0, b: 0, kind: 'levelled' },
    ]);
    // Without first rolls on both sides it stays two pieces.
    expect(reconcile([before], [piece()]).pairs).toEqual([]);
  });
});

describe('mergeSnapshots', () => {
  it('takes values from the best source and location from the newest', () => {
    const irm = snap('irm', 'irminsul', '2026-09-27T23:00:00Z', [
      piece({ location: 'sandrone' }, { lock: true }),
    ]);
    const ocr = snap('ocr', 'ocr', '2026-09-28T01:00:00Z', [
      piece(
        {
          location: 'candace',
          subStats: [...art().subStats.slice(0, 3), sub('def_pct', 19)],
        },
        { lock: false },
      ),
    ]);
    const r = mergeSnapshots([ocr, irm]);
    expect(r.artifacts).toHaveLength(1);
    const [m] = r.artifacts;
    expect(m.artifact.subStats.find((s) => s.key === 'def_pct')?.value).toBe(
      18.9,
    );
    expect(m.artifact.location).toBe('candace');
    expect(m).toMatchObject({
      lock: false,
      valuesFrom: 'irm',
      locationFrom: 'ocr',
      seenIn: [
        { snapshot: 'irm', index: 0 },
        { snapshot: 'ocr', index: 0 },
      ],
    });
    expect(r.reports.map((x) => [x.snapshot, x.against])).toEqual([
      ['ocr', ['irm']],
    ]);
  });

  it('keeps the newest location even from a higher-ranked source', () => {
    const irm = snap('irm', 'irminsul', '2026-09-29T00:00:00Z', [
      piece({ location: 'furina' }),
    ]);
    const ocr = snap('ocr', 'ocr', '2026-09-28T00:00:00Z', [
      piece({ location: 'chevreuse' }),
    ]);
    const [m] = mergeSnapshots([ocr, irm]).artifacts;
    expect(m.artifact.location).toBe('furina');
    expect(m.locationFrom).toBe('irm');
  });

  it('keeps the lock when the newer source has none (Enka)', () => {
    const irm = snap('irm', 'irminsul', '2026-09-27T00:00:00Z', [
      piece({}, { lock: true }),
    ]);
    const enka = snap('enka', 'enka', '2026-09-28T00:00:00Z', [
      piece({ location: 'furina' }),
    ]);
    const [m] = mergeSnapshots([irm, enka]).artifacts;
    expect(m).toMatchObject({ lock: true, locationFrom: 'enka' });
  });

  it('takes a levelled piece’s values from the newer reading', () => {
    const first = { crit_rate: 3.9, er_pct: 5.2, def: 21, def_pct: 5.8 };
    const irm = snap('irm', 'irminsul', '2026-09-27T00:00:00Z', [
      piece(
        {
          level: 0,
          subStats: [
            sub('crit_rate', 3.9),
            sub('er_pct', 5.2),
            sub('def', 21),
            sub('def_pct', 5.8),
          ],
        },
        { extras: { initialValues: first } },
      ),
    ]);
    const later = snap('ocr', 'ocr', '2026-09-30T00:00:00Z', [
      piece({}, { extras: { initialValues: first } }),
    ]);
    const [m] = mergeSnapshots([irm, later]).artifacts;
    expect(m.artifact.level).toBe(20);
    expect(m.valuesFrom).toBe('ocr');
  });

  it('rejects a faulty scan instead of merging its repeats', () => {
    const irm = snap('irm', 'irminsul', '2026-09-27T00:00:00Z', [piece()]);
    const stuck = piece({ level: 0 });
    const ocr = snap('ocr', 'ocr', '2026-09-28T00:00:00Z', [
      piece(),
      stuck,
      stuck,
      stuck,
    ]);
    const r = mergeSnapshots([irm, ocr]);
    expect(r.artifacts).toHaveLength(1);
    expect(r.rejected).toEqual([
      { snapshot: 'ocr', fault: { repeatedPieces: 1, extraEntries: 2 } },
    ]);
  });

  // Property: whatever the snapshots, every piece of every merged snapshot
  // lands in exactly one merged artifact (TODO 2.9 widens this).
  it('never loses or double-counts a piece', () => {
    // The engine's seeded PRNG, so the run is reproducible.
    const next = mulberry32(7);
    const rand = (n: number) => Math.floor(next() * n);
    const kinds = ['irminsul', 'ocr', 'good', 'enka'] as const;
    const reached = {
      fuzzy: 0,
      levelled: 0,
      mismatch: 0,
      onlyB: 0,
      rejected: 0,
    };
    for (let round = 0; round < 200; round++) {
      const pool = Array.from({ length: 6 }, () =>
        art({
          level: [0, 4, 20][rand(3)],
          slot: (['flower', 'sands', 'goblet'] as const)[rand(3)],
          subStats: [
            sub('crit_rate', [2.7, 3.1, 3.5, 3.9][rand(4)]),
            sub('crit_dmg', [5.4, 6.2, 7, 7.8][rand(4)]),
            sub('def', 21),
            sub('hp', 299),
          ],
        }),
      );
      // Each snapshot: some of the pool, a few read one shown step off
      // (fuzzy) or further (a mismatch), and sometimes a stuck-scan repeat.
      // Every pool piece's first rolls are its +0 values, so a reading of
      // it levelled to +20 pairs by first-roll key.
      const firstRolls = (a: Artifact) =>
        Object.fromEntries(a.subStats.map((x) => [x.key, x.value]));
      const read = (a: Artifact): SnapshotPiece => {
        const extras =
          a.level === 0 ? { initialValues: firstRolls(a) } : undefined;
        if (extras && rand(4) === 0)
          return {
            artifact: {
              ...a,
              level: 20,
              subStats: a.subStats.map((x) =>
                x.key === 'crit_rate' ? { ...x, value: x.value + 7.8 } : x,
              ),
            },
            extras,
          };
        const bump = [0, 0, 0.1, 2][rand(4)];
        return {
          artifact: bump
            ? {
                ...a,
                subStats: a.subStats.map((x) =>
                  x.key === 'crit_dmg' ? { ...x, value: x.value + bump } : x,
                ),
              }
            : a,
          ...(extras && { extras }),
        };
      };
      const snaps = Array.from({ length: 1 + rand(4) }, (_, s) => {
        const pieces = pool.filter(() => rand(3) > 0).map(read);
        if (pieces.length && rand(8) === 0)
          pieces.push(pieces[0], pieces[0], pieces[0]);
        return snap(
          `s${s}`,
          kinds[rand(4)],
          `2026-09-${String(20 + rand(9))}T00:00:00Z`,
          pieces,
        );
      });
      const r = mergeSnapshots(snaps);
      const merged = snaps.filter(
        (s) => !r.rejected.some((x) => x.snapshot === s.id),
      );
      const seen = r.artifacts.flatMap((a) =>
        a.seenIn.map((x) => `${x.snapshot}#${x.index}`),
      );
      const expected = merged.flatMap((s) =>
        s.pieces.map((_, i) => `${s.id}#${i}`),
      );
      expect(new Set(seen).size).toBe(seen.length);
      expect([...seen].sort()).toEqual([...expected].sort());
      reached.rejected += r.rejected.length;
      for (const { report } of r.reports) {
        reached.fuzzy += report.pairs.filter((p) => p.kind === 'fuzzy').length;
        reached.levelled += report.pairs.filter(
          (p) => p.kind === 'levelled',
        ).length;
        reached.mismatch += report.mismatches.length;
        reached.onlyB += report.onlyB.length;
      }
    }
    // The generator has to reach every path, or the property proves little.
    for (const n of Object.values(reached)) expect(n).toBeGreaterThan(0);
  });
});
