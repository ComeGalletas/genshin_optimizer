/**
 * Enka.Network showcase parsing (ADR-0006): the equipped artifacts of a
 * player's showcased characters, from Enka's untrusted JSON.
 * @packageDocumentation
 */
import type { Artifact, Element, Slot, StatKey, SubStat } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { MAX_KEY_LEN, validateArtifactDraft } from '../game/artifactValidation';

export type UidError = { error: 'NOT_FOUND' | 'NO_SHOWCASE' | 'NETWORK' };

const EQUIP_SLOT: Record<string, Slot> = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
};

const PROP_STAT: Record<string, StatKey> = {
  FIGHT_PROP_HP: 'hp',
  FIGHT_PROP_HP_PERCENT: 'hp_pct',
  FIGHT_PROP_ATTACK: 'atk',
  FIGHT_PROP_ATTACK_PERCENT: 'atk_pct',
  FIGHT_PROP_DEFENSE: 'def',
  FIGHT_PROP_DEFENSE_PERCENT: 'def_pct',
  FIGHT_PROP_ELEMENT_MASTERY: 'em',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'er_pct',
  FIGHT_PROP_CRITICAL: 'crit_rate',
  FIGHT_PROP_CRITICAL_HURT: 'crit_dmg',
  FIGHT_PROP_HEAL_ADD: 'healing',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'physical_dmg',
  FIGHT_PROP_FIRE_ADD_HURT: 'elemental_dmg',
  FIGHT_PROP_WATER_ADD_HURT: 'elemental_dmg',
  FIGHT_PROP_ELEC_ADD_HURT: 'elemental_dmg',
  FIGHT_PROP_ICE_ADD_HURT: 'elemental_dmg',
  FIGHT_PROP_WIND_ADD_HURT: 'elemental_dmg',
  FIGHT_PROP_ROCK_ADD_HURT: 'elemental_dmg',
  FIGHT_PROP_GRASS_ADD_HURT: 'elemental_dmg',
};

// ADR-0014: extract goblet element from Enka prop IDs so off-element zeroing
// works for UID-imported artifacts the same way it does for GOOD imports.
const PROP_ELEMENT: Record<string, Element> = {
  FIGHT_PROP_FIRE_ADD_HURT: 'pyro',
  FIGHT_PROP_WATER_ADD_HURT: 'hydro',
  FIGHT_PROP_ELEC_ADD_HURT: 'electro',
  FIGHT_PROP_ICE_ADD_HURT: 'cryo',
  FIGHT_PROP_WIND_ADD_HURT: 'anemo',
  FIGHT_PROP_ROCK_ADD_HURT: 'geo',
  FIGHT_PROP_GRASS_ADD_HURT: 'dendro',
};

/**
 * Turns an Enka.Network `/api/uid/{uid}` response body into artifacts. Pure:
 * the HTTP call lives with whoever owns I/O (the web app's `import/uid.ts`
 * today, the server's Enka adapter in Phase 2), so the engine never touches
 * the network.
 */
export function parseEnkaResponse(
  data: Record<string, unknown> | null | undefined,
): Artifact[] | UidError {
  const avatars = data?.avatarInfoList;
  if (!Array.isArray(avatars) || avatars.length === 0)
    return { error: 'NO_SHOWCASE' };

  // Enka's payload is untrusted third-party JSON: every level of the nesting
  // gets a shape guard, and a piece that fails validation is skipped rather
  // than thrown on — the same skip-don't-throw contract parseGOOD states.
  const isObj = (x: unknown): x is Record<string, unknown> =>
    typeof x === 'object' && x !== null;

  const out: Artifact[] = [];
  for (const av of avatars) {
    if (!isObj(av)) continue;
    const equipList = Array.isArray(av.equipList) ? av.equipList : [];
    for (const equip of equipList) {
      if (!isObj(equip)) continue;
      const flat = isObj(equip.flat) ? equip.flat : undefined;
      if (!flat || flat.itemType !== 'ITEM_RELIQUARY') continue;
      const slot = EQUIP_SLOT[flat.equipType as string];
      const reliquaryMainstat = isObj(flat.reliquaryMainstat)
        ? (flat.reliquaryMainstat as {
            mainPropId?: string;
            statValue?: number;
          })
        : undefined;
      const mainStat = PROP_STAT[reliquaryMainstat?.mainPropId ?? ''];
      if (!slot || !mainStat) continue;
      const rawSubs = Array.isArray(flat.reliquarySubstats)
        ? flat.reliquarySubstats
        : [];
      const subStats: SubStat[] = rawSubs
        .filter(isObj)
        .map((s) => ({
          key: PROP_STAT[s.appendPropId as string],
          value: s.statValue as number,
        }))
        .filter((s): s is SubStat => Boolean(s.key) && Number.isFinite(s.value))
        // A sub-stat can't duplicate the main stat, and there are at most four.
        .filter((s) => s.key !== mainStat)
        .slice(0, 4);
      const reliquary = isObj(equip.reliquary) ? equip.reliquary : undefined;
      const rawLevel = reliquary?.level;
      const level = Math.max(
        0,
        (typeof rawLevel === 'number' && Number.isFinite(rawLevel)
          ? rawLevel
          : 1) - 1, // Enka level is 1-based
      );
      // Rarity is not a free number: `mainStatValue` indexes the dataset's
      // 4★/5★ curves by it, so defaulting a missing or corrupt rankLevel to 5
      // invented a stat value for a piece Enka never described that way. There
      // is no fifth-star fallback to guess — skip the piece, as parseGOOD does.
      const rank = flat.rankLevel;
      if (rank !== 4 && rank !== 5) continue;
      const rarity = rank;
      // Same invariant the manual entry and GOOD paths enforce.
      if (validateArtifactDraft({ mainStat, level, subStats })) continue;
      // The hash reaches set lookups and the DOM (formatSetName) like any
      // other setKey, so it gets the same bound the other two importers apply.
      const setKey = String(flat.setNameTextMapHash);
      if (setKey.length === 0 || setKey.length > MAX_KEY_LEN) continue;
      out.push({
        id: crypto.randomUUID(),
        // NOTE: setNameTextMapHash is a NAME HASH, not a GOOD-format set key.
        // UID-imported artifacts will NOT match set-requirement constraints or set
        // bonuses reliably (their setKey is a numeric hash string). This is a known
        // limitation — GOOD file import is the reliable path. Do NOT build a
        // hash→key mapping here; still deferred as of v2 (2026-08).
        setKey,
        slot,
        rarity,
        level,
        mainStat,
        mainStatValue: genshinAdapter.mainStatValue(mainStat, rarity, level),
        subStats,
        element:
          slot === 'goblet'
            ? PROP_ELEMENT[reliquaryMainstat?.mainPropId ?? '']
            : undefined,
      });
    }
  }
  return out;
}
