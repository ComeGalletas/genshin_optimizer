/**
 * Write artifacts back as GOOD (the reverse of `normalizeGOOD`'s artifact
 * half): stat keys to GOOD's, the goblet's element back into its main stat
 * key, dataset character keys to GOOD's PascalCase, and the source extras
 * (unactivated line, first rolls, roll count) where known. Values pass
 * through (percent, ADR-0023). `normalizeGOOD(toGOOD(x))` gives `x` back,
 * ids aside; tests use it to feed simulated exports through the real
 * import path.
 * @packageDocumentation
 */

import type { StatKey, SubStat } from '../game/types';
import type { SnapshotPiece } from '../merge/merge';
import { GOOD_STAT_KEYS } from './normalize';

const GOOD_KEY_OF = new Map<StatKey, string>(
  Object.entries(GOOD_STAT_KEYS)
    .filter(([good]) => !/^(?!physical)\w+_dmg_$/.test(good))
    .map(([good, ours]) => [ours, good]),
);

/** "raiden_shogun" → "RaidenShogun" (GOOD's character key style). */
export const goodCharacterKey = (key: string) =>
  key
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

function goodStatKey(key: StatKey, element?: string): string {
  if (key === 'elemental_dmg') {
    if (!element) throw new Error('an elemental DMG% goblet needs its element');
    return `${element}_dmg_`;
  }
  const k = GOOD_KEY_OF.get(key);
  if (!k) throw new Error(`no GOOD key for stat ${key}`);
  return k;
}

export interface GoodExport {
  format: 'GOOD';
  version: 3;
  source: string;
  artifacts: Record<string, unknown>[];
}

/** A GOOD file holding these pieces, in order. */
export function toGOOD(
  pieces: readonly SnapshotPiece[],
  source: string,
): GoodExport {
  const line = (s: SubStat, initial: Record<string, number> | undefined) => ({
    key: goodStatKey(s.key),
    value: s.value,
    ...(initial?.[s.key] !== undefined && { initialValue: initial[s.key] }),
  });
  return {
    format: 'GOOD',
    version: 3,
    source,
    artifacts: pieces.map((p) => {
      const a = p.artifact;
      const initial = p.extras?.initialValues;
      return {
        setKey: a.setKey,
        slotKey: a.slot,
        rarity: a.rarity,
        level: a.level,
        mainStatKey: goodStatKey(a.mainStat, a.element),
        location: a.location ? goodCharacterKey(a.location) : '',
        ...(p.lock !== undefined && { lock: p.lock }),
        substats: a.subStats.map((s) => line(s, initial)),
        unactivatedSubstats: p.unactivated
          ? [line(p.unactivated, initial)]
          : [],
        ...(p.extras?.totalRolls !== undefined && {
          totalRolls: p.extras.totalRolls,
        }),
        ...(p.extras?.astralMark !== undefined && {
          astralMark: p.extras.astralMark,
        }),
        ...(p.extras?.elixirCrafted !== undefined && {
          elixirCrafted: p.extras.elixirCrafted,
        }),
      };
    }),
  };
}
