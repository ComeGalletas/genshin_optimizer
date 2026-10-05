import type { OwnedWeapon, RosterEntry } from '../good/normalize';
import { isRefinement, type Refinement } from '../game/genshin/passives';

/**
 * The refinement a character's build uses a weapon at (ADR-0042): the copy
 * they hold, when it is that weapon; otherwise the most refined copy the
 * account owns; otherwise unknown (`undefined`, which the passives read as
 * R1, the least any copy has). `weapons` is the account's inventory, when
 * known; without it, the roster entry's own record of the held weapon.
 */
export function ownedRefinement(
  characterKey: string,
  weaponKey: string,
  account: {
    roster?: Readonly<Record<string, RosterEntry>>;
    weapons?: readonly OwnedWeapon[];
  },
): Refinement | undefined {
  const entry = account.roster?.[characterKey];
  const held = account.weapons?.find(
    (w) => w.location === characterKey && w.key === weaponKey,
  );
  if (isRefinement(held?.refinement)) return held.refinement;
  if (entry?.weaponKey === weaponKey && isRefinement(entry.weaponRefinement))
    return entry.weaponRefinement;
  let best: Refinement | undefined;
  for (const w of account.weapons ?? [])
    if (w.key === weaponKey && isRefinement(w.refinement))
      if (best === undefined || w.refinement > best) best = w.refinement;
  return best;
}
