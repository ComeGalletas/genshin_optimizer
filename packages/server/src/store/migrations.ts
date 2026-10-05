/**
 * Schema migrations for the SQLite store (ADR-0028). Each migration runs once,
 * in its own transaction, and is recorded in `schema_migrations`. Migrations
 * are append-only: never edit or reorder one that has shipped, add a new one.
 * @packageDocumentation
 */

import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Rows a snapshot owns can be added and deleted with it, never changed. */
const immutable = (table: string) => `
CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table}
BEGIN SELECT RAISE(ABORT, '${table} rows are immutable'); END;`;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'snapshots, sidecar and merges',
    sql: `
-- One import of one file. Never updated: a new file is a new snapshot, and
-- the same file again (same SHA-256) is the same snapshot.
CREATE TABLE snapshots (
  id            INTEGER PRIMARY KEY,
  file_sha256   TEXT NOT NULL UNIQUE,
  file_name     TEXT,
  source        TEXT,
  kind          TEXT NOT NULL CHECK (kind IN ('irminsul', 'ocr', 'good', 'enka')),
  good_version  INTEGER,
  game_version  TEXT,
  taken_at      TEXT NOT NULL,
  imported_at   TEXT NOT NULL,
  issues_json   TEXT NOT NULL,
  -- A scan fault (ADR-0026): kept, so the import is recorded, but never merged.
  fault_json    TEXT
);
${immutable('snapshots')}

-- The normalized artifacts, by position in the file.
CREATE TABLE snapshot_artifacts (
  snapshot_id   INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  fingerprint   TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  lock          INTEGER CHECK (lock IN (0, 1)),
  PRIMARY KEY (snapshot_id, idx)
) WITHOUT ROWID;
CREATE INDEX snapshot_artifacts_fingerprint ON snapshot_artifacts(fingerprint);
${immutable('snapshot_artifacts')}

-- Source extras, keyed by fingerprint (TODO 2.3).
CREATE TABLE snapshot_sidecar (
  snapshot_id    INTEGER NOT NULL,
  idx            INTEGER NOT NULL,
  fingerprint    TEXT NOT NULL,
  first_roll_key TEXT,
  extras_json    TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, idx),
  FOREIGN KEY (snapshot_id, idx)
    REFERENCES snapshot_artifacts(snapshot_id, idx) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX snapshot_sidecar_fingerprint ON snapshot_sidecar(fingerprint);
CREATE INDEX snapshot_sidecar_first_roll ON snapshot_sidecar(first_roll_key);
${immutable('snapshot_sidecar')}

CREATE TABLE snapshot_characters (
  snapshot_id   INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  entry_json    TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, key)
) WITHOUT ROWID;
${immutable('snapshot_characters')}

CREATE TABLE snapshot_weapons (
  snapshot_id   INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  weapon_json   TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, idx)
) WITHOUT ROWID;
${immutable('snapshot_weapons')}

-- A merge of some snapshots (ADR-0027). Derived and recomputable, but kept:
-- the history of what the account looked like.
CREATE TABLE merges (
  id            INTEGER PRIMARY KEY,
  created_at    TEXT NOT NULL,
  snapshot_ids  TEXT NOT NULL,
  rejected_json TEXT NOT NULL,
  reports_json  TEXT NOT NULL
);
${immutable('merges')}

CREATE TABLE merged_artifacts (
  merge_id      INTEGER NOT NULL REFERENCES merges(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL,
  fingerprint   TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  lock          INTEGER CHECK (lock IN (0, 1)),
  values_from   INTEGER NOT NULL REFERENCES snapshots(id),
  location_from INTEGER NOT NULL REFERENCES snapshots(id),
  seen_in_json  TEXT NOT NULL,
  PRIMARY KEY (merge_id, ord)
) WITHOUT ROWID;
${immutable('merged_artifacts')}

-- "Current account" is a view over the latest merge (CLAUDE.md).
CREATE VIEW current_account AS
  SELECT * FROM merged_artifacts
  WHERE merge_id = (SELECT max(id) FROM merges);
`,
  },
  {
    version: 2,
    name: 'unactivated fourth line',
    sql: `
-- A 3-line piece's greyed-out fourth line (TODO 2.8): not part of its stats,
-- but the diff and the levelling prospects need it. NULL for older imports.
ALTER TABLE snapshot_artifacts ADD COLUMN unactivated_json TEXT;
`,
  },
  {
    version: 3,
    name: 'simulation cache',
    sql: `
-- gcsim results (TODO 5.4), keyed by the SHA-256 of the gcsim commit, the
-- result reader's version and the config as run. A cache: a row may be
-- deleted at any time and is never updated (a new run is a new key).
CREATE TABLE sim_cache (
  key           TEXT PRIMARY KEY,
  gcsim_commit  TEXT NOT NULL,
  iterations    INTEGER NOT NULL,
  result_json   TEXT NOT NULL,
  ms            INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
${immutable('sim_cache')}
`,
  },
];

export class MigrationError extends Error {}

/**
 * Bring a database up to the latest schema. Refuses a database written by a
 * newer version of the app (a schema version it doesn't know), or one whose
 * applied migrations don't match this list.
 */
export function migrate(
  db: Database.Database,
  migrations: readonly Migration[] = MIGRATIONS,
): { applied: number[] } {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const done = db
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all() as { version: number; name: string }[];
  const known = new Map(migrations.map((m) => [m.version, m]));
  for (const row of done) {
    const m = known.get(row.version);
    if (!m)
      throw new MigrationError(
        `database schema version ${row.version} is newer than this app knows (${migrations.length}); update the app`,
      );
    if (m.name !== row.name)
      throw new MigrationError(
        `migration ${row.version} was applied as "${row.name}" but this app calls it "${m.name}"`,
      );
  }
  const applied: number[] = [];
  const doneVersions = new Set(done.map((r) => r.version));
  for (const m of migrations) {
    if (doneVersions.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(m.version, m.name, new Date().toISOString());
    })();
    applied.push(m.version);
  }
  return { applied };
}
