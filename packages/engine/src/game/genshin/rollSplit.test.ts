import { describe, expect, it } from 'vitest';
import type { Artifact, StatKey, SubStat } from '../types';
import { displaySteps } from '../../import/fingerprint';
import { splitRolls } from './rollSplit';
import { SUBSTAT_TIERS_5 } from './substatRolls';
import fixture from '../../prospects/__fixtures__/plus20-rolls.json';

const piece = (
  subStats: SubStat[],
  extra: Partial<Artifact> = {},
): Artifact => ({
  id: 'x',
  setKey: 'GladiatorsFinale',
  slot: 'circlet',
  rarity: 5,
  level: 20,
  mainStat: 'crit_rate',
  mainStatValue: 31.1,
  subStats,
  ...extra,
});

describe('splitRolls', () => {
  it('reads a line with one roll as that roll', () => {
    const [cd] = splitRolls(
      piece([{ key: 'crit_dmg', value: 7.8 }], { level: 0 }),
    );
    expect(cd).toEqual({
      kind: 'exact',
      rolls: [{ value: 7.77, tier: 3 }],
      firstKnown: false,
    });
  });

  it('puts the exported first roll first', () => {
    // HP 448: 209 then 239, the only split.
    const subs: SubStat[] = [
      { key: 'hp', value: 448 },
      { key: 'crit_dmg', value: 15.5 },
      { key: 'er_pct', value: 13.0 },
      { key: 'hp_pct', value: 14.6 },
    ];
    const [hp] = splitRolls(
      piece(subs, {
        rolls: { first: { hp: 209.13 }, total: 9 },
      }),
    );
    expect(hp).toMatchObject({ kind: 'exact', firstKnown: true });
    expect(hp.kind === 'exact' && hp.rolls.map((r) => r.tier)).toEqual([0, 1]);
  });

  it('gives only the count when several splits fit', () => {
    // 3.9 + (2.7 + 3.9 = 3.1 + 3.5): two upgrades, which tiers is open.
    const subs: SubStat[] = [
      { key: 'crit_rate', value: 10.5 },
      { key: 'hp', value: 209 },
      { key: 'atk', value: 14 },
      { key: 'def', value: 16 },
    ];
    const lines = splitRolls(
      piece(subs, {
        level: 8,
        rolls: {
          first: { crit_rate: 3.89, hp: 209.13, atk: 13.62, def: 16.2 },
          total: 6,
        },
      }),
    );
    expect(lines[0]).toMatchObject({ kind: 'count', count: 3 });
    expect(lines[0].kind === 'count' && lines[0].rest).toBeCloseTo(6.61);
    expect(lines[1]).toMatchObject({ kind: 'exact' });
  });

  it('says nothing for 4★ pieces or values no tiers reach', () => {
    expect(
      splitRolls(piece([{ key: 'hp', value: 448 }], { rarity: 4 })),
    ).toEqual([{ kind: 'unknown' }]);
    expect(
      splitRolls(piece([{ key: 'crit_rate', value: 1.0 }], { level: 0 })),
    ).toEqual([{ kind: 'unknown' }]);
  });

  // The owner's 309 +20 pieces (ADR-0024): every split the function claims
  // must reach the line's value, start with the exported first roll, and
  // the counts it fixes must fit the piece's rolls.
  it('agrees with every +20 piece of a real export', () => {
    const pieces = (
      fixture as unknown as {
        pieces: [number, [StatKey, number, number][]][];
      }
    ).pieces;
    let exact = 0;
    let counted = 0;
    let lines = 0;
    for (const [start, raw] of pieces) {
      const subStats = raw.map(([key, , value]) => ({ key, value }));
      const a = piece(subStats, {
        rolls: {
          first: Object.fromEntries(raw.map(([k, f]) => [k, f])),
          total: start + 5,
        },
      });
      const split = splitRolls(a);
      let fixed = 0;
      let allFixed = true;
      split.forEach((s, i) => {
        lines++;
        const line = subStats[i];
        const tiers = SUBSTAT_TIERS_5[line.key as keyof typeof SUBSTAT_TIERS_5];
        if (s.kind === 'exact') {
          exact++;
          fixed += s.rolls.length;
          expect(s.firstKnown).toBe(true);
          expect(displaySteps({ key: line.key, value: s.rolls[0].value })).toBe(
            displaySteps({ key: line.key, value: raw[i][1] }),
          );
          const sum = s.rolls.reduce((t, r) => t + tiers[r.tier], 0);
          expect(displaySteps({ key: line.key, value: sum })).toBe(
            displaySteps(line),
          );
        } else if (s.kind === 'count') {
          counted++;
          fixed += s.count;
        } else allFixed = false;
      });
      if (allFixed) expect(fixed).toBe(start + 5);
    }
    // Measured 2026-10-06: 992 exact, 220 by count, 24 open of 1,236.
    expect(exact / lines).toBeGreaterThan(0.75);
    expect((exact + counted) / lines).toBeGreaterThan(0.95);
  });
});
