/**
 * The web app's GOOD entry points, kept with their original contracts:
 * `parseGOOD` returns the usable artifacts or `{ error: 'BAD_FORMAT' }`, and
 * `parseGOODRoster` the owned characters. Both are views of
 * `normalizeGOOD` (`../good/normalize.ts`), which also reports what it
 * skipped and returns the full weapon inventory, lock flags and the file's
 * source; the server's importer uses that directly.
 * @packageDocumentation
 */

import type { Artifact } from '../game/types';
import { normalizeGOOD, type RosterEntry } from '../good/normalize';

export type { RosterEntry };

export function parseGOOD(json: unknown): Artifact[] | { error: 'BAD_FORMAT' } {
  const good = normalizeGOOD(json);
  if (!good || good.artifacts === null) return { error: 'BAD_FORMAT' };
  return good.artifacts.map((e) => e.artifact);
}

/** Owned-roster extraction: which characters the player owns, what weapon
 *  each has equipped, and the build level their ascension implies. Keys the
 *  dataset doesn't know (e.g. "TravelerAnemo") are skipped. */
export function parseGOODRoster(json: unknown): Record<string, RosterEntry> {
  return normalizeGOOD(json)?.roster ?? {};
}
