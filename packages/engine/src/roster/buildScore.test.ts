import { describe, it, expect } from 'vitest';
import {
  band,
  bestBuiltCharacter,
  computeReadiness,
  equippedGrade,
  READINESS_POINTS,
} from './buildScore';
import type { RosterEntry } from '../import/good';
import type { Artifact, Slot, StatKey } from '../game/types';

let n = 0;
/** A piece contributing exactly `cr` crit rate and `cd` crit DMG. */
function piece(cr: number, cd: number): Artifact {
  const subStats = (
    [
      ['crit_rate', cr],
      ['crit_dmg', cd],
    ] as [StatKey, number][]
  )
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ key, value }));
  return {
    id: `p${n++}`,
    setKey: 'A',
    slot: 'flower',
    rarity: 5,
    level: 20,
    mainStat: 'hp',
    mainStatValue: 4780,
    subStats,
  };
}

const maxed: RosterEntry = {
  buildLevel: 90,
  talents: { auto: 9, skill: 9, burst: 9 },
  weaponLevel: 90,
};

describe('computeReadiness', () => {
  it('scores a fully levelled character with five pieces at 100', () => {
    // Artifact quality is its own score now (ADR-0057): what the pieces are
    // doesn't matter here, only that five are worn.
    const equipped = Array.from({ length: 5 }, () => piece(0, 0));
    expect(computeReadiness(maxed, equipped).total).toBeCloseTo(100, 6);
  });

  it('scores an empty entry with no artifacts at 0', () => {
    const s = computeReadiness({}, []);
    expect(s.total).toBe(0);
    expect(s.components.every((c) => c.points === 0)).toBe(true);
    expect(s.crowns).toBe(0);
  });

  it('is the old parts scaled evenly to 100: 36, 29, 21, 14', () => {
    expect(
      Object.values(READINESS_POINTS).reduce(
        (a: number, b: number) => a + b,
        0,
      ),
    ).toBe(100);
    // L80, talents 8/8/8, W90, 4 pieces.
    const equipped = Array.from({ length: 4 }, () => piece(10, 10));
    const s = computeReadiness(
      {
        buildLevel: 80,
        talents: { auto: 8, skill: 8, burst: 8 },
        weaponLevel: 90,
      },
      equipped,
    );
    const points = Object.fromEntries(
      s.components.map((c) => [c.label, c.points]),
    );
    expect(points['Character level']).toBeCloseTo((36 * 80) / 90, 6);
    expect(points['Talents']).toBeCloseTo((29 * 24) / 27, 6);
    expect(points['Weapon']).toBeCloseTo(21, 6);
    expect(points['Artifact count']).toBeCloseTo((14 * 4) / 5, 6);
    expect(points['Artifact quality']).toBeUndefined();
    expect(s.total).toBeCloseTo(32 + 25.78 + 21 + 11.2, 1);
  });

  it('caps each component rather than overflowing past 100', () => {
    const equipped = Array.from({ length: 5 }, () => piece(20, 40));
    const s = computeReadiness(
      { ...maxed, talents: { auto: 15, skill: 15, burst: 15 } },
      equipped,
    );
    expect(s.total).toBeCloseTo(100, 6);
  });

  it('counts a crown for each talent at level 10, without adding points', () => {
    const at = (auto: number, skill: number, burst: number) =>
      computeReadiness({ ...maxed, talents: { auto, skill, burst } }, []);
    expect(at(9, 9, 9).crowns).toBe(0);
    expect(at(10, 9, 10).crowns).toBe(2);
    expect(at(10, 10, 10).crowns).toBe(3);
    // 9/9/9 already fills the talents part.
    expect(at(10, 10, 10).total).toBeCloseTo(at(9, 9, 9).total, 6);
  });

  it('never lowers the total when a single input rises', () => {
    const base: RosterEntry = {
      buildLevel: 70,
      talents: { auto: 6, skill: 6, burst: 6 },
      weaponLevel: 70,
    };
    const equipped = [piece(5, 10), piece(5, 10)];
    const start = computeReadiness(base, equipped).total;
    expect(
      computeReadiness({ ...base, buildLevel: 80 }, equipped).total,
    ).toBeGreaterThanOrEqual(start);
    expect(
      computeReadiness(
        { ...base, talents: { auto: 7, skill: 6, burst: 6 } },
        equipped,
      ).total,
    ).toBeGreaterThanOrEqual(start);
    expect(
      computeReadiness({ ...base, weaponLevel: 90 }, equipped).total,
    ).toBeGreaterThanOrEqual(start);
    expect(
      computeReadiness(base, [...equipped, piece(5, 10)]).total,
    ).toBeGreaterThanOrEqual(start);
  });
});

describe('band', () => {
  // ADR-0057, with the owner's lines of 2026-10-07: readiness above 60,
  // then artifacts 21, 30, and over 35.
  it('needs readiness above 60, then splits artifacts at 21, 30 and 35', () => {
    expect(band(100, 35.1)).toBe('well_built');
    expect(band(100, 35)).toBe('built');
    expect(band(100, 30)).toBe('built');
    expect(band(100, 29.9)).toBe('partial');
    expect(band(100, 21)).toBe('partial');
    expect(band(100, 20.9)).toBe('unbuilt');
    expect(band(60, 80)).toBe('unbuilt');
    expect(band(60.1, 80)).toBe('well_built');
  });

  it('calls a levelled character wearing nothing unbuilt', () => {
    expect(band(86, 0)).toBe('unbuilt');
  });

  it('has its own band for a character with no recipe', () => {
    expect(band(100, null)).toBe('no_recipe');
    expect(band(10, null)).toBe('no_recipe');
  });
});

describe('bestBuiltCharacter', () => {
  const roster: Record<string, RosterEntry> = {
    amber: { buildLevel: 20 },
    furina: { buildLevel: 90, weaponKey: 'aquila_favonia' },
  };

  it('picks the highest-scoring character and hands back their weapon', () => {
    const best = bestBuiltCharacter(roster, []);
    expect(best?.characterKey).toBe('furina');
    expect(best?.weaponKey).toBe('aquila_favonia');
  });

  it('is undefined for an empty roster — nothing to prefer over the default', () => {
    expect(bestBuiltCharacter({}, [])).toBeUndefined();
  });

  it('omits the weapon when the entry has none equipped', () => {
    const best = bestBuiltCharacter({ amber: { buildLevel: 90 } }, []);
    expect(best?.characterKey).toBe('amber');
    expect(best?.weaponKey).toBeUndefined();
  });
});

describe('equippedGrade', () => {
  /** An EM piece — nahida's curated statTargets is `{ em: 900 }`. */
  function emPiece(slot: Slot, em: number): Artifact {
    return {
      id: `e${n++}`,
      setKey: 'GildedDreams',
      slot,
      rarity: 5,
      level: 20,
      mainStat: 'em',
      mainStatValue: em,
      subStats: [],
    };
  }

  it('grades a currently-equipped set the same way as the optimizer build', () => {
    // 5 pieces well past 900 EM between them — should clear the S threshold.
    const equipped: Artifact[] = [
      emPiece('flower', 200),
      emPiece('plume', 200),
      emPiece('sands', 200),
      emPiece('goblet', 200),
      emPiece('circlet', 200),
    ];
    const grade = equippedGrade(
      'nahida',
      'a_thousand_floating_dreams',
      90,
      equipped,
    );
    expect(grade).toBe('S');
  });

  it('is null with nothing equipped', () => {
    expect(
      equippedGrade('nahida', 'a_thousand_floating_dreams', 90, []),
    ).toBeNull();
  });

  it('is null for a character with no curated stat targets', () => {
    expect(
      equippedGrade('furina', 'splendor_of_tranquil_waters', 90, [
        emPiece('flower', 200),
      ]),
    ).toBeNull();
  });
});
