/**
 * The import inbox (TODO 2.7): every GOOD file dropped into `imports/inbox/`
 * (Irminsul, OCR scanners, `genshin-agent`) becomes a snapshot in the store,
 * and a new merge is recorded when a usable one arrives.
 *
 * Files stay where they are. A file already imported (same SHA-256) costs a
 * hash, so a rescan is idempotent. A file that isn't GOOD is reported and
 * skipped; a faulty scan is stored with its fault but starts no merge
 * (ADR-0026). The source is read from the file (`source`, ADR-0027).
 * @packageDocumentation
 */

import { readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { basename, join } from 'node:path';
import { fromRoot } from '../paths';
import {
  diffSincePrevious,
  importGood,
  latestUsableSnapshots,
  recordMerge,
  StoreError,
  type MergeRecord,
  type SnapshotDiff,
  type SnapshotInfo,
  type Store,
} from '../store/store';

/** The inbox, relative to the repository root. */
export const DEFAULT_INBOX = fromRoot('imports/inbox');

export type InboxEvent =
  | {
      file: string;
      status: 'imported';
      snapshot: SnapshotInfo;
      issues: number;
      /** What changed since the previous snapshot from the same kind of
       *  source; absent for the first. */
      changes?: SnapshotDiff;
    }
  | { file: string; status: 'faulty-scan'; snapshot: SnapshotInfo }
  | { file: string; status: 'already-imported'; snapshot: SnapshotInfo }
  | { file: string; status: 'refused'; reason: string };

export interface InboxRun {
  events: InboxEvent[];
  /** The merge recorded because a usable snapshot arrived, if any. */
  merge?: MergeRecord;
}

/** Files the inbox considers: visible `.json` files, in name order. */
export function inboxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) => e.isFile() && !e.name.startsWith('.') && /\.json$/i.test(e.name),
    )
    .map((e) => e.name)
    .sort();
}

/** Import one file; never throws for a bad file. */
export function importFile(db: Store, path: string): InboxEvent {
  const file = basename(path);
  let text: string;
  let takenAt: string;
  try {
    text = readFileSync(path, 'utf8');
    takenAt = statSync(path).mtime.toISOString();
  } catch (e) {
    return { file, status: 'refused', reason: (e as Error).message };
  }
  try {
    const r = importGood(db, { text, fileName: file, takenAt });
    if (!r.created)
      return { file, status: 'already-imported', snapshot: r.snapshot };
    if (r.snapshot.fault)
      return { file, status: 'faulty-scan', snapshot: r.snapshot };
    const changes = diffSincePrevious(db, r.snapshot.id);
    return {
      file,
      status: 'imported',
      snapshot: r.snapshot,
      issues: r.issues.length,
      ...(changes && { changes }),
    };
  } catch (e) {
    if (e instanceof StoreError)
      return { file, status: 'refused', reason: e.message };
    throw e;
  }
}

/**
 * Import every file in the inbox, then record one merge of the newest
 * usable snapshot of each source kind if anything usable was new.
 */
export function processInbox(
  db: Store,
  dir: string = DEFAULT_INBOX,
  files: readonly string[] = inboxFiles(dir),
): InboxRun {
  const events = files.map((f) => importFile(db, join(dir, f)));
  const run: InboxRun = { events };
  if (events.some((e) => e.status === 'imported'))
    run.merge = recordMerge(db, latestUsableSnapshots(db));
  return run;
}

export interface WatchOptions {
  /** How long a file must stay the same size before it is read, so a file
   *  still being written isn't imported half-done. */
  settleMs?: number;
  onRun?: (run: InboxRun) => void;
  onError?: (e: unknown) => void;
}

/**
 * Process the inbox now, then again whenever it changes. Returns a function
 * that stops watching.
 */
export function watchInbox(
  db: Store,
  dir: string = DEFAULT_INBOX,
  opts: WatchOptions = {},
): () => void {
  const settleMs = opts.settleMs ?? 1000;
  const report = (run: InboxRun) => opts.onRun?.(run);
  const fail = (e: unknown) =>
    opts.onError ? opts.onError(e) : console.error(e);
  try {
    report(processInbox(db, dir));
  } catch (e) {
    fail(e);
  }

  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const sizes = new Map<string, number>();
  const settle = (name: string) => {
    clearTimeout(pending.get(name));
    pending.set(
      name,
      setTimeout(() => {
        pending.delete(name);
        let size: number;
        try {
          size = statSync(join(dir, name)).size;
        } catch {
          sizes.delete(name); // removed again before it settled
          return;
        }
        if (sizes.get(name) !== size) {
          sizes.set(name, size);
          settle(name); // still growing: look again later
          return;
        }
        sizes.delete(name);
        try {
          report(processInbox(db, dir, [name]));
        } catch (e) {
          fail(e);
        }
      }, settleMs),
    );
  };
  const watcher = watch(dir, (_event, name) => {
    if (name && !name.startsWith('.') && /\.json$/i.test(name)) settle(name);
  });
  return () => {
    watcher.close();
    for (const t of pending.values()) clearTimeout(t);
    pending.clear();
  };
}
