// Phase 2 acceptance, end to end through files (TODO 2.9, ADR-0026):
// GOOD files dropped in the inbox → snapshots → merge → current account →
// "what changed". The account is synthetic (the owner's exports stay out of
// git); `npm run phase2:check` runs the same checks on real files.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import { toGOOD } from '@genshin-build-lab/engine/good/export';
import type { SnapshotPiece } from '@genshin-build-lab/engine/merge/merge';
import { loadSampleGOOD } from '@genshin-build-lab/engine/test-fixtures/sampleAccount';
import {
  simulatePlay,
  withoutRollData,
} from '@genshin-build-lab/engine/test-fixtures/simulatePlay';
import { processInbox } from './inbox/inbox';
import { currentAccount, listSnapshots, openStore } from './store/store';

const sample: SnapshotPiece[] = normalizeGOOD(loadSampleGOOD())!.artifacts!;
// A 320-piece account with Irminsul-style extras on its new pieces.
const account = simulatePlay(
  sample,
  { upgrades: 0, moves: 0, locks: 0, consumed: 0, drops: 300 },
  21,
).after;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'phase2-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const drop = (
  name: string,
  pieces: SnapshotPiece[],
  source: string,
  space = 0,
) =>
  writeFileSync(
    join(dir, name),
    JSON.stringify(toGOOD(pieces, source), null, space),
  );

describe('Phase 2 acceptance', () => {
  it('re-importing the same Irminsul file changes nothing', () => {
    const db = openStore(':memory:');
    drop('a.json', account, 'Irminsul');
    const first = processInbox(db, dir);
    expect(first.merge?.artifacts).toBe(account.length);
    const before = currentAccount(db);

    // The same file again, and the same export saved with other whitespace.
    expect(processInbox(db, dir).events[0].status).toBe('already-imported');
    drop('b.json', account, 'Irminsul', 2);
    const again = processInbox(db, dir, ['b.json']);
    const e = again.events[0];
    expect(e.status).toBe('imported');
    if (e.status !== 'imported') return;
    // A new snapshot (different bytes), but nothing in it changed.
    expect(e.changes?.diff).toMatchObject({
      added: [],
      removed: [],
      upgraded: [],
      moved: [],
      lockChanged: [],
      unexplained: [],
      unchanged: account.length,
    });
    expect(currentAccount(db).map((a) => a.artifact)).toEqual(
      before.map((a) => ({ ...a.artifact, id: expect.any(String) })),
    );
  });

  it.each([1, 2])(
    'two Irminsul exports taken apart give the right "what changed" (seed %i)',
    (seed) => {
      const db = openStore(':memory:');
      drop('1.json', account, 'Irminsul');
      processInbox(db, dir);
      const { after, truth } = simulatePlay(
        account,
        { upgrades: 25, moves: 15, locks: 10, consumed: 30, drops: 20 },
        seed,
      );
      drop('2.json', after, 'Irminsul');
      const run = processInbox(db, dir, ['2.json']);
      const e = run.events[0];
      if (e.status !== 'imported') throw new Error(e.status);
      const d = e.changes!.diff;
      const pairs = (xs: { before: number; after: number }[]) =>
        xs.map((x) => [x.before, x.after]).sort((p, q) => p[0] - q[0]);
      expect(pairs(d.upgraded)).toEqual(truth.upgraded);
      expect([...d.added].sort((a, b) => a - b)).toEqual(truth.added);
      expect(d.removed).toEqual(truth.removed);
      expect(pairs(d.moved)).toEqual(truth.moved);
      expect(pairs(d.lockChanged)).toEqual(truth.lockChanged);
      expect(d.unexplained).toEqual([]);
      // The current account is now the second export.
      expect(run.merge?.snapshotIds).toEqual([2]);
      expect(currentAccount(db)).toHaveLength(after.length);
    },
  );

  it('a faulty OCR scan is reported, not merged', () => {
    const db = openStore(':memory:');
    drop('irminsul.json', account, 'Irminsul');
    processInbox(db, dir);
    // Stuck on one page: the last 30 pieces, read 20 times over.
    const stuck = account.slice(-30);
    const scan = [
      ...withoutRollData(account.slice(0, 150)),
      ...Array.from({ length: 20 }, () => withoutRollData(stuck)).flat(),
    ];
    drop('scan.json', scan, 'AdeptiScanner');
    const run = processInbox(db, dir, ['scan.json']);
    expect(run.events[0]).toMatchObject({
      status: 'faulty-scan',
      snapshot: { fault: { repeatedPieces: 30, extraEntries: 570 } },
    });
    expect(run.merge).toBeUndefined();
    expect(currentAccount(db)).toHaveLength(account.length);
    expect(listSnapshots(db).map((s) => s.kind)).toEqual(['irminsul', 'ocr']);
  });

  it('a newer OCR scan moves pieces but never overrides Irminsul values', () => {
    const db = openStore(':memory:');
    drop('irminsul.json', account, 'Irminsul');
    processInbox(db, dir);
    // The scan reads one value a shown digit off, and a piece re-equipped.
    const scan = withoutRollData(account).map((p) => ({
      ...p,
      artifact: {
        ...p.artifact,
        subStats: p.artifact.subStats.map((s) => ({ ...s })),
      },
    }));
    const [first] = scan[0].artifact.subStats;
    first.value = Math.round((first.value + 0.1) * 10) / 10;
    const chars = [...new Set(account.map((p) => p.artifact.location))].filter(
      (c): c is string => !!c && c !== scan[1].artifact.location,
    );
    scan[1].artifact.location = chars[0];
    drop('scan.json', scan, 'AdeptiScanner');
    const run = processInbox(db, dir, ['scan.json']);
    expect(run.merge?.snapshotIds).toEqual([1, 2]);
    const merged = currentAccount(db);
    expect(merged).toHaveLength(account.length);
    // Values from Irminsul, location from the newer scan.
    const byFirstSeen = (i: number) =>
      merged.find((m) =>
        m.seenIn.some((s) => s.snapshot === '1' && s.index === i),
      )!;
    expect(byFirstSeen(0).artifact.subStats[0].value).toBe(
      account[0].artifact.subStats[0].value,
    );
    expect(byFirstSeen(0)).toMatchObject({ valuesFrom: '1' });
    expect(byFirstSeen(1).artifact.location).toBe(chars[0]);
    expect(byFirstSeen(1)).toMatchObject({ locationFrom: '2' });
  });
});
