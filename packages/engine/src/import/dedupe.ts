/**
 * GOOD inventory import: parsing and validating a GOOD export into
 * artifacts/roster entries, content-hash dedupe against the existing
 * inventory, and UID-based (Enka.Network) convenience import (ADR-0006).
 * @packageDocumentation
 */

import type { Artifact } from '../game/types';

/** Stable content hash for dedupe. Independent of `id`. */
export function artifactHash(a: Artifact): string {
  const subs = [...a.subStats]
    .sort((x, y) => x.key.localeCompare(y.key))
    .map((s) => `${s.key}:${s.value}`)
    .join(',');
  return `${a.setKey}|${a.slot}|${a.rarity}|${a.level}|${a.mainStat}|${a.element ?? ''}|${subs}`;
}

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
