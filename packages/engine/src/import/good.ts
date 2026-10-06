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
  // The roll data the source exported, for showing each line's rolls.
  return good.artifacts.map(({ artifact, extras }) => {
    const first = extras?.initialValues
      ? Object.fromEntries(
          artifact.subStats
            .filter((s) => extras.initialValues![s.key] !== undefined)
            .map((s) => [s.key, extras.initialValues![s.key]]),
        )
      : undefined;
    const rolls = {
      ...(first && Object.keys(first).length > 0 && { first }),
      ...(extras?.totalRolls !== undefined && { total: extras.totalRolls }),
    };
    return Object.keys(rolls).length ? { ...artifact, rolls } : artifact;
  });
}

/** Owned-roster extraction: which characters the player owns, what weapon
 *  each has equipped, and the build level their ascension implies. Keys the
 *  dataset doesn't know (e.g. "TravelerAnemo") are skipped. */
export function parseGOODRoster(json: unknown): Record<string, RosterEntry> {
  return normalizeGOOD(json)?.roster ?? {};
}
