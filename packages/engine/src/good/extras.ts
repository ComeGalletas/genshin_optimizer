/**
 * Source-specific artifact extras: the fields some exporters add to GOOD
 * beyond the standard, kept for the sidecar (TODO 2.3) instead of dropped.
 *
 * - `totalRolls`: rolls the piece has had, its first substats included.
 * - `initialValue` on a substat: that line's first roll.
 * - `astralMark`, `elixirCrafted` (Irminsul spells it `elixerCrafted`).
 *
 * Every value is checked against the game's rules before it is kept, whatever
 * the source: a memory reader (Irminsul) exports them all, an OCR scanner
 * (AdeptiScanner) only what the screen proves, and a scanner has been seen
 * writing an impossible roll count (7 at +20). A value that fails is dropped
 * and reported, never corrected. Roll data is checked, and kept, for 5★
 * pieces only: those are the roll tiers the engine has (ADR-0024).
 * @packageDocumentation
 */

import * as z from 'zod/mini';
import type { StatKey } from '../game/types';
import {
  isSubStatKey,
  MAX_LEVEL_5,
  SUBSTAT_TIERS_5,
  UPGRADE_EVERY,
} from '../game/genshin/substatRolls';
import { displaySteps } from '../import/fingerprint';

/** What the sidecar keeps for one artifact. Every field is optional: a
 *  source exports what it knows. */
export const ArtifactExtras = z.object({
  totalRolls: z.optional(z.number().check(z.int(), z.minimum(0))),
  astralMark: z.optional(z.boolean()),
  elixirCrafted: z.optional(z.boolean()),
  /** First roll per line, active and unactivated, by stat. */
  initialValues: z.optional(z.record(z.string(), z.number())),
});
export type ArtifactExtras = z.infer<typeof ArtifactExtras>;

/** One substat line as normalization kept it, with its raw `initialValue`
 *  and its path in the file. */
export interface ExtrasLine {
  key: StatKey;
  value: number;
  initial: unknown;
  path: (string | number)[];
}

type Report = (
  code: 'invalid' | 'unsupported',
  message: string,
  ...path: (string | number)[]
) => void;

const Bool = z.boolean();
const Int = z.number().check(z.int());
const Num = z.number();

/** The first roll is one of the stat's 4 tiers, as the game shows it. */
const onTier = (key: StatKey, v: number) =>
  isSubStatKey(key) &&
  SUBSTAT_TIERS_5[key].some(
    (t) => displaySteps({ key, value: t }) === displaySteps({ key, value: v }),
  );

/**
 * Read and check one artifact's extras from its raw GOOD object. Returns
 * `undefined` when nothing survives. `lines` are the substats normalization
 * kept (the unactivated line only if it was kept), `activeLines` how many of
 * them are active.
 */
export function readArtifactExtras(
  raw: Record<string, unknown>,
  piece: {
    rarity: number;
    level: number;
    lines: ExtrasLine[];
    activeLines: number;
  },
  report: Report,
): ArtifactExtras | undefined {
  const out: ArtifactExtras = {};
  const astral = Bool.safeParse(raw.astralMark);
  if (astral.success) out.astralMark = astral.data;
  const elixirRaw = raw.elixirCrafted ?? raw.elixerCrafted;
  const elixir = Bool.safeParse(elixirRaw);
  if (elixir.success) out.elixirCrafted = elixir.data;

  const hasRollData =
    raw.totalRolls !== undefined ||
    piece.lines.some((l) => l.initial !== undefined);
  if (hasRollData && piece.rarity !== 5) {
    report(
      'unsupported',
      'roll data dropped: only 5★ roll data is checked and kept',
      'totalRolls',
    );
  } else if (hasRollData) {
    if (raw.totalRolls !== undefined) {
      const t = Int.safeParse(raw.totalRolls);
      // First substats (3 or 4) plus one roll per upgrade so far. Below +4
      // the count is exactly the lines the piece starts with.
      const upgrades = Math.floor(
        Math.min(piece.level, MAX_LEVEL_5) / UPGRADE_EVERY,
      );
      const start = t.success ? t.data - upgrades : NaN;
      const ok =
        (start === 3 || start === 4) &&
        (piece.level >= UPGRADE_EVERY || start === piece.activeLines);
      if (ok) out.totalRolls = t.data!;
      else
        report(
          'invalid',
          `totalRolls ${String(raw.totalRolls)} is impossible at +${piece.level}`,
          'totalRolls',
        );
    }
    const initials: Record<string, number> = {};
    for (const l of piece.lines) {
      if (l.initial === undefined) continue;
      const v = Num.safeParse(l.initial);
      const atZero = piece.level < UPGRADE_EVERY;
      const ok =
        v.success &&
        onTier(l.key, v.data) &&
        // The first roll is all of it until a roll lands on the line.
        (atZero
          ? displaySteps({ key: l.key, value: v.data }) === displaySteps(l)
          : displaySteps({ key: l.key, value: v.data }) <= displaySteps(l));
      if (ok) initials[l.key] = v.data!;
      else
        report(
          'invalid',
          `initialValue ${String(l.initial)} is not a possible first roll of ${l.key} ${l.value}`,
          ...l.path,
          'initialValue',
        );
    }
    if (Object.keys(initials).length) out.initialValues = initials;
  }
  return Object.keys(out).length ? out : undefined;
}
