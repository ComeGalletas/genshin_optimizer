/**
 * Element-aware goblets (ADR-0014): an off-element goblet is legal gear
 * (its sub-stats count) but its elemental DMG main stat is dead weight
 * in-game, so it is zeroed before the solver or any totals see it. Every
 * caller that scores artifacts for a character goes through this: the web
 * app's optimize client and results, and the server's optimize, compare
 * and character totals.
 * @packageDocumentation
 */

import type { Artifact } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';

/** The pieces with each off-element goblet's main stat set to 0. An
 *  unknown character leaves them as they are. */
export function zeroOffElementGoblets<A extends Artifact>(
  pieces: readonly A[],
  characterKey: string,
): A[] {
  const character = genshinAdapter.character(characterKey);
  if (!character) return [...pieces];
  return pieces.map((a) =>
    a.element && a.element !== character.element
      ? { ...a, mainStatValue: 0 }
      : a,
  );
}
