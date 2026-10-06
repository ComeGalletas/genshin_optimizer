/**
 * The local server's imports (TODO 8.1, ADR-0049): its snapshots and
 * merges, what each snapshot changed, how a merge reconciled its
 * snapshots, and the two ways in (an upload, or a scan of the inbox).
 * Types mirror the server's answers; only what the import center reads is
 * named.
 * @packageDocumentation
 */

import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { serverJson } from './client';

export type SourceKind = 'irminsul' | 'ocr' | 'good' | 'enka';

/** Pieces seen three or more times in one scan (ADR-0026). */
export interface ScanFault {
  repeatedPieces: number;
  extraEntries: number;
}

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

export interface MergeRecord {
  id: number;
  createdAt: string;
  snapshotIds: number[];
  rejected: { snapshot: string; fault: ScanFault }[];
  artifacts: number;
}

export interface Imports {
  /** Oldest first. */
  snapshots: SnapshotInfo[];
  /** Oldest first; the last is the current account. */
  merges: MergeRecord[];
}

export interface ImportDiff {
  added: number[];
  removed: number[];
  upgraded: { before: number; after: number; by: 'first-rolls' | 'rolls' }[];
  moved: { before: number; after: number; from?: string; to?: string }[];
  lockChanged: { before: number; after: number; lock?: boolean }[];
  unchanged: number;
  unexplained: { before?: number; after?: number; why: string }[];
}

export interface SnapshotChanges {
  from: number;
  to: number;
  diff: ImportDiff;
  /** The pieces the diff names, by position: `before` in snapshot `from`,
   *  `after` in snapshot `to`. */
  pieces: {
    before: Record<number, Artifact>;
    after: Record<number, Artifact>;
  };
}

export interface MergeReport {
  merge: MergeRecord;
  /** The most pieces listed per kind; counts are whole. */
  listCap: number;
  reports: {
    snapshot: number;
    against: number[];
    counts: {
      paired: number;
      exact: number;
      fuzzy: number;
      levelled: number;
      mismatches: number;
      moved: number;
      onlySnapshot: number;
      onlyAccount: number;
    };
    mismatches: { account: Artifact; snapshot: Artifact; stats: string[] }[];
    moved: { account: Artifact; snapshot: Artifact }[];
    onlySnapshot: Artifact[];
    onlyAccount: Artifact[];
  }[];
}

export type InboxEvent =
  | { file: string; status: 'imported'; snapshot: SnapshotInfo; issues: number }
  | { file: string; status: 'faulty-scan'; snapshot: SnapshotInfo }
  | { file: string; status: 'already-imported'; snapshot: SnapshotInfo }
  | { file: string; status: 'refused'; reason: string };

export interface InboxRun {
  events: InboxEvent[];
  merge?: MergeRecord;
}

export function fetchImports(): Promise<Imports> {
  return serverJson('/imports', { timeoutMs: 10_000 });
}

export async function fetchChanges(
  snapshotId: number,
): Promise<SnapshotChanges | null> {
  const r = await serverJson<{ changes: SnapshotChanges | null }>(
    `/imports/${snapshotId}/changes`,
    { timeoutMs: 30_000 },
  );
  return r.changes;
}

export function fetchMergeReport(mergeId: number): Promise<MergeReport> {
  return serverJson(`/imports/merges/${mergeId}`, { timeoutMs: 30_000 });
}

export function scanInbox(): Promise<InboxRun> {
  return serverJson('/imports/scan', { method: 'POST', timeoutMs: 120_000 });
}

/** Send a GOOD file to the server, as if dropped in its inbox; its time
 *  (`lastModified`) orders it among the snapshots. */
export async function uploadImport(file: File): Promise<InboxRun> {
  return serverJson('/imports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: await file.text(),
      fileName: file.name,
      ...(file.lastModified && {
        takenAt: new Date(file.lastModified).toISOString(),
      }),
    }),
    timeoutMs: 120_000,
  });
}
