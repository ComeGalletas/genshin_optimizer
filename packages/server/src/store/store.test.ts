import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS, migrate, MigrationError } from './migrations';
import {
  currentAccount,
  importGood,
  latestUsableSnapshots,
  listSnapshots,
  loadRoster,
  loadSnapshot,
  openStore,
  recordMerge,
  StoreError,
} from './store';

const SAMPLE = readFileSync(
  new URL(
    '../../../engine/src/import/__fixtures__/sample-account.good.json',
    import.meta.url,
  ),
  'utf8',
);

// A 3-line +0 piece with Irminsul's extras, and the same piece at +20.
const fresh = {
  setKey: 'EmblemOfSeveredFate',
  slotKey: 'sands',
  rarity: 5,
  level: 0,
  mainStatKey: 'atk_',
  substats: [
    { key: 'critRate_', value: 3.9, initialValue: 3.9 },
    { key: 'hp', value: 299, initialValue: 299 },
    { key: 'def', value: 23, initialValue: 23 },
  ],
  unactivatedSubstats: [{ key: 'critDMG_', value: 7, initialValue: 7 }],
  totalRolls: 3,
  lock: true,
  location: '',
};
const good = (source: string, artifacts: unknown[]) =>
  JSON.stringify({ format: 'GOOD', version: 3, source, artifacts });

describe('migrations', () => {
  it('creates the schema once, and reopening changes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-'));
    try {
      const path = join(dir, 'store.sqlite');
      openStore(path).close();
      const db = new Database(path);
      expect(migrate(db).applied).toEqual([]);
      expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual(
        MIGRATIONS.map((m) => ({ version: m.version })),
      );
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a database from a newer app, or with renamed migrations', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.prepare(
      "INSERT INTO schema_migrations VALUES (99, 'from the future', 'x')",
    ).run();
    expect(() => migrate(db)).toThrow(MigrationError);
    const other = new Database(':memory:');
    migrate(other);
    expect(() =>
      migrate(other, [{ ...MIGRATIONS[0], name: 'renamed' }]),
    ).toThrow(/renamed/);
  });
});

describe('snapshots', () => {
  it('imports a GOOD file with its roster, weapons and extras', () => {
    const db = openStore(':memory:');
    const r = importGood(db, {
      text: SAMPLE,
      fileName: 'sample.good.json',
      importedAt: '2026-09-28T00:00:00Z',
    });
    expect(r.created).toBe(true);
    expect(r.snapshot).toMatchObject({
      id: 1,
      kind: 'good',
      artifacts: 20,
      issues: 0,
      takenAt: '2026-09-28T00:00:00Z',
    });
    const { roster, weapons } = loadRoster(db, 1);
    expect(Object.keys(roster)).toHaveLength(8);
    expect(weapons).toHaveLength(8);
  });

  it('re-importing the same file is idempotent', () => {
    const db = openStore(':memory:');
    const first = importGood(db, { text: SAMPLE });
    const again = importGood(db, { text: SAMPLE, fileName: 'renamed.json' });
    expect(again.created).toBe(false);
    expect(again.snapshot).toEqual(first.snapshot);
    expect(listSnapshots(db)).toHaveLength(1);
  });

  it('refuses what is not a GOOD artifact list', () => {
    const db = openStore(':memory:');
    expect(() => importGood(db, { text: '{' })).toThrow(StoreError);
    expect(() => importGood(db, { text: '{"format":"x"}' })).toThrow(
      /not a GOOD file/,
    );
    expect(() =>
      importGood(db, { text: '{"format":"GOOD","characters":[]}' }),
    ).toThrow(/no usable artifact list/);
    expect(listSnapshots(db)).toEqual([]);
  });

  it('round-trips pieces with lock and sidecar extras, ids by place', () => {
    const db = openStore(':memory:');
    importGood(db, { text: good('Irminsul', [fresh]) });
    const s = loadSnapshot(db, 1);
    expect(s).toMatchObject({ id: '1', kind: 'irminsul' });
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0].artifact.id).toBe('s1-0');
    expect(s.pieces[0].lock).toBe(true);
    expect(s.pieces[0].extras).toEqual({
      totalRolls: 3,
      initialValues: { crit_rate: 3.9, hp: 299, def: 23, crit_dmg: 7 },
    });
  });

  it('keeps snapshots immutable', () => {
    const db = openStore(':memory:');
    importGood(db, { text: good('Irminsul', [fresh]) });
    for (const sql of [
      "UPDATE snapshots SET source = 'x'",
      'UPDATE snapshot_artifacts SET lock = 0',
      "UPDATE snapshot_sidecar SET extras_json = '{}'",
    ])
      expect(() => db.prepare(sql).run()).toThrow(/immutable/);
  });

  it('refuses a corrupted stored artifact instead of using it', () => {
    const db = openStore(':memory:');
    importGood(db, { text: good('Irminsul', [fresh]) });
    db.exec('DROP TRIGGER snapshot_artifacts_immutable');
    db.prepare(
      `UPDATE snapshot_artifacts SET artifact_json = '{"setKey":"x"}'`,
    ).run();
    expect(() => loadSnapshot(db, 1)).toThrow(/not valid/);
  });
});

describe('merges', () => {
  it('records a merge and serves it as the current account', () => {
    const db = openStore(':memory:');
    expect(currentAccount(db)).toEqual([]);
    importGood(db, {
      text: good('Irminsul', [fresh]),
      takenAt: '2026-09-27T00:00:00Z',
    });
    const levelled = {
      ...fresh,
      level: 20,
      substats: [
        { key: 'critRate_', value: 10.5, initialValue: 3.9 },
        { key: 'hp', value: 299, initialValue: 299 },
        { key: 'def', value: 44, initialValue: 23 },
        { key: 'critDMG_', value: 14.8, initialValue: 7 },
      ],
      unactivatedSubstats: [],
      totalRolls: 8,
      location: 'Furina',
    };
    importGood(db, {
      text: good('AdeptiScanner', [levelled]),
      takenAt: '2026-09-30T00:00:00Z',
    });
    const m = recordMerge(db, latestUsableSnapshots(db));
    expect(m).toMatchObject({
      snapshotIds: [1, 2],
      rejected: [],
      artifacts: 1,
    });
    const [a] = currentAccount(db);
    expect(a.artifact).toMatchObject({
      id: `m${m.id}-0`,
      level: 20,
      location: 'furina',
    });
    expect(a).toMatchObject({ valuesFrom: '2', locationFrom: '2', lock: true });

    // A later merge replaces the current account; the old one is kept.
    const only = recordMerge(db, [1]);
    expect(currentAccount(db)[0].artifact).toMatchObject({
      id: `m${only.id}-0`,
      level: 0,
    });
    expect(
      db.prepare('SELECT count(*) AS n FROM merged_artifacts').get(),
    ).toEqual({ n: 2 });
  });

  it('records a faulty scan but never merges it', () => {
    const db = openStore(':memory:');
    importGood(db, { text: good('Irminsul', [fresh]) });
    const stuck = { ...fresh, setKey: 'GladiatorsFinale' };
    const scan = importGood(db, {
      text: good('AdeptiScanner', [stuck, stuck, stuck]),
    });
    expect(scan.snapshot.fault).toEqual({ repeatedPieces: 1, extraEntries: 2 });
    expect(latestUsableSnapshots(db)).toEqual([1]);
    const m = recordMerge(db, [1, 2]);
    expect(m.rejected.map((r) => r.snapshot)).toEqual(['2']);
    expect(currentAccount(db)).toHaveLength(1);
  });

  it('deleting a snapshot removes everything it owns', () => {
    const db = openStore(':memory:');
    importGood(db, { text: good('Irminsul', [fresh]) });
    db.prepare('DELETE FROM snapshots WHERE id = 1').run();
    for (const t of ['snapshot_artifacts', 'snapshot_sidecar'])
      expect(db.prepare(`SELECT count(*) AS n FROM ${t}`).get()).toEqual({
        n: 0,
      });
  });
});
