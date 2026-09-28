/**
 * Merging snapshots from several sources into one account view, and the
 * reconciliation report between two of them (TODO 2.5, ADR-0027).
 *
 * - **Values** (substats, level) come from the highest-ranked source that
 *   has the piece: Irminsul > OCR > other GOOD > Enka (ADR-0026).
 * - **Location and lock** come from the newest snapshot that has the piece,
 *   so a re-equip seen by any source wins over an older reading.
 * - **Nothing is lost:** every piece of every merged snapshot ends up in
 *   exactly one merged artifact, which lists every appearance.
 * - **Nothing is guessed:** pieces pair on fingerprint, the one-step fuzzy
 *   fallback, or a shared first-roll key (a piece levelled between
 *   snapshots). Two pieces of the same shape that differ by more are listed
 *   as a mismatch and kept apart.
 * - **A faulty scan is rejected,** not merged (ADR-0026): one whose entries
 *   repeat 3 or more times.
 * @packageDocumentation
 */

import type { Artifact } from '../game/types';
import {
  displaySteps,
  matchArtifacts,
  repeatedFingerprints,
} from '../import/fingerprint';
import { firstRollKey } from '../good/sidecar';
import type { ArtifactExtras } from '../good/extras';

/** Where a snapshot came from, in merge precedence order. */
export const SOURCE_KINDS = ['irminsul', 'ocr', 'good', 'enka'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** A GOOD file's `source` string → its kind. Unknown exporters (Genshin
 *  Optimizer, hand-written files) rank below OCR, above Enka. */
export function sourceKind(source: string | undefined): SourceKind {
  const s = source?.toLowerCase() ?? '';
  if (s.includes('irminsul')) return 'irminsul';
  if (/kamera|adepti|scanner|genshin-agent|ocr/.test(s)) return 'ocr';
  if (s.includes('enka')) return 'enka';
  return 'good';
}

/** One piece as a snapshot holds it (a `GoodArtifactEntry` fits). */
export interface SnapshotPiece {
  artifact: Artifact;
  lock?: boolean;
  extras?: ArtifactExtras;
}

export interface SourceSnapshot {
  id: string;
  kind: SourceKind;
  /** When the export was taken, ISO 8601. */
  takenAt: string;
  pieces: SnapshotPiece[];
}

/** A snapshot this many copies of one fingerprint is a scanner fault. Two
 *  identical pieces can be real; three have not been seen outside a
 *  faulty scan. */
export const SCAN_FAULT_REPEATS = 3;

export interface ScanFault {
  /** Fingerprints repeated SCAN_FAULT_REPEATS times or more. */
  repeatedPieces: number;
  /** Entries beyond the first copy of those fingerprints. */
  extraEntries: number;
}

export function scanFault(
  pieces: readonly SnapshotPiece[],
): ScanFault | undefined {
  const bad = [
    ...repeatedFingerprints(pieces.map((p) => p.artifact)).values(),
  ].filter((n) => n >= SCAN_FAULT_REPEATS);
  if (!bad.length) return undefined;
  return {
    repeatedPieces: bad.length,
    extraEntries: bad.reduce((s, n) => s + n - 1, 0),
  };
}

// ---------------------------------------------------------------------------
// Reconciliation: pair two lists and say how they differ
// ---------------------------------------------------------------------------

export type PairKind = 'exact' | 'fuzzy' | 'levelled';

export interface PiecePair {
  a: number;
  b: number;
  kind: PairKind;
}

export interface Reconciliation {
  pairs: PiecePair[];
  /** Same set, slot, rarity, level, main stat, element and substat keys,
   *  the only such candidate on each side, but more than one shown step
   *  apart: a misread or two different pieces. Not paired. */
  mismatches: { a: number; b: number; stats: string[] }[];
  /** Pairs whose location differs: re-equips, or a stale snapshot. */
  moved: { a: number; b: number }[];
  /** Pieces with no pair and no mismatch on the other side. */
  onlyA: number[];
  onlyB: number[];
}

const shape = (x: Artifact) =>
  `${x.setKey}|${x.slot}|${x.rarity}|${x.level}|${x.mainStat}|${x.element ?? ''}|${x.subStats
    .map((s) => s.key)
    .sort()
    .join(',')}`;

const rollKey = (p: SnapshotPiece) =>
  firstRollKey(p.artifact, p.extras?.initialValues);

/** Keys that occur exactly once in a list, mapped to their position. */
function uniqueBy<T>(
  idx: readonly number[],
  key: (i: number) => T | undefined,
): Map<T, number> {
  const seen = new Map<T, number>();
  const dup = new Set<T>();
  for (const i of idx) {
    const k = key(i);
    if (k === undefined) continue;
    if (seen.has(k)) dup.add(k);
    else seen.set(k, i);
  }
  for (const k of dup) seen.delete(k);
  return seen;
}

/** Pair two snapshots' pieces and report every difference. Pure. */
export function reconcile(
  a: readonly SnapshotPiece[],
  b: readonly SnapshotPiece[],
): Reconciliation {
  const m = matchArtifacts(
    a.map((p) => p.artifact),
    b.map((p) => p.artifact),
  );
  const pairs: PiecePair[] = m.pairs.map((p) => ({
    a: p.left,
    b: p.right,
    kind: p.kind,
  }));
  let onlyA = m.onlyLeft;
  let onlyB = m.onlyRight;

  // A piece levelled between the two snapshots: same first rolls.
  const aByRoll = uniqueBy(onlyA, (i) => rollKey(a[i]));
  const bByRoll = uniqueBy(onlyB, (j) => rollKey(b[j]));
  for (const [k, i] of aByRoll) {
    const j = bByRoll.get(k);
    if (j !== undefined) pairs.push({ a: i, b: j, kind: 'levelled' });
  }
  const pairedA = new Set(pairs.map((p) => p.a));
  const pairedB = new Set(pairs.map((p) => p.b));
  onlyA = onlyA.filter((i) => !pairedA.has(i));
  onlyB = onlyB.filter((j) => !pairedB.has(j));

  // Same shape, one candidate each side, too far apart to pair.
  const aByShape = uniqueBy(onlyA, (i) => shape(a[i].artifact));
  const bByShape = uniqueBy(onlyB, (j) => shape(b[j].artifact));
  const mismatches: Reconciliation['mismatches'] = [];
  for (const [k, i] of aByShape) {
    const j = bByShape.get(k);
    if (j === undefined) continue;
    const bSubs = b[j].artifact.subStats;
    const stats = a[i].artifact.subStats
      .filter((s) => {
        const t = bSubs.find((x) => x.key === s.key)!;
        return displaySteps(s) !== displaySteps(t);
      })
      .map((s) => s.key);
    mismatches.push({ a: i, b: j, stats });
  }
  const misA = new Set(mismatches.map((x) => x.a));
  const misB = new Set(mismatches.map((x) => x.b));
  onlyA = onlyA.filter((i) => !misA.has(i));
  onlyB = onlyB.filter((j) => !misB.has(j));

  const moved = pairs
    .filter((p) => a[p.a].artifact.location !== b[p.b].artifact.location)
    .map(({ a: x, b: y }) => ({ a: x, b: y }));
  return { pairs, mismatches, moved, onlyA, onlyB };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export interface Appearance {
  snapshot: string;
  /** Position in that snapshot's `pieces`. */
  index: number;
}

export interface MergedArtifact {
  /** Values from `valuesFrom`, location from `locationFrom`. */
  artifact: Artifact;
  lock?: boolean;
  valuesFrom: string;
  locationFrom: string;
  /** Every snapshot piece merged into this artifact. */
  seenIn: Appearance[];
}

export interface MergeResult {
  artifacts: MergedArtifact[];
  /** Snapshots left out, and why. */
  rejected: { snapshot: string; fault: ScanFault }[];
  /** Each merged snapshot against the account as merged before it, in merge
   *  order (the first snapshot has none). */
  reports: { snapshot: string; against: string[]; report: Reconciliation }[];
}

const rank = (k: SourceKind) => SOURCE_KINDS.indexOf(k);

/**
 * Merge snapshots into one account view. Snapshots are merged in precedence
 * order (source rank, then newest first), each paired against everything
 * merged before it. Pure and deterministic.
 */
export function mergeSnapshots(
  snapshots: readonly SourceSnapshot[],
): MergeResult {
  const rejected: MergeResult['rejected'] = [];
  const usable = snapshots.filter((s) => {
    const fault = scanFault(s.pieces);
    if (fault) rejected.push({ snapshot: s.id, fault });
    return !fault;
  });
  const order = [...usable].sort(
    (x, y) =>
      rank(x.kind) - rank(y.kind) ||
      y.takenAt.localeCompare(x.takenAt) ||
      x.id.localeCompare(y.id),
  );
  const takenAt = new Map(order.map((s) => [s.id, s.takenAt]));

  // Merged pieces carry the snapshot piece their values came from, so the
  // next snapshot is reconciled against real pieces (with their extras).
  const merged: (MergedArtifact & { piece: SnapshotPiece })[] = [];
  const reports: MergeResult['reports'] = [];
  for (const snap of order) {
    const add = (p: SnapshotPiece, index: number) =>
      merged.push({
        artifact: p.artifact,
        lock: p.lock,
        valuesFrom: snap.id,
        locationFrom: snap.id,
        seenIn: [{ snapshot: snap.id, index }],
        piece: p,
      });
    if (!merged.length) {
      snap.pieces.forEach(add);
      continue;
    }
    const report = reconcile(
      merged.map((x) => x.piece),
      snap.pieces,
    );
    reports.push({
      snapshot: snap.id,
      against: [
        ...new Set(merged.flatMap((x) => x.seenIn.map((s) => s.snapshot))),
      ],
      report,
    });
    for (const pair of report.pairs) {
      const into = merged[pair.a];
      const p = snap.pieces[pair.b];
      into.seenIn.push({ snapshot: snap.id, index: pair.b });
      const newer = snap.takenAt > takenAt.get(into.locationFrom)!;
      // A levelled piece changed after the older reading: the newer one
      // holds its current values, whatever the source rank.
      if (
        pair.kind === 'levelled' &&
        snap.takenAt > takenAt.get(into.valuesFrom)!
      ) {
        into.artifact = { ...p.artifact, location: into.artifact.location };
        into.valuesFrom = snap.id;
        into.piece = p;
      }
      if (newer) {
        into.artifact = { ...into.artifact, location: p.artifact.location };
        // Enka has no lock state: keep the last one known.
        if (p.lock !== undefined) into.lock = p.lock;
        into.locationFrom = snap.id;
      }
    }
    for (const j of report.onlyB) add(snap.pieces[j], j);
    for (const { b: j } of report.mismatches) add(snap.pieces[j], j);
  }
  return {
    artifacts: merged.map((m) => ({
      artifact: m.artifact,
      ...(m.lock !== undefined && { lock: m.lock }),
      valuesFrom: m.valuesFrom,
      locationFrom: m.locationFrom,
      seenIn: m.seenIn,
    })),
    rejected,
    reports,
  };
}
