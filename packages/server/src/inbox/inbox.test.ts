import {
  appendFileSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentAccount, listSnapshots, openStore } from '../store/store';
import { inboxFiles, processInbox, watchInbox, type InboxRun } from './inbox';

const piece = (setKey = 'EmblemOfSeveredFate') => ({
  setKey,
  slotKey: 'sands',
  rarity: 5,
  level: 0,
  mainStatKey: 'atk_',
  substats: [
    { key: 'critRate_', value: 3.9 },
    { key: 'hp', value: 299 },
    { key: 'def', value: 23 },
    { key: 'critDMG_', value: 7 },
  ],
});
const good = (source: string, artifacts: unknown[]) =>
  JSON.stringify({ format: 'GOOD', version: 3, source, artifacts });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inbox-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('processInbox', () => {
  it('imports each file once, with the file time, and merges what is usable', () => {
    writeFileSync(join(dir, 'irminsul.json'), good('Irminsul', [piece()]));
    utimesSync(
      join(dir, 'irminsul.json'),
      new Date('2026-09-27T23:00:00Z'),
      new Date('2026-09-27T23:00:00Z'),
    );
    const stuck = piece('GladiatorsFinale');
    writeFileSync(
      join(dir, 'scan.json'),
      good('AdeptiScanner', [stuck, stuck, stuck]),
    );
    writeFileSync(join(dir, 'notes.json'), '{"hello": 1}');
    writeFileSync(join(dir, 'readme.txt'), 'not considered');
    writeFileSync(join(dir, '.gitkeep'), '');
    const db = openStore(':memory:');

    const run = processInbox(db, dir);
    expect(run.events.map((e) => [e.file, e.status])).toEqual([
      ['irminsul.json', 'imported'],
      ['notes.json', 'refused'],
      ['scan.json', 'faulty-scan'],
    ]);
    expect(listSnapshots(db).map((s) => [s.kind, s.takenAt])).toEqual([
      ['irminsul', '2026-09-27T23:00:00.000Z'],
      ['ocr', expect.any(String)],
    ]);
    expect(run.merge).toMatchObject({ snapshotIds: [1], artifacts: 1 });
    expect(currentAccount(db)).toHaveLength(1);

    // Rescanning changes nothing and records no merge.
    const again = processInbox(db, dir);
    expect(again.events.map((e) => e.status)).toEqual([
      'already-imported',
      'refused',
      'already-imported',
    ]);
    expect(again.merge).toBeUndefined();
  });

  it('starts no merge for a faulty scan alone', () => {
    const stuck = piece();
    writeFileSync(
      join(dir, 'scan.json'),
      good('AdeptiScanner', [stuck, stuck, stuck]),
    );
    const db = openStore(':memory:');
    expect(processInbox(db, dir).merge).toBeUndefined();
    expect(currentAccount(db)).toEqual([]);
  });

  it('lists only visible .json files, in name order', () => {
    for (const f of ['b.json', 'a.JSON', '.hidden.json', 'c.txt'])
      writeFileSync(join(dir, f), '');
    expect(inboxFiles(dir)).toEqual(['a.JSON', 'b.json']);
  });
});

describe('watchInbox', () => {
  /** Resolves with the first run that imported something. */
  const nextImport = (runs: InboxRun[]) =>
    new Promise<InboxRun>((resolve, reject) => {
      const t0 = Date.now();
      const poll = setInterval(() => {
        const hit = runs.find((r) =>
          r.events.some((e) => e.status === 'imported'),
        );
        if (hit) {
          clearInterval(poll);
          resolve(hit);
        } else if (Date.now() - t0 > 5000) {
          clearInterval(poll);
          reject(new Error('no import within 5 s'));
        }
      }, 20);
    });

  it('imports a file dropped in, once it has finished writing', async () => {
    const db = openStore(':memory:');
    const runs: InboxRun[] = [];
    const stop = watchInbox(db, dir, {
      settleMs: 100,
      onRun: (r) => runs.push(r),
    });
    try {
      expect(runs).toEqual([{ events: [] }]); // the initial pass
      // Written in two parts: the first alone isn't valid JSON.
      const text = good('Irminsul', [piece()]);
      const path = join(dir, 'export.json');
      writeFileSync(path, text.slice(0, 40));
      await new Promise((r) => setTimeout(r, 30));
      appendFileSync(path, text.slice(40));
      const run = await nextImport(runs);
      expect(run.events.map((e) => [e.file, e.status])).toEqual([
        ['export.json', 'imported'],
      ]);
      expect(run.merge?.artifacts).toBe(1);
      expect(
        runs.flatMap((r) => r.events).filter((e) => e.status === 'refused'),
      ).toEqual([]);
    } finally {
      stop();
    }
  });
});
