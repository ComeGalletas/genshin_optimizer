import { describe, expect, it } from 'vitest';
import {
  constellationOf,
  isGenericSetText,
  readStats,
  roleOf,
  setKeyOf,
  splitLabels,
  statsOf,
} from './labels';

describe('statsOf', () => {
  it('reads main-stat labels', () => {
    expect(statsOf('Hydro DMG Bonus', 'main')).toEqual(['elemental_dmg']);
    expect(statsOf('PHEC DMG%', 'main')).toEqual(['elemental_dmg']);
    expect(statsOf('Physical DMG Bonus', 'main')).toEqual(['physical_dmg']);
    expect(statsOf('HP', 'main')).toEqual(['hp_pct']);
    expect(statsOf('CRIT', 'main')).toEqual(['crit_rate', 'crit_dmg']);
    expect(statsOf('Healing Bonus', 'main')).toEqual(['healing']);
    expect(statsOf('CRIT DMG%', 'main')).toEqual(['crit_dmg']);
    expect(statsOf('Moonsign', 'main')).toEqual([]);
  });

  it('reads a bare HP as flat or as the percent, per source', () => {
    expect(statsOf('HP', 'sub')).toEqual(['hp']);
    expect(statsOf('HP', 'sub', false)).toEqual(['hp_pct']);
    expect(statsOf('Flat HP', 'sub', false)).toEqual(['hp']);
    expect(statsOf('ATK%', 'sub')).toEqual(['atk_pct']);
  });
});

describe('readStats', () => {
  it('splits on the guides’ separators and drops what isn’t a stat', () => {
    expect(
      readStats(
        'ER (until requirement) > HP% >> ATK% = EM ≥ CRIT',
        'sub',
        false,
      ).stats,
    ).toEqual(['er_pct', 'hp_pct', 'atk_pct', 'em', 'crit_rate', 'crit_dmg']);
    expect(
      readStats('ER until requirement > CRIT Rate/DMG', 'sub').stats,
    ).toEqual(['er_pct', 'crit_rate', 'crit_dmg']);
    expect(readStats('Nilou Bloom: ER% > EM*', 'sub').stats).toEqual([
      'er_pct',
      'em',
    ]);
    expect(readStats('HP% ≈ CRIT DMG', 'sub').stats).toEqual([
      'hp_pct',
      'crit_dmg',
    ]);
    expect(readStats('EM or Moonsign', 'main')).toEqual({
      stats: ['em'],
      unread: ['Moonsign'],
    });
    expect(splitLabels('Any / DMG')).toEqual(['Any', 'DMG']);
    expect(readStats('Any > DMG', 'sub').unread).toEqual([]);
  });
});

describe('setKeyOf', () => {
  it('reads names, slugs and piece counts', () => {
    expect(setKeyOf('4pc Ocean-Hued Clam (OHC)')).toBe('OceanHuedClam');
    expect(setKeyOf('oceanhued_clam')).toBe('OceanHuedClam');
    expect(setKeyOf('Tenacity of the Millelith (2MB')).toBe(
      'TenacityOfTheMillelith',
    );
    expect(setKeyOf('Emblem of Severe Fate')).toBeUndefined();
  });

  it('reads a guide’s shorthand only when asked, and only when one set fits', () => {
    expect(setKeyOf('Emblem of Severe Fate', true)).toBe('EmblemOfSeveredFate');
    expect(setKeyOf('TotM', true)).toBe('TenacityOfTheMillelith');
    expect(setKeyOf('EoSF', true)).toBe('EmblemOfSeveredFate');
    expect(setKeyOf('Husk', true)).toBe('HuskOfOpulentDreams');
    expect(setKeyOf('Voroukasha', true)).toBe('VourukashasGlow');
    expect(setKeyOf('EM', true)).toBeUndefined();
    expect(setKeyOf('Nonexistent Set Of Things', true)).toBeUndefined();
  });

  it('tells a generic bonus from a set’s name', () => {
    expect(isGenericSetText('2pc ATK%')).toBe(true);
    expect(isGenericSetText('Any combination of')).toBe(true);
    expect(isGenericSetText('2pc EM')).toBe(true);
    expect(isGenericSetText('4pc Moonlit Lantern')).toBe(false);
  });
});

describe('roleOf', () => {
  it('takes the role named first, and a reaction only when it drives damage', () => {
    expect(roleOf('HEAL SUPPORT')).toBe('healer');
    expect(roleOf('Bloom DPS')).toBe('reaction_dps');
    expect(roleOf('Hyperbloom / Overloaded Trigger')).toBe('reaction_dps');
    expect(roleOf('Burgeon')).toBe('reaction_dps');
    expect(roleOf('On-Field Driver')).toBe('reaction_dps');
    expect(roleOf('REACTION SUPPORT')).toBe('support');
    expect(roleOf('DPS & BUFF SUPPORT')).toBe('on_field_dps');
    expect(roleOf('BUFF SUPPORT & DAMAGE')).toBe('support');
    expect(roleOf('OFF-FIELD DPS & BUFF AND HEAL SUPPORT')).toBe(
      'off_field_dps',
    );
    expect(roleOf('Off-Field Support')).toBe('support');
    expect(roleOf('SHIELD & BUFF SUPPORT')).toBe('shield');
    expect(roleOf('Sub DPS')).toBe('off_field_dps');
    expect(roleOf('FREEZE / MONO CRYO')).toBe('on_field_dps');
    expect(roleOf('General')).toBeUndefined();
  });
});

describe('constellationOf', () => {
  it('reads a constellation a build needs, but not one it predates', () => {
    expect(constellationOf('C6 or Burst Talent Level 10+')).toBe('C6');
    expect(constellationOf('Shield Support (C4+)')).toBe('C4');
    expect(constellationOf('Pre-C6')).toBeUndefined();
    expect(constellationOf('C0–C5 and Burst Talent Level 9')).toBeUndefined();
    expect(constellationOf('Physical DPS')).toBeUndefined();
  });
});
