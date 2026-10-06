import { describe, it, expect } from 'vitest';
import {
  ENKA,
  HOYO,
  imageUrls,
  loadImageNames,
  type ImageNames,
} from './images';
import data from './data.generated.json';
import { SLOTS } from '../types';

const NAMES: ImageNames = {
  genshinDbVersion: 'x',
  characters: { furina: 'Furina' },
  weapons: { splendor_of_tranquil_waters: 'Sword_Regalis' },
  sets: { GoldenTroupe: 15032 },
};

describe('game image references (TODO 9.1, ADR-0052)', () => {
  it('builds Enka’s URL first, then HoYoverse’s, from the asset names', () => {
    expect(imageUrls(NAMES, { kind: 'character', key: 'furina' })).toEqual([
      `${ENKA}UI_AvatarIcon_Furina.png`,
      `${HOYO}character_icon/UI_AvatarIcon_Furina.png`,
    ]);
    expect(imageUrls(NAMES, { kind: 'character-side', key: 'furina' })).toEqual(
      [
        `${ENKA}UI_AvatarIcon_Side_Furina.png`,
        `${HOYO}character_side_icon/UI_AvatarIcon_Side_Furina.png`,
      ],
    );
    // The wish art is only on Enka.
    expect(
      imageUrls(NAMES, { kind: 'character-splash', key: 'furina' }),
    ).toEqual([`${ENKA}UI_Gacha_AvatarImg_Furina.png`]);
    expect(
      imageUrls(NAMES, { kind: 'weapon', key: 'splendor_of_tranquil_waters' }),
    ).toEqual([
      `${ENKA}UI_EquipIcon_Sword_Regalis.png`,
      `${HOYO}equip/UI_EquipIcon_Sword_Regalis.png`,
    ]);
    // The game numbers a set's pieces flower 4, plume 2, sands 5, goblet 1,
    // circlet 3.
    expect(
      SLOTS.map(
        (slot) =>
          imageUrls(NAMES, { kind: 'artifact', set: 'GoldenTroupe', slot })[0],
      ),
    ).toEqual([4, 2, 5, 1, 3].map((n) => `${ENKA}UI_RelicIcon_15032_${n}.png`));
  });

  it('has nothing to offer for what the dataset doesn’t name', () => {
    expect(imageUrls(NAMES, { kind: 'character', key: 'nobody' })).toEqual([]);
    expect(imageUrls(NAMES, { kind: 'weapon', key: 'nothing' })).toEqual([]);
    expect(
      imageUrls(NAMES, { kind: 'artifact', set: 'NoSet', slot: 'sands' }),
    ).toEqual([]);
  });

  it('names every character, weapon and set in the dataset', async () => {
    const names = await loadImageNames();
    expect(names.genshinDbVersion).toBe(data.genshinDbVersion);
    const missing = [
      ...data.characters
        .filter((c) => !names.characters[c.key])
        .map((c) => c.key),
      ...data.weapons.filter((w) => !names.weapons[w.key]).map((w) => w.key),
      ...data.sets
        .filter((s) => names.sets[s.key] === undefined)
        .map((s) => s.key),
    ];
    expect(missing).toEqual([]);
  });
});
