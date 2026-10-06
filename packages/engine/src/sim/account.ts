/**
 * A character from the owner's account as gcsim sees them (TODO 5.7, and
 * 5.8's simulations): level and ascension cap, constellation, base talent
 * levels, the weapon they hold (level, cap, refinement) and the artifacts
 * they wear. Pure.
 * @packageDocumentation
 */

import { ASCENSION_CAPS, type Artifact } from '../game/types';
import type { OwnedWeapon, RosterEntry } from '../good/normalize';
import type { SimCharacter } from './configgen';

export interface SimAccount {
  roster: Readonly<Record<string, RosterEntry>>;
  weapons: readonly OwnedWeapon[];
  artifacts: readonly Artifact[];
}

/** The lowest cap a level fits under, for a level without its ascension. */
const capFor = (level: number) => ASCENSION_CAPS.find((c) => c >= level) ?? 90;

/** The character as they are in the account, or why they can't be
 *  simulated: not owned, no weapon, or talents unknown (gcsim needs them;
 *  a guess would change the result). */
export function simCharacterFromAccount(
  account: SimAccount,
  key: string,
): SimCharacter | { problem: string } {
  const entry = account.roster[key];
  if (!entry) return { problem: `${key} is not in the account` };
  if (!entry.talents)
    return { problem: `${key}'s talent levels aren't in the import` };
  const held = account.weapons.find((w) => w.location === key);
  const weaponKey = held?.key ?? entry.weaponKey;
  if (!weaponKey) return { problem: `${key} holds no weapon in the import` };
  const level = entry.level ?? entry.buildLevel ?? 90;
  const weaponLevel = held?.level ?? entry.weaponLevel ?? 90;
  return {
    key,
    level,
    maxLevel: Math.max(entry.buildLevel ?? capFor(level), level),
    constellation: entry.constellation ?? 0,
    talents: entry.talents,
    weapon: {
      key: weaponKey,
      level: weaponLevel,
      maxLevel:
        held?.ascension !== undefined
          ? Math.max(ASCENSION_CAPS[held.ascension] ?? 90, weaponLevel)
          : capFor(weaponLevel),
      refinement: held?.refinement ?? entry.weaponRefinement ?? 1,
    },
    artifacts: account.artifacts.filter((a) => a.location === key),
  };
}
