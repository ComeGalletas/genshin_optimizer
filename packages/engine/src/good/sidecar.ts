/**
 * The sidecar (TODO 2.3): source-specific artifact extras, kept beside the
 * normalized inventory and keyed by artifact fingerprint (ADR-0025), so a
 * source's roll data survives import without widening the `Artifact` model
 * the optimizer reads.
 *
 * One entry per artifact that has extras. A fingerprint can repeat (identical
 * pieces, or a faulty scan), so entries are a list and the index maps each
 * fingerprint to all of its entries, in file order.
 *
 * `firstRollKey` is an identity that survives levelling: set, slot, rarity,
 * main stat, element and every line's first roll. A piece gets one only when
 * the source gave the first roll of all 4 lines (Irminsul does; an OCR
 * scanner only for pieces whose every line holds one roll). The upgrade diff
 * (TODO 2.8) can pair a piece across snapshots with it after the fingerprint
 * changed.
 * @packageDocumentation
 */

import * as z from 'zod/mini';
import type { Artifact, StatKey } from '../game/types';
import { displaySteps, fingerprint } from '../import/fingerprint';
import { ArtifactExtras } from './extras';
import type { NormalizedGood } from './normalize';

/** One sidecar record, as stored with a snapshot (TODO 2.6). */
export const SidecarEntry = z.object({
  fingerprint: z.string(),
  /** Position in the source file's `artifacts` list. */
  index: z.number().check(z.int(), z.minimum(0)),
  firstRollKey: z.optional(z.string()),
  extras: ArtifactExtras,
});
export type SidecarEntry = z.infer<typeof SidecarEntry>;

export interface Sidecar {
  /** The exporting tool, from the file (`source`). */
  source?: string;
  entries: SidecarEntry[];
}

/** The level-independent identity, or undefined unless all 4 lines' first
 *  rolls are known. */
export function firstRollKey(
  a: Artifact,
  initialValues: Record<string, number> | undefined,
): string | undefined {
  if (!initialValues) return undefined;
  const lines = Object.entries(initialValues);
  if (lines.length !== 4) return undefined;
  const rolls = lines
    .map(
      ([key, value]) =>
        `${key}:${displaySteps({ key: key as StatKey, value })}`,
    )
    .sort();
  return `${a.setKey}|${a.slot}|${a.rarity}|${a.mainStat}|${a.element ?? ''}|${rolls.join(',')}`;
}

/** The sidecar of one normalized file: every artifact with extras. */
export function buildSidecar(n: NormalizedGood): Sidecar {
  const entries: SidecarEntry[] = [];
  for (const e of n.artifacts ?? []) {
    if (!e.extras) continue;
    const key = firstRollKey(e.artifact, e.extras.initialValues);
    entries.push({
      fingerprint: fingerprint(e.artifact),
      index: e.index,
      ...(key && { firstRollKey: key }),
      extras: e.extras,
    });
  }
  return { source: n.source, entries };
}

/** Fingerprint → its entries, in file order. */
export function indexSidecar(
  entries: readonly SidecarEntry[],
): Map<string, SidecarEntry[]> {
  const byPrint = new Map<string, SidecarEntry[]>();
  for (const e of entries) {
    const list = byPrint.get(e.fingerprint);
    if (list) list.push(e);
    else byPrint.set(e.fingerprint, [e]);
  }
  return byPrint;
}
