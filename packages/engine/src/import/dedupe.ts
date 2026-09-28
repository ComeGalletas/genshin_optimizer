/**
 * GOOD inventory import: parsing and validating a GOOD export into
 * artifacts/roster entries, content-hash dedupe against the existing
 * inventory, and UID-based (Enka.Network) convenience import (ADR-0006).
 * @packageDocumentation
 */

import type { Artifact } from '../game/types';
import { fingerprint } from './fingerprint';

/** Stable content hash for dedupe: the artifact fingerprint (ADR-0025), so
 *  manual entry, GOOD and Enka imports all dedupe on one identity.
 *  Independent of `id`. */
export const artifactHash: (a: Artifact) => string = fingerprint;

/**
 * The subset of `incoming` whose content (per artifactHash, id-independent) is
 * not already present in `existing`. Pure: callers add the result to the store.
 */
export function mergeNew(
  existing: Artifact[],
  incoming: Artifact[],
): Artifact[] {
  const seen = new Set(existing.map(artifactHash));
  return incoming.filter((a) => !seen.has(artifactHash(a)));
}
