import { describe, it, expect } from 'vitest';
import { genshinAdapter } from './adapter';
import { WEAPON_TYPES } from '../types';
import type { Snapshot } from './snapshot';
import rawData from './data.generated.json';

const data = rawData as unknown as Snapshot;

describe('genshinAdapter', () => {
  it('returns a non-empty character list', () => {
    expect(genshinAdapter.characters().length).toBeGreaterThan(0);
  });
  it('resolves a key to its display name, falling back to the key itself', () => {
    const first = genshinAdapter.characters()[0];
    expect(genshinAdapter.characterName(first.key)).toBe(first.name);
    // A character newer than the frozen snapshot must degrade, not crash.
    expect(genshinAdapter.characterName('some_brand_new_character')).toBe(
      'some_brand_new_character',
    );
  });
  it('looks a weapon up by key, undefined when unknown', () => {
    const first = genshinAdapter.weapons()[0];
    expect(genshinAdapter.weapon(first.key)?.name).toBe(first.name);
    expect(genshinAdapter.weapon('__nope__')).toBeUndefined();
  });
  it('hands out the same frozen dataset arrays on every call', () => {
    expect(genshinAdapter.characters()).toBe(genshinAdapter.characters());
    expect(genshinAdapter.weapons()).toBe(genshinAdapter.weapons());
    expect(genshinAdapter.sets()).toBe(genshinAdapter.sets());
    expect(Object.isFrozen(genshinAdapter.characters())).toBe(true);
  });
  it('produces base stats with positive base ATK at level 90', () => {
    const chars = genshinAdapter.characters();
    const weapons = genshinAdapter.weapons();
    const base = genshinAdapter.baseStats(chars[0].key, weapons[0].key, 90);
    expect(base.atk ?? 0).toBeGreaterThan(0);
  });
  it('throws on an unresolved character or weapon key (fails loud, not a silent near-empty build)', () => {
    const chars = genshinAdapter.characters();
    const weapons = genshinAdapter.weapons();
    expect(() =>
      genshinAdapter.baseStats('__nope__', weapons[0].key, 90),
    ).toThrow(/unknown character/i);
    expect(() =>
      genshinAdapter.baseStats(chars[0].key, '__nope__', 90),
    ).toThrow(/unknown weapon/i);
  });
  it('resolves a 5-star ATK% main stat value at +20 to a known ~46.6%', () => {
    const v = genshinAdapter.mainStatValue('atk_pct', 5, 20);
    expect(v).toBeGreaterThan(40);
    expect(v).toBeLessThan(50);
  });

  // Regression: weapon base ATK must never be overwritten by the secondary stat.
  // Previously, weapons whose secondary stat was 'ATK' (ATK%) had base ATK
  // replaced with the raw fractional secondary value (e.g. 0.41 instead of ~509).
  it('preserves weapon base ATK at level 90 for 5★ ATK% secondary weapons', () => {
    // Wolf's Gravestone: 5★ claymore, base ATK ~608, secondary ATK%
    const wolfStats = data.weapons.find((w) => w.key === "wolf's_gravestone");
    expect(wolfStats).toBeDefined();
    expect(wolfStats?.byLevel['90']?.atk).toBeGreaterThan(400);

    // Akuoumaru: 4★ claymore, base ATK ~510, secondary ATK%
    const akuStats = data.weapons.find((w) => w.key === 'akuoumaru');
    expect(akuStats).toBeDefined();
    expect(akuStats?.byLevel['90']?.atk).toBeGreaterThan(400);

    // Amos' Bow: 5★ bow, base ATK ~608, secondary ATK%
    const amosStats = data.weapons.find((w) => w.key === "amos'_bow");
    expect(amosStats).toBeDefined();
    expect(amosStats?.byLevel['90']?.atk).toBeGreaterThan(400);
  });

  it('stores weapon ATK% secondary in percent-points (not 0..1 fraction)', () => {
    // Wolf's Gravestone ATK% secondary at 90 should be ~49.6, not ~0.5
    const wolfStats = data.weapons.find((w) => w.key === "wolf's_gravestone");
    const atk_pct = wolfStats?.byLevel['90']?.atk_pct ?? 0;
    expect(atk_pct).toBeGreaterThan(10); // definitely not a 0..1 fraction
    expect(atk_pct).toBeLessThan(100); // and not unreasonably large
  });

  it('every weapon with a level-90 entry has base ATK > 300', () => {
    const broken = data.weapons.filter(
      (w) =>
        w.byLevel['90'] !== undefined &&
        (w.byLevel['90'] as Record<string, number>).atk <= 300,
    );
    expect(broken.map((w) => w.key)).toEqual([]);
  });

  // Regression: parse2pc must recognise the "is increased by N%" phrasing.
  // Pale Flame's 2pc is "Physical DMG is increased by 25%." which lacks the
  // literal "+" the old physMatch regex required, so the set was dropped.
  it('parses Pale Flame 2pc as physical_dmg: 25', () => {
    const set = data.sets.find((s) => s.key === 'PaleFlame');
    expect(set).toBeDefined();
    expect(set?.twoPiece).toEqual({ physical_dmg: 25 });
  });

  // Regression: parse2pc must recognise the value-before-element phrasing.
  // Archaic Petra's 2pc is "Gain a 15% Geo DMG Bonus." (value precedes the
  // element name), so the old element regex didn't match and the set was dropped.
  it('parses Archaic Petra 2pc as elemental_dmg: 15', () => {
    const set = data.sets.find((s) => s.key === 'ArchaicPetra');
    expect(set).toBeDefined();
    expect(set?.twoPiece).toEqual({ elemental_dmg: 15 });
  });

  // Set keys MUST be GOOD-standard PascalCase so that GOOD-imported artifacts
  // (which use these keys) match the adapter's set-bonus keys and set-requirement
  // constraints. A regression to slug keys would silently break all set matching.
  it('uses GOOD-standard set keys (e.g. EmblemOfSeveredFate, GladiatorsFinale)', () => {
    const keys = genshinAdapter.sets().map((s) => s.key);
    expect(keys).toContain('EmblemOfSeveredFate');
    expect(keys).toContain('GladiatorsFinale');
    // No slug-style keys (lowercase / underscores) should remain.
    expect(keys.every((k) => /^[A-Za-z0-9]+$/.test(k))).toBe(true);
  });
});

describe('baseStats base Energy Recharge', () => {
  it('includes the universal 100% base ER for every character', () => {
    const anyWeapon = genshinAdapter.weapons()[0].key;
    for (const c of genshinAdapter.characters().slice(0, 10)) {
      const base = genshinAdapter.baseStats(c.key, anyWeapon, 90);
      expect(base.er_pct ?? 0).toBeGreaterThanOrEqual(100);
    }
  });
});

describe('artifact set snapshot', () => {
  it('retains conditional-2pc meta sets (Golden Troupe, Marechaussee Hunter)', () => {
    const keys = new Set(genshinAdapter.sets().map((s) => s.key));
    expect(keys.has('GoldenTroupe')).toBe(true);
    expect(keys.has('MarechausseeHunter')).toBe(true);
  });

  it('still scores a flat-stat 2pc bonus (Emblem Energy Recharge)', () => {
    const emblem = genshinAdapter
      .sets()
      .find((s) => s.key === 'EmblemOfSeveredFate');
    expect(emblem?.twoPiece?.er_pct).toBeGreaterThan(0);
  });
});

describe('weapon typing', () => {
  it('gives every character one of the five weapon classes', () => {
    const types = new Set(WEAPON_TYPES as readonly string[]);
    for (const c of genshinAdapter.characters())
      expect(types.has(c.weaponType), `${c.key} → ${c.weaponType}`).toBe(true);
  });

  it('weaponsOfType returns only that class, and every weapon exactly once', () => {
    let seen = 0;
    for (const t of WEAPON_TYPES) {
      const list = genshinAdapter.weaponsOfType(t);
      expect(list.length, `no ${t}s in the snapshot`).toBeGreaterThan(0);
      for (const w of list) expect(w.type).toBe(t);
      seen += list.length;
    }
    expect(seen).toBe(genshinAdapter.weapons().length);
  });

  it('canEquip matches the class, and passes keys the snapshot does not carry', () => {
    // Furina is a sword user; Aquila Favonia is a sword, The Catch a polearm.
    expect(genshinAdapter.canEquip('furina', 'aquila_favonia')).toBe(true);
    expect(genshinAdapter.canEquip('furina', 'the_catch')).toBe(false);
    // The exact hole this closes: a catalyst user holding a polearm.
    expect(genshinAdapter.canEquip('nahida', 'the_catch')).toBe(false);
    // Unknown either side: no evidence of an illegal pairing, so don't claim one.
    expect(genshinAdapter.canEquip('zzz_unknown', 'the_catch')).toBe(true);
    expect(genshinAdapter.canEquip('furina', 'zzz_unknown')).toBe(true);
  });

  it('carries a weapon rarity, so a picker can annotate without a second source', () => {
    expect(genshinAdapter.weapon('aquila_favonia')?.rarity).toBe(5);
    expect(genshinAdapter.weapon('the_catch')?.rarity).toBe(4);
  });
});
