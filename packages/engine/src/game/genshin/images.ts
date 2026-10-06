/**
 * Game images by reference (TODO 9.1, ADR-0052): the URLs of a character's,
 * weapon's or artifact piece's picture, built from the game's asset names
 * the dataset build records (`images.generated.json`). No image is stored
 * in the repo or the bundle; the page links them.
 *
 * Hosts, in order: Enka (`enka.network/ui/<asset>.png`), which serves every
 * asset the dataset names, then HoYoverse's own (the `mihoyo_*` URLs
 * genshin-db lists), which serves only older ones. Measured on 2026-10-06
 * over the whole dataset: Enka 120/120 characters, 253/253 weapons, 59/59
 * sets; HoYoverse 66, 155 and 41. A caller tries them in order and falls
 * back to its own glyph when both fail. Pure.
 * @packageDocumentation
 */

import type { Slot } from '../types';

/** `images.generated.json`: only the part of each asset name that varies. */
export interface ImageNames {
  genshinDbVersion: string;
  /** `Furina`: `UI_AvatarIcon_Furina`, `UI_AvatarIcon_Side_Furina`. */
  characters: Record<string, string>;
  /** `Sword_Regalis`: `UI_EquipIcon_Sword_Regalis`. */
  weapons: Record<string, string>;
  /** `15032`: `UI_RelicIcon_15032_<piece>`. */
  sets: Record<string, number>;
}

export type ImageRef =
  | { kind: 'character'; key: string }
  /** The small side portrait (team lines, pickers). */
  | { kind: 'character-side'; key: string }
  | { kind: 'weapon'; key: string }
  | { kind: 'artifact'; set: string; slot: Slot };

/** The game's number for each piece of a set. */
const PIECE: Record<Slot, number> = {
  flower: 4,
  plume: 2,
  sands: 5,
  goblet: 1,
  circlet: 3,
};

export const ENKA = 'https://enka.network/ui/';
export const HOYO = 'https://upload-os-bbs.mihoyo.com/game_record/genshin/';

/** The asset's name and its folder on HoYoverse's host, or null when the
 *  dataset has none. */
function asset(
  names: ImageNames,
  ref: ImageRef,
): { name: string; hoyoDir: string } | null {
  switch (ref.kind) {
    case 'character': {
      const n = names.characters[ref.key];
      return n
        ? { name: `UI_AvatarIcon_${n}`, hoyoDir: 'character_icon' }
        : null;
    }
    case 'character-side': {
      const n = names.characters[ref.key];
      return n
        ? { name: `UI_AvatarIcon_Side_${n}`, hoyoDir: 'character_side_icon' }
        : null;
    }
    case 'weapon': {
      const n = names.weapons[ref.key];
      return n ? { name: `UI_EquipIcon_${n}`, hoyoDir: 'equip' } : null;
    }
    case 'artifact': {
      const n = names.sets[ref.set];
      return n !== undefined
        ? { name: `UI_RelicIcon_${n}_${PIECE[ref.slot]}`, hoyoDir: 'equip' }
        : null;
    }
  }
}

/** The URLs to try for an image, best first; empty when the dataset names
 *  no asset for it (a set or character newer than the snapshot). */
export function imageUrls(names: ImageNames, ref: ImageRef): string[] {
  const a = asset(names, ref);
  if (!a) return [];
  return [`${ENKA}${a.name}.png`, `${HOYO}${a.hoyoDir}/${a.name}.png`];
}

/** The names file, loaded when first asked for: it is not needed to start
 *  the page, and a picture can wait for it behind its glyph. */
export function loadImageNames(): Promise<ImageNames> {
  return import('./images.generated.json').then(
    (m) => (m.default ?? m) as unknown as ImageNames,
  );
}
