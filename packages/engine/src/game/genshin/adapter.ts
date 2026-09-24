/**
 * The `genshinAdapter`: the concrete object owning all Genshin-specific
 * reference data (characters, weapons, artifact sets, base/main stats) and
 * the universal game baselines, loaded from the frozen `data.generated.json`
 * snapshot (ADR-0002, ADR-0009, ADR-0012).
 * @packageDocumentation
 */

import type {
  StatKey,
  StatVec,
  BuildLevel,
  Element,
  WeaponType,
} from '../types';
import { STAT_KEYS } from '../types';
import type { Snapshot } from './snapshot';
import rawData from './data.generated.json';

export interface CharacterMeta {
  key: string;
  name: string;
  element: Element | 'physical';
  weaponType: WeaponType;
}

export interface WeaponMeta {
  key: string;
  name: string;
  type: WeaponType;
  /** Star rating (1–5), for annotating a picker without a second lookup. */
  rarity: number;
}

export interface ArtifactSetMeta {
  key: string;
  name: string;
  twoPiece?: StatVec;
  fourPiece?: StatVec;
}

const data = rawData as unknown as Snapshot;

function vec(obj?: Record<string, number>): StatVec {
  return (obj ?? {}) as StatVec;
}

export const PATCH: string = data.patch;

// The snapshot is frozen for the app's lifetime (ADR-0002), so the three
// dataset views are mapped once at module load and handed out as-is. Frozen
// because they are shared: a caller that sorted one in place would reorder it
// for every other caller.
const CHARACTERS: readonly CharacterMeta[] = Object.freeze(
  data.characters.map((c) => ({
    key: c.key,
    name: c.name,
    element: c.element as CharacterMeta['element'],
    weaponType: c.weaponType as WeaponType,
  })),
);

const WEAPONS: readonly WeaponMeta[] = Object.freeze(
  data.weapons.map((w) => ({
    key: w.key,
    name: w.name,
    type: w.type as WeaponType,
    rarity: w.rarity,
  })),
);

const SETS: readonly ArtifactSetMeta[] = Object.freeze(
  data.sets.map((s) => ({
    key: s.key,
    name: s.name,
    twoPiece: vec(s.twoPiece),
    fourPiece: s.fourPiece ? vec(s.fourPiece) : undefined,
  })),
);

const CHARACTER_BY_KEY = new Map(CHARACTERS.map((c) => [c.key, c]));
const WEAPON_BY_KEY = new Map(WEAPONS.map((w) => [w.key, w]));
const SET_BY_KEY = new Map(SETS.map((s) => [s.key, s]));

// `baseStats` is called once per optimiser run (and once per plan member, which
// is eight runs), and each call used to linear-scan the raw 116-character /
// 235-weapon arrays twice. Index the raw records the same way the mapped views
// above are indexed — the mapped `CharacterMeta`/`WeaponMeta` don't carry
// baseByLevel/byLevel, so this is a second index over the raw rows, not a
// duplicate of the two above.
const RAW_CHARACTER_BY_KEY = new Map(data.characters.map((c) => [c.key, c]));
const RAW_WEAPON_BY_KEY = new Map(data.weapons.map((w) => [w.key, w]));

const WEAPONS_BY_TYPE: ReadonlyMap<WeaponType, readonly WeaponMeta[]> = (() => {
  const m = new Map<WeaponType, WeaponMeta[]>();
  for (const w of WEAPONS) {
    const list = m.get(w.type);
    if (list) list.push(w);
    else m.set(w.type, [w]);
  }
  // Frozen for the same reason WEAPONS is: these arrays are handed to callers
  // as-is, and an in-place sort by one caller would reorder them for all.
  for (const [k, v] of m) m.set(k, Object.freeze(v) as WeaponMeta[]);
  return m;
})();

const NO_WEAPONS: readonly WeaponMeta[] = Object.freeze([]);

export const genshinAdapter = {
  statKeys: [...STAT_KEYS] as StatKey[],

  characters(): readonly CharacterMeta[] {
    return CHARACTERS;
  },

  /** Single-character lookup without mapping the full dataset. */
  character(key: string): CharacterMeta | undefined {
    return CHARACTER_BY_KEY.get(key);
  },

  /** The one place a character key becomes display copy. Falls back to the raw
   *  key rather than crashing when the frozen dataset doesn't have them (e.g. a
   *  character newer than the snapshot). */
  characterName(key: string): string {
    return CHARACTER_BY_KEY.get(key)?.name ?? key;
  },

  weapons(): readonly WeaponMeta[] {
    return WEAPONS;
  },

  /** Single-weapon lookup without mapping the full dataset. */
  weapon(key: string): WeaponMeta | undefined {
    return WEAPON_BY_KEY.get(key);
  },

  /** Every weapon a character of this class can equip, in dataset order.
   *  Empty (never undefined) for an unknown type, so callers can iterate
   *  without a null check. */
  weaponsOfType(type: WeaponType | undefined): readonly WeaponMeta[] {
    return (type && WEAPONS_BY_TYPE.get(type)) || NO_WEAPONS;
  },

  /** Whether this character can equip this weapon. Unknown keys answer `true`:
   *  a key the frozen snapshot doesn't carry (a shared link from a newer
   *  build, a hand-edited request) is not evidence of an illegal pairing, and
   *  refusing it would be worse than showing it. */
  canEquip(characterKey: string, weaponKey: string): boolean {
    const c = CHARACTER_BY_KEY.get(characterKey);
    const w = WEAPON_BY_KEY.get(weaponKey);
    if (!c || !w) return true;
    return c.weaponType === w.type;
  },

  sets(): readonly ArtifactSetMeta[] {
    return SETS;
  },

  /** The dataset's display name for a set key ("Gladiator's Finale", with the
   *  apostrophe the key can't carry), or undefined for a key the frozen
   *  snapshot doesn't know. */
  setName(key: string): string | undefined {
    return SET_BY_KEY.get(key)?.name;
  },

  baseStats(
    characterKey: string,
    weaponKey: string,
    level: BuildLevel,
  ): StatVec {
    // Fail loud on an unresolved key rather than silently returning a
    // wrong-but-plausible near-empty build: the meta/sample presets carry
    // hardcoded keys that could drift from the frozen dataset.
    const c = RAW_CHARACTER_BY_KEY.get(characterKey);
    if (!c) throw new Error(`Unknown character key: ${characterKey}`);
    const w = RAW_WEAPON_BY_KEY.get(weaponKey);
    if (!w) throw new Error(`Unknown weapon key: ${weaponKey}`);
    const out: StatVec = {};
    const add = (src?: Record<string, number>) => {
      if (!src) return;
      for (const k of Object.keys(src)) {
        out[k as StatKey] = (out[k as StatKey] ?? 0) + src[k];
      }
    };
    add(c.baseByLevel[String(level)]);
    add(w.byLevel[String(level)]);
    // The universal 100% base Energy Recharge every character shares is a
    // game-wide rule, not per-character snapshot data, so the adapter owns it
    // (see ADR-0009). Add it so ER totals and ER constraints are correct
    // across the app.
    out.er_pct = (out.er_pct ?? 0) + 100;
    return out;
  },

  mainStatValue(mainStat: StatKey, rarity: number, level: number): number {
    const byStat = data.mainStatValues[String(rarity)];
    const arr = byStat?.[mainStat];
    if (!arr) return 0;
    return arr[Math.max(0, Math.min(level, arr.length - 1))] ?? 0;
  },
};
