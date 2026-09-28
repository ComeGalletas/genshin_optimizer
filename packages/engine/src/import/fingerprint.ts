/**
 * Artifact fingerprint: the identity used to recognise the same artifact
 * across imports and sources (ADR-0025). The game gives artifacts no ID that
 * GOOD carries, so identity is content: set, slot, rarity, level, main stat
 * (with the goblet's element) and the active substats, each rounded to the
 * precision the game shows. The unactivated fourth line, location and lock are
 * left out: a source may not export the line, and the others change as the
 * player equips and locks pieces.
 *
 * A fingerprint is not unique. Two identical pieces are possible, and a faulty
 * scan can repeat one many times, so matching pairs pieces one to one.
 *
 * Sources disagree at the last shown digit when the raw value sits on a
 * rounding edge: an OCR scanner reads the game's display (DEF% 19.0), a memory
 * reader rounds the raw sum (6.56 + 5.83 + 6.56 = 18.95, exported as 18.9).
 * The fuzzy fallback accepts one step of display precision per substat, and
 * only when exactly one candidate fits.
 * @packageDocumentation
 */

import type { Artifact, StatKey, SubStat } from '../game/types';

/** Flat stats show as integers; every other stat shows one decimal. */
const FLAT: ReadonlySet<StatKey> = new Set(['hp', 'atk', 'def', 'em']);

/** A substat value in display steps: whole points for flat stats, tenths
 *  for percentages. Integers, so comparisons are exact. */
export const displaySteps = (s: SubStat): number =>
  Math.round(FLAT.has(s.key) ? s.value : s.value * 10);

const sortedSubs = (a: Artifact) =>
  [...a.subStats].sort((x, y) => x.key.localeCompare(y.key));

/** Everything but the substat values: pieces a fuzzy match may pair. */
function shapeOf(a: Artifact): string {
  const keys = sortedSubs(a).map((s) => s.key);
  return `${a.setKey}|${a.slot}|${a.rarity}|${a.level}|${a.mainStat}|${a.element ?? ''}|${keys.join(',')}`;
}

/** The artifact's fingerprint. Independent of `id`, location, lock and the
 *  order the substats were recorded in. */
export function fingerprint(a: Artifact): string {
  const subs = sortedSubs(a).map((s) => `${s.key}:${displaySteps(s)}`);
  return `${a.setKey}|${a.slot}|${a.rarity}|${a.level}|${a.mainStat}|${a.element ?? ''}|${subs.join(',')}`;
}

/** Whether two pieces of the same shape differ by at most one display step
 *  on every substat. */
function withinOneStep(a: Artifact, b: Artifact): boolean {
  const x = sortedSubs(a);
  const y = sortedSubs(b);
  return x.every((s, i) => Math.abs(displaySteps(s) - displaySteps(y[i])) <= 1);
}

export interface ArtifactPair {
  /** Index into the left list. */
  left: number;
  /** Index into the right list. */
  right: number;
  kind: 'exact' | 'fuzzy';
}

export interface ArtifactMatch {
  pairs: ArtifactPair[];
  /** Left pieces nothing on the right matched. */
  onlyLeft: number[];
  /** Right pieces nothing on the left matched, ambiguous ones included. */
  onlyRight: number[];
  /** Right pieces with more than one fuzzy candidate on the left: left
   *  unmatched rather than paired by a guess. */
  ambiguous: number[];
}

/**
 * Pair two artifact lists one to one: exact fingerprints first, then the
 * fuzzy fallback on what is left. Pure, and deterministic for a given order.
 */
export function matchArtifacts(
  left: readonly Artifact[],
  right: readonly Artifact[],
): ArtifactMatch {
  const pairs: ArtifactPair[] = [];
  const leftFree = new Set(left.map((_, i) => i));
  const rightLeftover: number[] = [];

  const byPrint = new Map<string, number[]>();
  left.forEach((a, i) => {
    const k = fingerprint(a);
    const list = byPrint.get(k);
    if (list) list.push(i);
    else byPrint.set(k, [i]);
  });
  right.forEach((b, j) => {
    const i = byPrint.get(fingerprint(b))?.shift();
    if (i === undefined) {
      rightLeftover.push(j);
      return;
    }
    leftFree.delete(i);
    pairs.push({ left: i, right: j, kind: 'exact' });
  });

  const byShape = new Map<string, number[]>();
  for (const i of leftFree) {
    const k = shapeOf(left[i]);
    const list = byShape.get(k);
    if (list) list.push(i);
    else byShape.set(k, [i]);
  }
  const onlyRight: number[] = [];
  const ambiguous: number[] = [];
  for (const j of rightLeftover) {
    const pool = byShape.get(shapeOf(right[j])) ?? [];
    const fits = pool.filter((i) => withinOneStep(left[i], right[j]));
    if (fits.length === 1) {
      pool.splice(pool.indexOf(fits[0]), 1);
      leftFree.delete(fits[0]);
      pairs.push({ left: fits[0], right: j, kind: 'fuzzy' });
      continue;
    }
    if (fits.length > 1) ambiguous.push(j);
    onlyRight.push(j);
  }
  return { pairs, onlyLeft: [...leftFree], onlyRight, ambiguous };
}

/** Fingerprints that occur more than once in a list, with their counts. A
 *  pair can be real; a long run of repeats is the mark of a scanner that
 *  stopped scrolling and re-read one page. */
export function repeatedFingerprints(
  list: readonly Artifact[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of list) {
    const k = fingerprint(a);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [k, n] of counts) if (n < 2) counts.delete(k);
  return counts;
}
