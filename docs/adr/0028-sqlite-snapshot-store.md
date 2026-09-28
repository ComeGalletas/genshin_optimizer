# 0028. SQLite snapshot store: immutable imports, recorded merges

- Status: Accepted
- Date: 2026-09-28

## Context

ADR-0021 puts account data in SQLite (`better-sqlite3`) on the local server,
and CLAUDE.md sets the rules: never overwrite an import, keep each one as a
timestamped snapshot, and make "current account" a view over the latest
merged snapshot. The engine now produces everything a snapshot holds
(normalized artifacts, roster, weapons, sidecar, scan fault; TODO 2.2–2.4)
and the merge (ADR-0027). 2.6 decides how they are stored.

## Decision

`packages/server/src/store/` (the engine stays free of I/O):

1. **Driver:** `better-sqlite3` (13.x, SQLite 3.53), synchronous, in WAL mode
   with foreign keys on. It installs from a prebuilt binary on Node 22; no
   build toolchain is needed. The store defaults to `var/store.sqlite`,
   git-ignored like every `*.sqlite` file.
2. **Migrations:** an append-only list in `migrations.ts`, each applied once
   in its own transaction and recorded in `schema_migrations`. Opening a
   database written by a newer app (an unknown version), or one whose
   applied migration names differ from the list, fails instead of guessing.
3. **Snapshots are immutable.** `snapshots` plus `snapshot_artifacts`,
   `snapshot_sidecar`, `snapshot_characters` and `snapshot_weapons`, each
   row keyed by the snapshot and the item's position in the file. `BEFORE
UPDATE` triggers abort any change; deleting a snapshot cascades to what
   it owns, and is refused while a merge still refers to it.
4. **One file, one snapshot.** A snapshot is identified by the SHA-256 of
   the file's text, so importing the same file again returns the existing
   snapshot and writes nothing (idempotent re-import).
5. **A faulty scan is stored, not merged.** Its fault is recorded on the
   snapshot, so the import is visible, and the engine's merge rejects it.
6. **Merges are recorded too:** `merges` (which snapshots, what was
   rejected, the reconciliation reports) and `merged_artifacts` (values,
   lock, which snapshot gave the values and the location, every
   appearance). Derived and recomputable, but kept, as the account's
   history. `current_account` is a SQL view over the latest merge.
7. **Stored rows are untrusted on the way out** (ADR-0022): artifacts are
   checked with `isPersistedArtifact`, extras with the engine's zod schema,
   and a corrupt row is an error naming it.
8. **Ids by place:** a stored artifact has no id of its own. It is
   `s<snapshot>-<index>` when read from a snapshot and `m<merge>-<ord>`
   from a merge, so ids are stable across reads.

## Consequences

- On the owner's exports: the Irminsul file imports in ~110 ms, re-importing
  it writes nothing, both AdeptiScanner files are stored with their fault,
  merging all three takes ~95 ms (both scans rejected), and the store with
  three snapshots and one merge is 5.2 MB.
- Which snapshots a merge uses is a policy, not a schema question.
  `latestUsableSnapshots` (the newest non-faulty snapshot of each source
  kind) is the default; the inbox watcher (2.7) and the diff (2.8) decide
  when to merge.
- `game_version` is a column but stays empty: GOOD files don't carry it.
- The schema only grows by new migrations; a change to a shipped one needs
  a new migration that moves the data.

## Rejected alternatives

- **`node:sqlite`** (built into Node 22). Still experimental in Node 22 and
  warns on use; `better-sqlite3` is what ADR-0021 and CLAUDE.md name.
- **Store merges only as a query-time computation.** The merge is TS logic,
  not SQL, and recording it keeps the account's history and makes the
  current account a cheap read.
- **Update snapshot rows in place.** Breaks CLAUDE.md's "never overwrite an
  import" and loses the history the diff needs.
