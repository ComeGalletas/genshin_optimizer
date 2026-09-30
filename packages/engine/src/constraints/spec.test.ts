import { describe, it, expect } from 'vitest';
import {
  MAIN_STATS_BY_SLOT,
  parseConstraintSpec,
  SPEC_VERSION,
  type SpecIssue,
} from './spec';

const ok = (input: unknown) => {
  const r = parseConstraintSpec(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.spec;
};
const issues = (input: unknown): SpecIssue[] => {
  const r = parseConstraintSpec(input);
  if (r.ok) throw new Error('expected issues');
  return r.issues;
};

describe('ConstraintSpec: valid specs', () => {
  it('the Phase 3 question: defaults plus an ER floor, version filled in', () => {
    expect(ok({ character: 'furina', minStats: { er_pct: 180 } })).toEqual({
      version: SPEC_VERSION,
      character: 'furina',
      minStats: { er_pct: 180 },
    });
  });

  it('every field at once', () => {
    const spec = {
      version: 1,
      character: 'neuvillette',
      weapon: 'tome_of_the_eternal_flow',
      buildLevel: 90,
      defaults: 'replace',
      set: { kind: '2+2', setKeys: ['MarechausseeHunter', 'GoldenTroupe'] },
      mainStats: { sands: 'hp_pct', goblet: 'elemental_dmg', circlet: 'any' },
      minStats: { er_pct: 120, crit_rate: 60 },
      maxStats: { crit_rate: 100 },
      objective: { weights: { hp_pct: 1, crit_rate: 2, crit_dmg: 1 } },
      keepEquippedOn: ['furina', 'kaedehara_kazuha'],
      excludeArtifacts: ['m1-17'],
      teamBuffs: { hp_pct: 20, elemental_dmg: 15 },
      enemy: { level: 100, res: -20 },
    };
    expect(ok(spec)).toEqual(spec);
  });

  it('every set rule, and unequipped pieces only', () => {
    for (const set of [
      { kind: '4pc', setKey: 'GoldenTroupe' },
      { kind: '2pc', setKey: 'GoldenTroupe' },
      { kind: 'any' },
    ])
      expect(ok({ character: 'furina', set }).set).toEqual(set);
    expect(
      ok({ character: 'furina', keepEquippedOn: 'all' }).keepEquippedOn,
    ).toBe('all');
  });

  it('a damage objective where a damage profile exists', () => {
    expect(ok({ character: 'furina', objective: 'avg_damage' }).objective).toBe(
      'avg_damage',
    );
  });
});

describe('ConstraintSpec: shape', () => {
  it('refuses unknown fields anywhere, naming what exists instead', () => {
    const [pool] = issues({ character: 'furina', pool: 'free' });
    expect(pool.path).toBe('pool');
    expect(pool.message).toMatch(
      /^unknown field "pool"; the fields are version, character, weapon/,
    );
    expect(
      issues({ character: 'furina', mainStats: { flower: 'hp' } }),
    ).toEqual([
      {
        path: 'mainStats.flower',
        message:
          '"flower" has no choice of main stat; only sands, goblet and circlet do',
      },
    ]);
    expect(
      issues({
        character: 'furina',
        set: { kind: '4pc', setKey: 'GoldenTroupe', pieces: 4 },
      })[0],
    ).toMatchObject({ path: 'set.pieces', message: 'unknown field "pieces"' });
    expect(
      issues({ character: 'furina', minStats: { energy: 180 } })[0],
    ).toMatchObject({
      path: 'minStats.energy',
      message: expect.stringMatching(
        /^unknown stat "energy"; the stats are hp, hp_pct/,
      ),
    });
  });

  it('explains what each field accepts', () => {
    const one = (x: unknown) => issues(x)[0];
    expect(one({ character: 'furina', minStats: { er_pct: -5 } })).toEqual({
      path: 'minStats.er_pct',
      message: 'must be at least 0',
    });
    expect(one({ character: 3 })).toEqual({
      path: 'character',
      message: 'expected string',
    });
    expect(one({ character: 'furina', objective: 'dps' }).message).toMatch(
      /^must be "crit_value", "avg_damage", a stat key/,
    );
    expect(
      one({ character: 'furina', set: { kind: '3pc', setKey: 'X' } }),
    ).toEqual({
      path: 'set.kind',
      message: 'must be one of "4pc", "2pc", "2+2", "any"',
    });
    expect(one({ character: 'furina', keepEquippedOn: 'nobody' }).message).toBe(
      'must be "all" or a list of character keys',
    );
    expect(
      one({ character: 'furina', mainStats: { sands: 'energy' } }).message,
    ).toBe('must be a stat key or "any"');
    expect(one({ character: 'furina', buildLevel: 85 }).message).toBe(
      'one of 1, 20, 40, 50, 60, 70, 80, 90',
    );
  });

  it('refuses another version, fractions-of-one mistakes aside', () => {
    expect(issues({ version: 2, character: 'furina' })[0]).toEqual({
      path: 'version',
      message: 'must be 1',
    });
    // 1.8 is a valid number, so it passes the shape; percent is documented.
    expect(
      ok({ character: 'furina', minStats: { er_pct: 1.8 } }).minStats,
    ).toEqual({
      er_pct: 1.8,
    });
  });

  it('checks vocabulary and ranges', () => {
    const paths = (x: unknown) => issues(x).map((i) => i.path);
    expect(paths({ minStats: { er_pct: 180 } })).toEqual(['character']);
    expect(paths({ character: 'furina', minStats: { er_pct: -5 } })).toEqual([
      'minStats.er_pct',
    ]);
    expect(paths({ character: 'furina', buildLevel: 85 })).toEqual([
      'buildLevel',
    ]);
    expect(paths({ character: 'furina', objective: 'dps' })).toEqual([
      'objective',
    ]);
    expect(paths({ character: 'furina', enemy: { level: 0 } })).toEqual([
      'enemy.level',
    ]);
    expect(
      paths({ character: 'furina', set: { kind: '3pc', setKey: 'X' } }),
    ).toEqual(['set.kind']);
  });
});

describe('ConstraintSpec: meaning', () => {
  it('names unknown keys and suggests the closest one', () => {
    expect(issues({ character: 'furnia' })).toEqual([
      {
        path: 'character',
        message: 'unknown character "furnia"; did you mean "furina"?',
      },
    ]);
    expect(
      issues({
        character: 'furina',
        set: { kind: '4pc', setKey: 'GoldenTrope' },
      }),
    ).toEqual([
      {
        path: 'set.setKey',
        message:
          'unknown artifact set "GoldenTrope"; did you mean "GoldenTroupe"?',
      },
    ]);
    expect(
      issues({ character: 'furina', weapon: 'splendor' })[0],
    ).toMatchObject({
      path: 'weapon',
      message: expect.stringMatching(/^unknown weapon "splendor"/),
    });
    // Nothing close: no guess.
    expect(issues({ character: 'zzzzzzzz' })[0].message).toBe(
      'unknown character "zzzzzzzz"',
    );
  });

  it('refuses a weapon the character can’t wield', () => {
    expect(
      issues({ character: 'furina', weapon: "wolf's_gravestone" })[0],
    ).toMatchObject({
      path: 'weapon',
      message: expect.stringMatching(/sword/),
    });
  });

  it('refuses a main stat the slot can’t roll, listing the ones it can', () => {
    expect(
      issues({ character: 'furina', mainStats: { sands: 'crit_rate' } }),
    ).toEqual([
      {
        path: 'mainStats.sands',
        message: `a sands can't have crit_rate as its main stat; it can have ${MAIN_STATS_BY_SLOT.sands.join(', ')}`,
      },
    ]);
  });

  it('refuses contradictions and impossible objectives', () => {
    expect(
      issues({
        character: 'furina',
        minStats: { er_pct: 200 },
        maxStats: { er_pct: 150 },
      }),
    ).toEqual([
      {
        path: 'minStats.er_pct',
        message: 'the minimum 200 is above the maximum 150',
      },
    ]);
    expect(
      issues({
        character: 'furina',
        set: { kind: '2+2', setKeys: ['GoldenTroupe', 'GoldenTroupe'] },
      })[0].path,
    ).toBe('set.setKeys');
    expect(
      issues({ character: 'furina', objective: { weights: { hp_pct: 0 } } })[0]
        .path,
    ).toBe('objective.weights');
    expect(
      issues({ character: 'furina', keepEquippedOn: ['neuvilette'] })[0],
    ).toMatchObject({
      path: 'keepEquippedOn.0',
      message: expect.stringMatching(/did you mean "neuvillette"/),
    });
  });

  it('refuses a damage objective without a damage profile', () => {
    // Characters with no curated damage profile (1.4's coverage report).
    const r = parseConstraintSpec({
      character: 'diluc',
      objective: 'avg_damage',
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues[0]).toMatchObject({
        path: 'objective',
        message: expect.stringMatching(/no damage profile for Diluc/),
      });
  });

  it('reports every problem at once, so one retry can fix them all', () => {
    expect(
      issues({
        character: 'furina',
        weapon: "wolf's_gravestone",
        mainStats: { circlet: 'er_pct' },
        minStats: { hp: 50000 },
        maxStats: { hp: 30000 },
      }).map((i) => i.path),
    ).toEqual(['weapon', 'mainStats.circlet', 'minStats.hp']);
  });
});
