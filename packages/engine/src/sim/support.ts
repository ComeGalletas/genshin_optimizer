/**
 * What the pinned gcsim implements (TODO 5.9): the table `npm run
 * sim:support` probes from the binary, per dataset character (`full`,
 * `partial`: gcsim lists it as incomplete, or `unsupported`), weapon and
 * artifact set.
 * A team with anything less than full falls back to the stat search,
 * labelled "not simulated"; the coverage report shows the table. A key the
 * table doesn't have (newer than the probe) is `unknown`: tried, and the
 * run itself says. Pure.
 * @packageDocumentation
 */

import data from './gcsim-support.json';

export interface GcsimSupportTable {
  about: string;
  /** The gcsim version and commit it was probed with. */
  gcsim: string;
  commit: string;
  characters: Record<string, 'full' | 'partial' | 'unsupported'>;
  weapons: Record<string, 'supported' | 'unsupported'>;
  sets: Record<string, 'supported' | 'unsupported'>;
}

export const GCSIM_SUPPORT = data as GcsimSupportTable;

export type CharacterSupport =
  GcsimSupportTable['characters'][string] | 'unknown';
export type WeaponSupport = GcsimSupportTable['weapons'][string] | 'unknown';

export const characterSupport = (
  key: string,
  table: GcsimSupportTable = GCSIM_SUPPORT,
): CharacterSupport => table.characters[key] ?? 'unknown';

export const setSupport = (
  key: string,
  table: GcsimSupportTable = GCSIM_SUPPORT,
): WeaponSupport => table.sets[key] ?? 'unknown';

export const weaponSupport = (
  key: string,
  table: GcsimSupportTable = GCSIM_SUPPORT,
): WeaponSupport => table.weapons[key] ?? 'unknown';

/** Why gcsim can't simulate these characters and weapons, one line each;
 *  empty when it can (as far as the table knows). */
export function unsimulated(
  team: {
    characters: readonly string[];
    weapons: readonly string[];
    sets?: readonly string[];
  },
  names: {
    character: (k: string) => string;
    weapon: (k: string) => string;
    set: (k: string) => string;
  },
  table: GcsimSupportTable = GCSIM_SUPPORT,
): string[] {
  const out: string[] = [];
  for (const k of team.characters) {
    const s = characterSupport(k, table);
    if (s === 'unsupported')
      out.push(`gcsim ${table.gcsim} doesn't implement ${names.character(k)}`);
    else if (s === 'partial')
      out.push(
        `gcsim ${table.gcsim} implements ${names.character(k)} only partly`,
      );
  }
  for (const k of new Set(team.weapons))
    if (weaponSupport(k, table) === 'unsupported')
      out.push(`gcsim ${table.gcsim} doesn't have ${names.weapon(k)}`);
  for (const k of new Set(team.sets ?? []))
    if (setSupport(k, table) === 'unsupported')
      out.push(`gcsim ${table.gcsim} doesn't have the ${names.set(k)} set`);
  return out;
}

/** The sets a build has 2 or more pieces of (dataset keys): the ones a
 *  gcsim config names, so the ones gcsim must have. */
export function setsInPlay(artifacts: readonly { setKey: string }[]): string[] {
  const n = new Map<string, number>();
  for (const a of artifacts) n.set(a.setKey, (n.get(a.setKey) ?? 0) + 1);
  return [...n].filter(([, c]) => c >= 2).map(([k]) => k);
}
