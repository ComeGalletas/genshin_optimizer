# 0049. The import center: the server's imports in the web app

- Status: Accepted
- Date: 2026-10-05
- Extends: [0030](0030-local-http-api.md) (its `/imports` routes)

## Context

Phase 8 starts with an import center: the sources, the snapshots, the
reconciliation report and the diff, in the web app. The server already
keeps all of it (ADR-0027, 0028, 0029) but showed little: `GET /imports`
lists snapshots and merges, and a snapshot's changes come as positions in
two piece lists (`added: [412]`), which only the server can turn into
pieces. Each merge's reconciliation reports were written to the store and
never read back. Files came in only through the inbox folder, so the
owner had to leave the browser to import.

## Decision

- **Pieces with every change.** `GET /imports/:id/changes` adds
  `pieces.before` and `pieces.after`: the artifacts the diff names, by
  position, from the earlier and the later snapshot. Additive: the diff
  is unchanged.
- **A merge's reconciliation**, `GET /imports/merges/:id`: per snapshot
  merged after the first, the counts (paired, by kind; mismatched; moved;
  only in the snapshot; only in the account) and the pieces behind each,
  up to 100 per kind (`MERGE_LIST_CAP`; an Enka showcase leaves
  thousands "not in this snapshot"). An account piece is shown as first
  read (its first appearance), the reading the report paired against.
- **Upload**, `POST /imports` with `{text, fileName?, takenAt?}` (32 MB):
  the inbox's path for one file (`importText`, shared with the inbox), so
  an upload is a snapshot like any other and merges the same way. The
  time is the file's (`lastModified`), normalised to the store's ISO form:
  merges order snapshots by comparing those strings.
- **The web section** (`packages/web/src/import-center/`), unnumbered and
  lazy, shown only while the server runs, as Compare Teams is (ADR-0046):
  the sources in precedence order with what each puts in the account,
  the snapshots newest first (faulty scans marked and kept out), what each
  changed with the pieces, the current merge's reconciliation with older
  merges on request, and the two ways in. It never touches the page's
  inventory: a new merge is loaded into the page from step 01, as before
  (ADR-0034), so the "replace" confirmation stays in one place.

## Consequences

- A `Load Account` after an import is one more click; in exchange the
  page's inventory changes only when the owner asks.
- Times show in UTC, the same on every machine (the app avoids
  host-locale formatting).
- No route chooses which snapshots a merge takes: the newest usable one
  of each source, as the inbox does. A merge of the owner's choosing
  would need its own decision.
