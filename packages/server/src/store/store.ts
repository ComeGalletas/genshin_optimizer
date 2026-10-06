/**
 * The SQLite snapshot store (TODO 2.6, ADR-0028): immutable import
 * snapshots with their sidecar, and the merges built from them. All logic
 * that decides anything (normalization, fingerprints, merging) is the
 * engine's; this module only persists its results and reads them back.
 * @packageDocumentation
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { fromRoot } from '../paths';
import {
  isStatKey,
  type Artifact,
  type SubStat,
} from '@genshin-build-lab/engine/game/types';
import { isPersistedArtifact } from '@genshin-build-lab/engine/game/artifactValidation';
import {
  normalizeGOOD,
  type GoodIssue,
  type OwnedWeapon,
  type RosterEntry,
} from '@genshin-build-lab/engine/good/normalize';
import { ArtifactExtras } from '@genshin-build-lab/engine/good/extras';
import { buildSidecar } from '@genshin-build-lab/engine/good/sidecar';
import { fingerprint } from '@genshin-build-lab/engine/import/fingerprint';
import {
  mergeSnapshots,
  scanFault,
  sourceKind,
  type MergedArtifact,
  type Appearance,
  type MergeResult,
  type ScanFault,
  type SnapshotPiece,
  type SourceKind,
  type SourceSnapshot,
} from '@genshin-build-lab/engine/merge/merge';
import {
  diffSnapshots,
  type ImportDiff,
} from '@genshin-build-lab/engine/diff/diff';
import { migrate } from './migrations';
import { sha256 } from '../hash';

/** Where the store lives unless told otherwise. Git-ignored. */
export const DEFAULT_STORE_PATH = fromRoot('var/store.sqlite');

export type Store = Database.Database;

/** Open (creating if needed) and migrate a store. `:memory:` for tests. */
export function openStore(path: string = DEFAULT_STORE_PATH): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export class StoreError extends Error {}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export interface SnapshotInfo {
  id: number;
  source?: string;
  kind: SourceKind;
  fileName?: string;
  takenAt: string;
  importedAt: string;
  artifacts: number;
  issues: number;
  fault?: ScanFault;
}

export interface ImportResult {
  snapshot: SnapshotInfo;
  /** False when this exact file was imported before: nothing was written. */
  created: boolean;
  issues: GoodIssue[];
}

export interface ImportInput {
  /** The file's text, exactly as read: its hash identifies the import. */
  text: string;
  fileName?: string;
  /** When the export was taken (the file's time); defaults to importedAt. */
  takenAt?: string;
  importedAt?: string;
}

/** Persisted without its id: an artifact's id in the store is its place. */
const withoutId = (a: Artifact): Omit<Artifact, 'id'> => {
  const rest: Partial<Artifact> = { ...a };
  delete rest.id;
  return rest as Omit<Artifact, 'id'>;
};
const artifactId = (snapshot: number, idx: number) => `s${snapshot}-${idx}`;

/**
 * Import a GOOD file as a new snapshot. The same file again returns the
 * existing snapshot without writing (idempotent re-import). A file that
 * isn't GOOD, or has no artifact list, is refused with a StoreError.
 */
export function importGood(db: Store, input: ImportInput): ImportResult {
  const hash = sha256(input.text);
  const existing = db
    .prepare('SELECT id FROM snapshots WHERE file_sha256 = ?')
    .get(hash) as { id: number } | undefined;
  if (existing)
    return {
      snapshot: snapshotInfo(db, existing.id),
      created: false,
      issues: [],
    };

  let json: unknown;
  try {
    json = JSON.parse(input.text);
  } catch {
    throw new StoreError(`${input.fileName ?? 'file'}: not JSON`);
  }
  const n = normalizeGOOD(json);
  if (!n) throw new StoreError(`${input.fileName ?? 'file'}: not a GOOD file`);
  if (!n.artifacts)
    throw new StoreError(
      `${input.fileName ?? 'file'}: no usable artifact list`,
    );
  const artifacts = n.artifacts;
  const importedAt = input.importedAt ?? new Date().toISOString();
  const fault = scanFault(artifacts);
  const sidecar = buildSidecar(n);

  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO snapshots (file_sha256, file_name, source, kind,
           good_version, game_version, taken_at, imported_at, issues_json, fault_json)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .run(
        hash,
        input.fileName ?? null,
        n.source ?? null,
        sourceKind(n.source),
        n.version ?? null,
        input.takenAt ?? importedAt,
        importedAt,
        JSON.stringify(n.issues),
        fault ? JSON.stringify(fault) : null,
      );
    const sid = Number(lastInsertRowid);
    const art = db.prepare(
      'INSERT INTO snapshot_artifacts (snapshot_id, idx, fingerprint, artifact_json, lock, unactivated_json) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const e of artifacts)
      art.run(
        sid,
        e.index,
        fingerprint(e.artifact),
        JSON.stringify(withoutId(e.artifact)),
        e.lock === undefined ? null : Number(e.lock),
        e.unactivated ? JSON.stringify(e.unactivated) : null,
      );
    const side = db.prepare(
      'INSERT INTO snapshot_sidecar (snapshot_id, idx, fingerprint, first_roll_key, extras_json) VALUES (?, ?, ?, ?, ?)',
    );
    for (const s of sidecar.entries)
      side.run(
        sid,
        s.index,
        s.fingerprint,
        s.firstRollKey ?? null,
        JSON.stringify(s.extras),
      );
    const ch = db.prepare(
      'INSERT INTO snapshot_characters (snapshot_id, key, entry_json) VALUES (?, ?, ?)',
    );
    for (const [key, entry] of Object.entries(n.roster))
      ch.run(sid, key, JSON.stringify(entry));
    const wp = db.prepare(
      'INSERT INTO snapshot_weapons (snapshot_id, idx, weapon_json) VALUES (?, ?, ?)',
    );
    for (const w of n.weapons) wp.run(sid, w.index, JSON.stringify(w));
    return sid;
  })();
  return { snapshot: snapshotInfo(db, id), created: true, issues: n.issues };
}

interface SnapshotRow {
  id: number;
  source: string | null;
  kind: SourceKind;
  file_name: string | null;
  taken_at: string;
  imported_at: string;
  issues_json: string;
  fault_json: string | null;
  artifacts: number;
}

const SNAPSHOT_SELECT = `
  SELECT s.*, (SELECT count(*) FROM snapshot_artifacts a WHERE a.snapshot_id = s.id) AS artifacts
  FROM snapshots s`;

const toInfo = (r: SnapshotRow): SnapshotInfo => ({
  id: r.id,
  ...(r.source !== null && { source: r.source }),
  kind: r.kind,
  ...(r.file_name !== null && { fileName: r.file_name }),
  takenAt: r.taken_at,
  importedAt: r.imported_at,
  artifacts: r.artifacts,
  issues: (JSON.parse(r.issues_json) as unknown[]).length,
  ...(r.fault_json !== null && {
    fault: JSON.parse(r.fault_json) as ScanFault,
  }),
});

export function snapshotInfo(db: Store, id: number): SnapshotInfo {
  const row = db.prepare(`${SNAPSHOT_SELECT} WHERE s.id = ?`).get(id) as
    SnapshotRow | undefined;
  if (!row) throw new StoreError(`no snapshot ${id}`);
  return toInfo(row);
}

/** Every snapshot, oldest import first. */
export function listSnapshots(db: Store): SnapshotInfo[] {
  return (
    db.prepare(`${SNAPSHOT_SELECT} ORDER BY s.id`).all() as SnapshotRow[]
  ).map(toInfo);
}

/** Parse a stored artifact, checking it like any untrusted input
 *  (ADR-0022): a corrupt row is an error naming it, not a bad build. */
function readArtifact(json: string, id: string, where: string): Artifact {
  const a = { ...(JSON.parse(json) as object), id };
  if (!isPersistedArtifact(a))
    throw new StoreError(`${where}: stored artifact is not valid`);
  return a;
}

const isSubStatLine = (x: unknown): x is SubStat =>
  typeof x === 'object' &&
  x !== null &&
  isStatKey((x as SubStat).key) &&
  Number.isFinite((x as SubStat).value);

/** One snapshot's pieces, with their sidecar extras, ready to merge. */
export function loadSnapshot(db: Store, id: number): SourceSnapshot {
  const info = snapshotInfo(db, id);
  const rows = db
    .prepare(
      `SELECT a.idx, a.artifact_json, a.lock, a.unactivated_json, s.extras_json
       FROM snapshot_artifacts a
       LEFT JOIN snapshot_sidecar s ON s.snapshot_id = a.snapshot_id AND s.idx = a.idx
       WHERE a.snapshot_id = ? ORDER BY a.idx`,
    )
    .all(id) as {
    idx: number;
    artifact_json: string;
    lock: number | null;
    unactivated_json: string | null;
    extras_json: string | null;
  }[];
  const pieces: SnapshotPiece[] = rows.map((r) => {
    const where = `snapshot ${id} artifact ${r.idx}`;
    const piece: SnapshotPiece = {
      artifact: readArtifact(r.artifact_json, artifactId(id, r.idx), where),
    };
    if (r.lock !== null) piece.lock = r.lock === 1;
    if (r.unactivated_json !== null) {
      const u = JSON.parse(r.unactivated_json) as unknown;
      if (!isSubStatLine(u))
        throw new StoreError(`${where}: stored unactivated line is not valid`);
      piece.unactivated = u;
    }
    if (r.extras_json !== null) {
      const extras = ArtifactExtras.safeParse(JSON.parse(r.extras_json));
      if (!extras.success)
        throw new StoreError(`${where}: stored sidecar is not valid`);
      piece.extras = extras.data;
    }
    return piece;
  });
  return { id: String(id), kind: info.kind, takenAt: info.takenAt, pieces };
}

/** A snapshot's roster and weapon inventory, as normalization gave them. */
export function loadRoster(
  db: Store,
  id: number,
): { roster: Record<string, RosterEntry>; weapons: OwnedWeapon[] } {
  const roster = Object.fromEntries(
    (
      db
        .prepare(
          'SELECT key, entry_json FROM snapshot_characters WHERE snapshot_id = ?',
        )
        .all(id) as { key: string; entry_json: string }[]
    ).map((r) => [r.key, JSON.parse(r.entry_json) as RosterEntry]),
  );
  const weapons = (
    db
      .prepare(
        'SELECT weapon_json FROM snapshot_weapons WHERE snapshot_id = ? ORDER BY idx',
      )
      .all(id) as { weapon_json: string }[]
  ).map((r) => JSON.parse(r.weapon_json) as OwnedWeapon);
  return { roster, weapons };
}

// ---------------------------------------------------------------------------
// Merges
// ---------------------------------------------------------------------------

export interface MergeRecord {
  id: number;
  createdAt: string;
  snapshotIds: number[];
  rejected: MergeResult['rejected'];
  artifacts: number;
}

/**
 * Merge the given snapshots with the engine's `mergeSnapshots` and store the
 * result as a new merge, which becomes the current account. Faulty scans are
 * rejected by the engine and recorded as such.
 */
export function recordMerge(
  db: Store,
  snapshotIds: readonly number[],
  createdAt: string = new Date().toISOString(),
): MergeRecord {
  const ids = [...new Set(snapshotIds)].sort((a, b) => a - b);
  if (!ids.length) throw new StoreError('a merge needs at least one snapshot');
  const result = mergeSnapshots(ids.map((id) => loadSnapshot(db, id)));
  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO merges (created_at, snapshot_ids, rejected_json, reports_json) VALUES (?, ?, ?, ?)',
      )
      .run(
        createdAt,
        JSON.stringify(ids),
        JSON.stringify(result.rejected),
        JSON.stringify(result.reports),
      );
    const mid = Number(lastInsertRowid);
    const ins = db.prepare(
      `INSERT INTO merged_artifacts (merge_id, ord, fingerprint, artifact_json, lock,
         values_from, location_from, seen_in_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    result.artifacts.forEach((m, ord) =>
      ins.run(
        mid,
        ord,
        fingerprint(m.artifact),
        JSON.stringify(withoutId(m.artifact)),
        m.lock === undefined ? null : Number(m.lock),
        Number(m.valuesFrom),
        Number(m.locationFrom),
        JSON.stringify(m.seenIn),
      ),
    );
    return mid;
  })();
  return {
    id,
    createdAt,
    snapshotIds: ids,
    rejected: result.rejected,
    artifacts: result.artifacts.length,
  };
}

/**
 * The newest snapshot of each source kind that isn't a scan fault: the
 * default input to a merge.
 */
export function latestUsableSnapshots(db: Store): number[] {
  return (
    db
      .prepare(
        `SELECT max(id) AS id FROM snapshots WHERE fault_json IS NULL GROUP BY kind`,
      )
      .all() as { id: number }[]
  ).map((r) => r.id);
}

/** The current account: the artifacts of the latest merge (empty before
 *  the first merge). An artifact's id is `m<merge>-<ord>`. */
export function currentAccount(db: Store): MergedArtifact[] {
  const rows = db
    .prepare(
      `SELECT merge_id, ord, artifact_json, lock, values_from, location_from, seen_in_json
       FROM current_account ORDER BY ord`,
    )
    .all() as {
    merge_id: number;
    ord: number;
    artifact_json: string;
    lock: number | null;
    values_from: number;
    location_from: number;
    seen_in_json: string;
  }[];
  return rows.map((r) => ({
    artifact: readArtifact(
      r.artifact_json,
      `m${r.merge_id}-${r.ord}`,
      `merge ${r.merge_id} artifact ${r.ord}`,
    ),
    ...(r.lock !== null && { lock: r.lock === 1 }),
    valuesFrom: String(r.values_from),
    locationFrom: String(r.location_from),
    seenIn: JSON.parse(r.seen_in_json) as MergedArtifact['seenIn'],
  }));
}

// ---------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------

export interface SnapshotDiff {
  from: number;
  to: number;
  diff: ImportDiff;
}

/**
 * What changed since the previous usable snapshot of the same source kind
 * (TODO 2.8): the same exporter, so like is compared with like. Undefined
 * for the first one, or for a faulty scan.
 */
export function diffSincePrevious(
  db: Store,
  snapshotId: number,
): SnapshotDiff | undefined {
  const info = snapshotInfo(db, snapshotId);
  if (info.fault) return undefined;
  const prev = db
    .prepare(
      `SELECT max(id) AS id FROM snapshots
       WHERE kind = ? AND fault_json IS NULL AND id < ?`,
    )
    .get(info.kind, snapshotId) as { id: number | null };
  if (prev.id === null) return undefined;
  return {
    from: prev.id,
    to: snapshotId,
    diff: diffSnapshots(
      loadSnapshot(db, prev.id).pieces,
      loadSnapshot(db, snapshotId).pieces,
    ),
  };
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface CurrentRoster {
  /** The snapshot the roster comes from; undefined before any merge. */
  snapshotId?: number;
  roster: Record<string, RosterEntry>;
  weapons: OwnedWeapon[];
}

const KIND_RANK: Record<SourceKind, number> = {
  irminsul: 0,
  ocr: 1,
  good: 2,
  enka: 3,
};

/**
 * The roster (characters and weapons) behind the current account: from the
 * best-ranked snapshot in the latest merge that has characters, newest
 * first on a tie (ADR-0027's precedence). OCR scans often carry artifacts
 * only, so the roster can come from a different snapshot than the newest.
 */
export function currentRoster(db: Store): CurrentRoster {
  const merge = db
    .prepare('SELECT snapshot_ids FROM merges ORDER BY id DESC LIMIT 1')
    .get() as { snapshot_ids: string } | undefined;
  if (!merge) return { roster: {}, weapons: [] };
  const ids = JSON.parse(merge.snapshot_ids) as number[];
  const withRoster = ids
    .map((id) => ({
      info: snapshotInfo(db, id),
      characters: (
        db
          .prepare(
            'SELECT count(*) AS n FROM snapshot_characters WHERE snapshot_id = ?',
          )
          .get(id) as { n: number }
      ).n,
    }))
    .filter((s) => s.characters > 0)
    .sort(
      (a, b) =>
        KIND_RANK[a.info.kind] - KIND_RANK[b.info.kind] ||
        b.info.takenAt.localeCompare(a.info.takenAt),
    );
  const best = withRoster[0];
  if (!best) return { roster: {}, weapons: [] };
  return { snapshotId: best.info.id, ...loadRoster(db, best.info.id) };
}

/** A recorded merge's reconciliation reports (ADR-0027): each snapshot
 *  against the account as merged before it, positions as the engine gave
 *  them (`a` an artifact of this merge by position, `b` a piece of the
 *  snapshot). */
export function mergeReports(
  db: Store,
  mergeId: number,
): MergeResult['reports'] {
  const row = db
    .prepare('SELECT reports_json FROM merges WHERE id = ?')
    .get(mergeId) as { reports_json: string } | undefined;
  if (!row) throw new StoreError(`no merge ${mergeId}`);
  return JSON.parse(row.reports_json) as MergeResult['reports'];
}

/** Where each artifact of a merge first came from (its first appearance),
 *  by position: the piece a reconciliation report's `a` was read as. */
export function mergeOrigins(db: Store, mergeId: number): Appearance[] {
  return (
    db
      .prepare(
        'SELECT seen_in_json FROM merged_artifacts WHERE merge_id = ? ORDER BY ord',
      )
      .all(mergeId) as { seen_in_json: string }[]
  ).map((r) => (JSON.parse(r.seen_in_json) as Appearance[])[0]);
}

/** Every recorded merge, oldest first (the last is the current account). */
export function listMerges(db: Store): MergeRecord[] {
  return (
    db
      .prepare(
        `SELECT m.id, m.created_at, m.snapshot_ids, m.rejected_json,
           (SELECT count(*) FROM merged_artifacts a WHERE a.merge_id = m.id) AS artifacts
         FROM merges m ORDER BY m.id`,
      )
      .all() as {
      id: number;
      created_at: string;
      snapshot_ids: string;
      rejected_json: string;
      artifacts: number;
    }[]
  ).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    snapshotIds: JSON.parse(r.snapshot_ids) as number[],
    rejected: JSON.parse(r.rejected_json) as MergeResult['rejected'],
    artifacts: r.artifacts,
  }));
}
