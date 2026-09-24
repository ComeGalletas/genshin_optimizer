import { describe, it, expect } from 'vitest';
import {
  computeBuildScore,
  band,
  bestBuiltCharacter,
  equippedGrade,
} from './buildScore';
import { artifactContribution, objectiveValue } from '../optimizer/score';
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

describe('computeBuildScore', () => {
  it('scores a fully built character at 100', () => {
    // 5 pieces, 180 CV total => 36 CV each (e.g. 8 crit rate + 20 crit DMG).
    const equipped = Array.from({ length: 5 }, () => piece(8, 20));
    expect(computeBuildScore(maxed, equipped).total).toBeCloseTo(100, 6);
  });

  it('scores an empty entry with no artifacts at 0', () => {
    const s = computeBuildScore({}, []);
    expect(s.total).toBe(0);
    expect(s.components.every((c) => c.points === 0)).toBe(true);
  });

  it('matches the formula component by component on a mid case', () => {
    // L80, talents 8/8/8, W90, 4 pieces, 120 CV
    const equipped = Array.from({ length: 4 }, () => piece(10, 10));
    const s = computeBuildScore(
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
    expect(points['Character level']).toBeCloseTo(22.22, 2);
    expect(points['Talents']).toBeCloseTo(17.78, 2);
    expect(points['Weapon']).toBeCloseTo(15, 6);
    expect(points['Artifact count']).toBeCloseTo(8, 6);
    expect(points['Artifact quality']).toBeCloseTo(20, 6);
    expect(s.total).toBeCloseTo(83.0, 1);
    expect(band(s.total)).toBe('built');
  });

  it('caps each component rather than overflowing past 100', () => {
    const equipped = Array.from({ length: 5 }, () => piece(20, 40));
    const s = computeBuildScore(
      { ...maxed, talents: { auto: 15, skill: 15, burst: 15 } },
      equipped,
    );
    expect(s.total).toBeCloseTo(100, 6);
  });

  it('never lowers the total when a single input rises', () => {
    const base: RosterEntry = {
      buildLevel: 70,
      talents: { auto: 6, skill: 6, burst: 6 },
      weaponLevel: 70,
    };
    const equipped = [piece(5, 10), piece(5, 10)];
    const start = computeBuildScore(base, equipped).total;
    expect(
      computeBuildScore({ ...base, buildLevel: 80 }, equipped).total,
    ).toBeGreaterThanOrEqual(start);
    expect(
      computeBuildScore(
        { ...base, talents: { auto: 7, skill: 6, burst: 6 } },
        equipped,
      ).total,
    ).toBeGreaterThanOrEqual(start);
    expect(
      computeBuildScore({ ...base, weaponLevel: 90 }, equipped).total,
    ).toBeGreaterThanOrEqual(start);
    expect(
      computeBuildScore(base, [...equipped, piece(5, 10)]).total,
    ).toBeGreaterThanOrEqual(start);
  });
});

describe('Artifact quality component vs. optimizer/score.ts', () => {
  it('derives from objectiveValue(artifactContribution(a), "crit_value") — the two surfaces cannot diverge', () => {
    // FULL_CV is 180 across five pieces; fixtures below sit at 0, one third,
    // and full CV so the "Artifact quality" points can be checked directly
    // against a value computed only via score.ts's own exports.
    const fixtures: Artifact[][] = [
      [piece(0, 0)],
      [piece(8, 20), piece(8, 20)],
      Array.from({ length: 5 }, () => piece(8, 20)),
    ];
    for (const equipped of fixtures) {
      const expectedCV = equipped.reduce(
        (sum, a) => sum + objectiveValue(artifactContribution(a), 'crit_value'),
        0,
      );
      const s = computeBuildScore(maxed, equipped);
      const points = Object.fromEntries(
        s.components.map((c) => [c.label, c.points]),
      );
      const expectedPoints = Math.min(Math.max(expectedCV / 180, 0), 1) * 30;
      expect(points['Artifact quality']).toBeCloseTo(expectedPoints, 6);
    }
  });
});

describe('band', () => {
  it('splits at 70 and 40', () => {
    expect(band(70)).toBe('built');
    expect(band(69.9)).toBe('partial');
    expect(band(40)).toBe('partial');
    expect(band(39.9)).toBe('unbuilt');
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
