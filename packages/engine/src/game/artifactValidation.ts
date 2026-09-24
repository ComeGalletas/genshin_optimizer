/**
 * Client-side Zustand stores for the app's persisted and session state:
 * artifact inventory, roster, the current optimize request, and
 * manual-artifact-form validation.
 * @packageDocumentation
 */

import type { Artifact, StatKey, SubStat } from './types';
import { ELEMENTS, isStatKey, SLOTS } from './types';

export interface ArtifactDraft {
  mainStat: StatKey;
  level: number;
  subStats: SubStat[];
}

/**
 * The longest a dataset key (character, weapon, set) may be at any untrusted
 * seam. One definition, shared by the AI proxy payload guard, the ?b= share
 * link and the GOOD importer, so "bounded like the others" is a fact rather
 * than a comment. Lives here because this module reaches neither the game
 * adapter nor the DOM, so `api/` can import it without bundling the dataset.
 */
export const MAX_KEY_LEN = 64;

export function validateArtifactDraft(d: ArtifactDraft): string | null {
  // NaN/Infinity fail no comparison, so they slip past the range check below
  // and reach the optimiser as a level. Reject them here, once, rather than in
  // each of the three importers.
  if (!Number.isFinite(d.level)) return 'Level must be between 0 and 20.';
  if (d.level < 0 || d.level > 20) return 'Level must be between 0 and 20.';
  if (d.subStats.length > 4 || d.subStats.some((s) => s.key === d.mainStat)) {
    return 'An artifact can have at most 4 sub-stats, none matching the main stat.';
  }
  // A stat can roll at most once per artifact. Beyond being wrong, repeats are
  // rendered keyed by stat (BuildCard), so duplicates collide as React keys.
  if (new Set(d.subStats.map((s) => s.key)).size !== d.subStats.length) {
    return 'Each sub-stat can appear only once.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// isPersistedArtifact — the structural guard for untrusted stored/shared pieces
// ---------------------------------------------------------------------------

function isShortString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= MAX_KEY_LEN;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isSubStat(x: unknown): x is SubStat {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return isStatKey(s.key) && isFiniteNumber(s.value);
}

/**
 * Whether an untrusted value really is an `Artifact`. Two seams hand the app
 * artifacts it never validated — a `?b=` share link and a localStorage blob
 * written by an older build — and both need exactly this answer, so there is
 * one definition rather than one per seam.
 *
 * Structure and vocabulary first (slot/stat keys, finite numbers, bounded
 * strings), then the same roll invariants manual entry and GOOD import enforce
 * via `validateArtifactDraft`. Level 0 is legal: an unlevelled piece is real.
 */
export function isPersistedArtifact(x: unknown): x is Artifact {
  if (typeof x !== 'object' || x === null) return false;
  const a = x as Record<string, unknown>;
  return (
    isShortString(a.id) &&
    isShortString(a.setKey) &&
    (SLOTS as string[]).includes(a.slot as string) &&
    isFiniteNumber(a.rarity) &&
    isFiniteNumber(a.level) &&
    isStatKey(a.mainStat) &&
    isFiniteNumber(a.mainStatValue) &&
    Array.isArray(a.subStats) &&
    a.subStats.every(isSubStat) &&
    // Optional (ADR-0014): absent on links/blobs minted before element tracking
    // existed. Only ever meaningful on an elemental_dmg goblet — reject it
    // anywhere else rather than silently accepting an inconsistent artifact.
    (a.element === undefined ||
      ((ELEMENTS as readonly string[]).includes(a.element as string) &&
        a.slot === 'goblet' &&
        a.mainStat === 'elemental_dmg')) &&
    validateArtifactDraft({
      mainStat: a.mainStat,
      level: a.level,
      subStats: a.subStats as SubStat[],
    }) === null
  );
}
