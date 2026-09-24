import { describe, it, expect, beforeEach } from 'vitest';
import {
  useOptimizeRequest,
  currentRequest,
  isDefaultSelection,
  DEFAULT_SELECTION,
} from './optimizeRequest';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { useRoster } from './roster';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';

describe('optimizeRequest defaults', () => {
  beforeEach(() => useOptimizeRequest.getState().reset());

  // Sort order used to choose these, which opened the app on "Aino +
  // Absolution" — a claymore user holding a sword.
  it('opens on a curated marquee pair, not the first entry by sort order', () => {
    const s = useOptimizeRequest.getState();
    expect(s.characterKey).toBe('furina');
    expect(s.weaponKey).toBe(META_TARGETS.furina.weapon);
    expect(s.characterKey).not.toBe(genshinAdapter.characters()[0].key);
    expect(s.weaponKey).not.toBe(genshinAdapter.weapons()[0].key);
  });

  it('opens on a pair the character can actually equip', () => {
    const s = useOptimizeRequest.getState();
    expect(genshinAdapter.canEquip(s.characterKey, s.weaponKey)).toBe(true);
  });

  it('isDefaultSelection tells an untouched selection from a chosen one', () => {
    expect(isDefaultSelection(useOptimizeRequest.getState())).toBe(true);
    useOptimizeRequest.getState().setCharacterKey('navia');
    expect(isDefaultSelection(useOptimizeRequest.getState())).toBe(false);
    expect(DEFAULT_SELECTION.characterKey).toBe('furina');
  });
});

describe('optimizeRequest store', () => {
  beforeEach(() => useOptimizeRequest.getState().reset());

  it('setMinER stores er_pct in constraints and currentRequest reflects it', () => {
    useOptimizeRequest.getState().setMinER('160');
    const req = currentRequest(useOptimizeRequest.getState());
    expect(req.constraints.minStats?.er_pct).toBe(160);
    expect(req.topK).toBe(10);
    expect(req.buildLevel).toBe(90);
  });

  it('setMinER with empty string removes er_pct and empty minStats', () => {
    useOptimizeRequest.getState().setMinER('160');
    useOptimizeRequest.getState().setMinER('');
    const req = currentRequest(useOptimizeRequest.getState());
    expect(req.constraints.minStats).toBeUndefined();
  });

  it('setMinER with empty string keeps other minStats fields intact', () => {
    // Set a constraint with both er_pct and em, then clear only er_pct.
    useOptimizeRequest.getState().applyPreset({
      characterKey: 'furina',
      weaponKey: 'aquila_favonia',
      objective: 'crit_value',
      constraints: { minStats: { er_pct: 200, em: 80 } },
    });
    useOptimizeRequest.getState().setMinER('');
    const req = currentRequest(useOptimizeRequest.getState());
    expect(req.constraints.minStats?.er_pct).toBeUndefined();
    expect(req.constraints.minStats?.em).toBe(80);
  });

  it('applyPreset stores constraints directly and currentRequest returns them', () => {
    useOptimizeRequest.getState().applyPreset({
      characterKey: 'furina',
      weaponKey: 'aquila_favonia',
      objective: 'crit_value',
      constraints: { minStats: { er_pct: 200 } },
    });
    const s = useOptimizeRequest.getState();
    expect(s.characterKey).toBe('furina');
    expect(currentRequest(s).constraints.minStats?.er_pct).toBe(200);
  });

  it('applyPreset with minStats containing er_pct AND another stat preserves both (regression)', () => {
    useOptimizeRequest.getState().applyPreset({
      characterKey: 'furina',
      weaponKey: 'aquila_favonia',
      objective: 'crit_value',
      constraints: { minStats: { er_pct: 200, em: 80 } },
    });
    const req = currentRequest(useOptimizeRequest.getState());
    expect(req.constraints.minStats?.er_pct).toBe(200);
    expect(req.constraints.minStats?.em).toBe(80);
  });

  it('applyPreset keeps a setRequirement constraint', () => {
    useOptimizeRequest.getState().applyPreset({
      characterKey: 'navia',
      weaponKey: 'beacon_of_the_reed_sea',
      objective: 'crit_value',
      constraints: {
        setRequirement: { kind: '4pc', setKey: 'GladiatorsFinale' },
      },
    });
    const s = useOptimizeRequest.getState();
    expect(currentRequest(s).constraints.setRequirement).toEqual({
      kind: '4pc',
      setKey: 'GladiatorsFinale',
    });
    // No ER floor in constraints.
    expect(currentRequest(s).constraints.minStats?.er_pct).toBeUndefined();
  });
});

describe('setMinER rejects a floor no build can meet', () => {
  beforeEach(() => useOptimizeRequest.getState().reset());

  // `Number('1e400')` is Infinity and `Number('Infinity')` parses: both are
  // numbers, not NaN, so the old `Number.isNaN` guard stored them as a
  // threshold every build fails — the optimiser then returned nothing, with
  // the field still showing what the user typed.
  it.each(['1e400', 'Infinity', '-5'])('clears the floor for %s', (input) => {
    useOptimizeRequest.getState().setMinER('200');
    expect(useOptimizeRequest.getState().constraints.minStats?.er_pct).toBe(
      200,
    );
    useOptimizeRequest.getState().setMinER(input);
    expect(useOptimizeRequest.getState().constraints.minStats).toBeUndefined();
  });

  it('still stores an ordinary floor', () => {
    useOptimizeRequest.getState().setMinER('0');
    expect(useOptimizeRequest.getState().constraints.minStats?.er_pct).toBe(0);
  });
});

describe('weapon legality lives in the request, not the panel', () => {
  beforeEach(() => {
    useOptimizeRequest.getState().reset();
    useRoster.getState().clear();
  });

  it('setCharacterKey re-picks a weapon the new character can equip', () => {
    // Nahida is a catalyst user; the default pair is a sword.
    useOptimizeRequest.getState().setCharacterKey('nahida');
    const s = useOptimizeRequest.getState();
    expect(genshinAdapter.canEquip('nahida', s.weaponKey)).toBe(true);
  });

  it('keeps a still-legal weapon rather than resetting it', () => {
    useOptimizeRequest.getState().setCharacterKey('nahida');
    useOptimizeRequest.getState().setWeaponKey('sacrificial_fragments');
    useOptimizeRequest.getState().setCharacterKey('klee');
    expect(useOptimizeRequest.getState().weaponKey).toBe(
      'sacrificial_fragments',
    );
  });

  it("prefers the player's own equipped weapon over the curated pick", () => {
    useRoster
      .getState()
      .setRoster({ raiden_shogun: { weaponKey: 'the_catch' } });
    useOptimizeRequest.getState().setCharacterKey('raiden_shogun');
    expect(useOptimizeRequest.getState().weaponKey).toBe('the_catch');
  });

  it('falls back to the curated meta weapon when the roster has none', () => {
    useOptimizeRequest.getState().setCharacterKey('navia');
    expect(useOptimizeRequest.getState().weaponKey).toBe(
      META_TARGETS.navia.weapon,
    );
  });

  it('falls back to the accessible pick when the recipe names no BiS', () => {
    // Zhongli's shield-bot guide ranks no 5-star, only cheap ER/HP sticks.
    expect(META_TARGETS.zhongli.weapon).toBeUndefined();
    useOptimizeRequest.getState().setCharacterKey('zhongli');
    expect(useOptimizeRequest.getState().weaponKey).toBe(
      META_TARGETS.zhongli.weaponAccessible,
    );
  });

  it('falls back to the first legal weapon when neither roster nor meta names one', () => {
    // Aino carries no curated recipe at all.
    expect(META_TARGETS.aino).toBeUndefined();
    useOptimizeRequest.getState().setCharacterKey('aino');
    expect(
      genshinAdapter.canEquip('aino', useOptimizeRequest.getState().weaponKey),
    ).toBe(true);
  });

  it('corrects an illegal pairing a preset asks for', () => {
    useOptimizeRequest.getState().applyPreset({
      characterKey: 'nahida',
      weaponKey: 'the_catch', // a polearm
      objective: 'crit_value',
      constraints: {},
    });
    const s = useOptimizeRequest.getState();
    expect(s.characterKey).toBe('nahida');
    expect(genshinAdapter.canEquip('nahida', s.weaponKey)).toBe(true);
  });

  it('treats a weapon the snapshot does not carry as illegal', () => {
    useOptimizeRequest.getState().applyPreset({
      characterKey: 'nahida',
      weaponKey: 'not_a_real_weapon',
      objective: 'crit_value',
      constraints: {},
    });
    expect(
      genshinAdapter.weapon(useOptimizeRequest.getState().weaponKey),
    ).toBeTruthy();
  });

  it('raises the build level to a rostered character’s own, and no further', () => {
    useRoster
      .getState()
      .setRoster({ raiden_shogun: { weaponKey: 'the_catch', buildLevel: 80 } });
    useOptimizeRequest.getState().setBuildLevel(70);
    useOptimizeRequest.getState().setCharacterKey('raiden_shogun');
    // A character can't be de-levelled, so the roster value is a floor.
    expect(useOptimizeRequest.getState().buildLevel).toBe(80);
    // ...and only a floor: a higher target the reader picked stands.
    useOptimizeRequest.getState().setBuildLevel(90);
    useOptimizeRequest.getState().setCharacterKey('nahida');
    useOptimizeRequest.getState().setCharacterKey('raiden_shogun');
    expect(useOptimizeRequest.getState().buildLevel).toBe(90);
  });

  it('keeps a manual weapon override across a flip away and back', () => {
    // The roster prefill is a *prefill*: it fires when the current weapon is
    // illegal for the new character, not every time that character is picked.
    useRoster
      .getState()
      .setRoster({ raiden_shogun: { weaponKey: 'the_catch' } });
    useOptimizeRequest.getState().setCharacterKey('raiden_shogun');
    expect(useOptimizeRequest.getState().weaponKey).toBe('the_catch');
    useOptimizeRequest.getState().setWeaponKey('staff_of_homa');
    // Nahida is a catalyst user, so the polearm can't survive the round trip
    // on its own — but Raiden's own override must not be re-applied over it.
    useOptimizeRequest.getState().setCharacterKey('xiangling'); // polearm user
    expect(useOptimizeRequest.getState().weaponKey).toBe('staff_of_homa');
    useOptimizeRequest.getState().setCharacterKey('raiden_shogun');
    expect(useOptimizeRequest.getState().weaponKey).toBe('staff_of_homa');
  });

  it('leaves the selection alone for a character the snapshot does not carry', () => {
    const before = useOptimizeRequest.getState().weaponKey;
    useOptimizeRequest.getState().setCharacterKey('zzz_not_a_character');
    expect(useOptimizeRequest.getState().weaponKey).toBe(before);
  });
});
