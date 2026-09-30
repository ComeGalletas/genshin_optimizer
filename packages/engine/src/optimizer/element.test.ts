import { describe, it, expect } from 'vitest';
import type { Artifact } from '../game/types';
import { zeroOffElementGoblets } from './element';

const goblet = (element: Artifact['element']): Artifact => ({
  id: `g-${element}`,
  setKey: 'GoldenTroupe',
  slot: 'goblet',
  rarity: 5,
  level: 20,
  mainStat: 'elemental_dmg',
  mainStatValue: 46.6,
  element,
  subStats: [{ key: 'crit_rate', value: 7 }],
});

describe('zeroOffElementGoblets (ADR-0014)', () => {
  it('zeroes only the off-element main stat, keeping the sub-stats', () => {
    const [hydro, pyro] = zeroOffElementGoblets(
      [goblet('hydro'), goblet('pyro')],
      'furina',
    );
    expect(hydro.mainStatValue).toBe(46.6);
    expect(pyro.mainStatValue).toBe(0);
    expect(pyro.subStats).toEqual([{ key: 'crit_rate', value: 7 }]);
  });

  it('leaves pieces alone for a character the dataset doesn’t know', () => {
    expect(
      zeroOffElementGoblets([goblet('pyro')], 'nobody')[0].mainStatValue,
    ).toBe(46.6);
  });
});
