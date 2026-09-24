/**
 * Data coverage: for every character and weapon, what the app actually has for
 * it — reference stats from the genshin-db snapshot, and each hand-curated
 * table (meta recipe, damage profile, team archetypes, weapon obtainability).
 * gcsim support is a placeholder until Phase 5 adds the simulator.
 *
 * Rows are the union of the snapshot's keys and every key the curated tables
 * mention, so a curated entry whose character or weapon is missing from
 * genshin-db shows up as a gap instead of disappearing. Pure: `npm run
 * data:coverage` (scripts/data-coverage.ts) prints it, and the server can serve
 * it later.
 * @packageDocumentation
 */

import { genshinAdapter } from '../game/genshin/adapter';
import { META_TARGETS, type MetaTarget } from '../meta/metaTargets';
import { DAMAGE_PROFILES } from '../damage/profiles';
import { COMP_ARCHETYPES } from '../teams/comps';
import type { CompArchetype } from '../teams/types';
import { WEAPON_OBTAINABILITY } from '../invest/obtainability';

/** gcsim support is unknown until Phase 5 wires the simulator in. */
export type GcsimSupport = 'unknown';

export interface CharacterCoverage {
  key: string;
  /** Display name from the snapshot; the key itself when genshin-db lacks it. */
  name: string;
  element?: string;
  weaponType?: string;
  inGenshinDb: boolean;
  metaTarget: boolean;
  damageProfile: boolean;
  /** Ids of the comp archetypes that list this character in any slot. */
  archetypes: string[];
  gcsim: GcsimSupport;
}

export interface WeaponCoverage {
  key: string;
  name: string;
  type?: string;
  rarity?: number;
  inGenshinDb: boolean;
  /** Characters whose meta recipe names this weapon as `weapon` (best-in-slot
   *  5-star) or `weaponAccessible` (best non-limited pick). */
  metaPickFor: string[];
  obtainability: boolean;
  gcsim: GcsimSupport;
}

export interface DataCoverage {
  characters: CharacterCoverage[];
  weapons: WeaponCoverage[];
  summary: {
    characters: number;
    charactersMissingFromGenshinDb: string[];
    charactersWithMetaTarget: number;
    charactersWithDamageProfile: number;
    charactersInArchetypes: number;
    /** In the snapshot but in no curated table at all. */
    charactersUncurated: string[];
    weapons: number;
    weaponsMissingFromGenshinDb: string[];
    weaponsWithObtainability: number;
    weaponsAsMetaPick: number;
  };
}

/** What the report is built from; defaults to the real snapshot and tables. */
export interface CoverageSources {
  characters: readonly {
    key: string;
    name: string;
    element: string;
    weaponType: string;
  }[];
  weapons: readonly {
    key: string;
    name: string;
    type: string;
    rarity: number;
  }[];
  metaTargets: Record<string, MetaTarget>;
  damageProfiles: Record<string, unknown>;
  archetypes: readonly CompArchetype[];
  obtainability: Record<string, unknown>;
}

const DEFAULT_SOURCES: CoverageSources = {
  characters: genshinAdapter.characters(),
  weapons: genshinAdapter.weapons(),
  metaTargets: META_TARGETS,
  damageProfiles: DAMAGE_PROFILES,
  archetypes: COMP_ARCHETYPES,
  obtainability: WEAPON_OBTAINABILITY,
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'en');

export function buildDataCoverage(
  sources: CoverageSources = DEFAULT_SOURCES,
): DataCoverage {
  const archetypesOf = new Map<string, string[]>();
  for (const a of sources.archetypes) {
    const members = new Set(
      a.slots.flatMap((s) => s.options.map((o) => o.characterKey)),
    );
    for (const key of members) {
      archetypesOf.set(key, [...(archetypesOf.get(key) ?? []), a.id]);
    }
  }

  const metaPicks = new Map<string, string[]>();
  for (const m of Object.values(sources.metaTargets)) {
    for (const w of new Set([m.weapon, m.weaponAccessible])) {
      if (w) metaPicks.set(w, [...(metaPicks.get(w) ?? []), m.characterKey]);
    }
  }

  const snapChars = new Map(sources.characters.map((c) => [c.key, c]));
  const charKeys = new Set([
    ...snapChars.keys(),
    ...Object.keys(sources.metaTargets),
    ...Object.keys(sources.damageProfiles),
    ...archetypesOf.keys(),
  ]);
  const characters: CharacterCoverage[] = [...charKeys]
    .map((key) => {
      const c = snapChars.get(key);
      return {
        key,
        name: c?.name ?? key,
        element: c?.element,
        weaponType: c?.weaponType,
        inGenshinDb: c !== undefined,
        metaTarget: key in sources.metaTargets,
        damageProfile: key in sources.damageProfiles,
        archetypes: archetypesOf.get(key) ?? [],
        gcsim: 'unknown' as const,
      };
    })
    .sort(byName);

  const snapWeapons = new Map(sources.weapons.map((w) => [w.key, w]));
  const weaponKeys = new Set([
    ...snapWeapons.keys(),
    ...metaPicks.keys(),
    ...Object.keys(sources.obtainability),
  ]);
  const weapons: WeaponCoverage[] = [...weaponKeys]
    .map((key) => {
      const w = snapWeapons.get(key);
      return {
        key,
        name: w?.name ?? key,
        type: w?.type,
        rarity: w?.rarity,
        inGenshinDb: w !== undefined,
        metaPickFor: metaPicks.get(key) ?? [],
        obtainability: key in sources.obtainability,
        gcsim: 'unknown' as const,
      };
    })
    .sort(byName);

  return {
    characters,
    weapons,
    summary: {
      characters: characters.length,
      charactersMissingFromGenshinDb: characters
        .filter((c) => !c.inGenshinDb)
        .map((c) => c.key),
      charactersWithMetaTarget: characters.filter((c) => c.metaTarget).length,
      charactersWithDamageProfile: characters.filter((c) => c.damageProfile)
        .length,
      charactersInArchetypes: characters.filter((c) => c.archetypes.length > 0)
        .length,
      charactersUncurated: characters
        .filter(
          (c) =>
            c.inGenshinDb &&
            !c.metaTarget &&
            !c.damageProfile &&
            c.archetypes.length === 0,
        )
        .map((c) => c.key),
      weapons: weapons.length,
      weaponsMissingFromGenshinDb: weapons
        .filter((w) => !w.inGenshinDb)
        .map((w) => w.key),
      weaponsWithObtainability: weapons.filter((w) => w.obtainability).length,
      weaponsAsMetaPick: weapons.filter((w) => w.metaPickFor.length > 0).length,
    },
  };
}
