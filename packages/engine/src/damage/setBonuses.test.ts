import { describe, expect, it } from 'vitest';
import {
  FOUR_PIECE_BONUSES,
  UNMODELLED_FOUR_PIECE,
  fourPieceAssumptions,
  fourPieceVector,
  weightedHitKindShares,
  REPRESENTATIVE_ENDGAME_SHEET,
} from './setBonuses';
import { DAMAGE_PROFILES } from './profiles';
import { targetFunctionScore } from './formula';
import { DEFAULT_ENEMY } from './types';
import type { DamageContext } from './types';
import { genshinAdapter } from '../game/genshin/adapter';
import { buildContext } from '../optimizer/context';
import { totals } from '../optimizer/score';
import type { Artifact, StatVec } from '../game/types';

const base: StatVec = { atk: 900, crit_rate: 5, crit_dmg: 50, er_pct: 100 };

const dmg = (characterKey: string): DamageContext => ({
  profile: DAMAGE_PROFILES[characterKey],
  enemy: DEFAULT_ENEMY,
  charLevel: 90,
});

describe('the curated table', () => {
  it('names only sets the frozen snapshot knows', () => {
    const known = new Set(genshinAdapter.sets().map((s) => s.key));
    for (const key of [
      ...Object.keys(FOUR_PIECE_BONUSES),
      ...Object.keys(UNMODELLED_FOUR_PIECE),
    ])
      expect(known, key).toContain(key);
  });

  it('never lists a set as both modelled and unmodelled', () => {
    for (const key of Object.keys(FOUR_PIECE_BONUSES))
      expect(UNMODELLED_FOUR_PIECE[key]).toBeUndefined();
  });

  it('states an uptime assumption and a source for every entry', () => {
    for (const [key, e] of Object.entries(FOUR_PIECE_BONUSES)) {
      expect(e.uptime.length, key).toBeGreaterThan(20);
      expect(e.source, key).toMatch(/^https:\/\//);
      // An entry that carries neither channel would score nothing and belongs
      // in UNMODELLED_FOUR_PIECE instead.
      expect(Boolean(e.sheet ?? e.hitDmg ?? e.burstDmgFromEr), key).toBe(true);
    }
  });

  it('covers every 4pc set the meta targets require, one way or the other', async () => {
    const { META_TARGETS } = await import('../meta/metaTargets');
    const required = new Set<string>();
    for (const t of Object.values(META_TARGETS)) {
      const r = t.setRequirement;
      if (r.kind === '4pc') required.add(r.setKey);
    }
    for (const key of required)
      expect(
        Boolean(FOUR_PIECE_BONUSES[key] ?? UNMODELLED_FOUR_PIECE[key]),
        `${key} is neither modelled nor listed as deliberately unmodelled`,
      ).toBe(true);
  });
});

describe('fourPieceVector', () => {
  it('returns the sheet stats for a flat-stat 4pc, with or without a profile', () => {
    expect(fourPieceVector('BlizzardStrayer')).toEqual({ crit_rate: 40 });
    expect(
      fourPieceVector('BlizzardStrayer', { damage: dmg('ganyu'), base }),
    ).toEqual({ crit_rate: 40 });
  });

  it('withholds a hit-kind bonus from the scalar path', () => {
    // Gladiator's +35% Normal Attack DMG is not a sheet stat: a crit_value or
    // atk_pct search must not collect it.
    expect(fourPieceVector('GladiatorsFinale')).toBeUndefined();
    expect(fourPieceVector('GoldenTroupe')).toBeUndefined();
    expect(fourPieceVector('EmblemOfSeveredFate')).toBeUndefined();
  });

  it('weights a hit-kind bonus by that kind’s share of the profile', () => {
    // Ganyu's profile is two charged hits plus one burst hit; Wanderer's
    // Troupe buffs only the charged ones, so the folded elemental_dmg must sit
    // strictly between 0 and the full +35%.
    const v = fourPieceVector('WanderersTroupe', {
      damage: dmg('ganyu'),
      base,
      weaponType: 'bow',
    });
    const folded = v?.elemental_dmg ?? 0;
    expect(folded).toBeGreaterThan(0);
    expect(folded).toBeLessThan(35);
  });

  it('gives a burst-only profile nearly the whole hit-kind bonus', () => {
    // Xiangling is overwhelmingly burst damage, so Emblem's burst bonus should
    // land close to its full value (25% of the profile's 130% ER = 32.5%).
    const v = fourPieceVector('EmblemOfSeveredFate', {
      damage: dmg('xiangling'),
      base,
    });
    const er = DAMAGE_PROFILES.xiangling.erRequirement ?? 100;
    const full = Math.min(75, 0.25 * er);
    expect(v?.elemental_dmg ?? 0).toBeGreaterThan(full * 0.5);
    expect(v?.elemental_dmg ?? 0).toBeLessThanOrEqual(full);
  });

  it('honours the weapon-class gate', () => {
    // Tartaglia's profile has Normal-Attack hits, which is what Gladiator buffs.
    const d = { damage: dmg('tartaglia'), base };
    expect(
      fourPieceVector('GladiatorsFinale', { ...d, weaponType: 'sword' })
        ?.elemental_dmg,
    ).toBeGreaterThan(0);
    expect(
      fourPieceVector('GladiatorsFinale', { ...d, weaponType: 'catalyst' }),
    ).toBeUndefined();
    // Unknown weapon type: no evidence the gate fails, so the bonus applies.
    expect(fourPieceVector('GladiatorsFinale', d)).toBeDefined();
  });

  it('is undefined for a set with no 4pc and for an unknown key', () => {
    expect(
      fourPieceVector('ViridescentVenerer', { damage: dmg('keqing'), base }),
    ).toBeUndefined();
    expect(fourPieceVector('NotASet')).toBeUndefined();
  });
});

describe('the bonus reaches the score only at four pieces', () => {
  const mk = (setKey: string, slot: Artifact['slot']): Artifact => ({
    id: `${setKey}-${slot}`,
    setKey,
    slot,
    rarity: 5,
    level: 20,
    mainStat: 'atk',
    mainStatValue: 0,
    subStats: [],
  });

  it('countSets < 4 scores no 4pc, countSets >= 4 does', () => {
    const ctx = buildContext({
      characterKey: 'ganyu',
      weaponKey: "amos'_bow",
      buildLevel: 90,
      constraints: {},
      objective: 'avg_damage',
    });
    const four = ctx.setBonuses.BlizzardStrayer.four;
    expect(four).toEqual({ crit_rate: 40 });

    const three = ['flower', 'plume', 'sands'] as const;
    const build3 = [
      ...three.map((s) => mk('BlizzardStrayer', s)),
      mk('Other', 'goblet'),
      mk('Other', 'circlet'),
    ];
    const build4 = [
      ...three.map((s) => mk('BlizzardStrayer', s)),
      mk('BlizzardStrayer', 'goblet'),
      mk('Other', 'circlet'),
    ];
    const cr = (b: Artifact[]) => totals(ctx, b).crit_rate ?? 0;
    expect(cr(build4) - cr(build3)).toBeCloseTo(40, 10);

    // …and the damage engine sees it, because it reads the same totals.
    const score = (b: Artifact[]) =>
      targetFunctionScore(ctx.base, totals(ctx, b), ctx.damage!);
    expect(score(build4)).toBeGreaterThan(score(build3));
  });

  it('buildContext resolves 4pc from the curated table, not the snapshot', () => {
    // Every snapshot set carries a 2pc and no 4pc; the curated table is the
    // only source of `four`.
    for (const s of genshinAdapter.sets()) expect(s.fourPiece).toBeUndefined();
    const ctx = buildContext({
      characterKey: 'hu_tao',
      weaponKey: 'staff_of_homa',
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    });
    expect(ctx.setBonuses.CrimsonWitchOfFlames.four).toEqual({
      elemental_dmg: 22.5,
    });
    // No damage profile in a scalar run, so hit-kind sets stay out.
    expect(ctx.setBonuses.GoldenTroupe.four).toBeUndefined();
  });
});

describe('fourPieceAssumptions', () => {
  it('states the uptime for a set that is actually scored', () => {
    const lines = fourPieceAssumptions(['BlizzardStrayer'], {
      hasDamage: true,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('BlizzardStrayer 4pc:');
    expect(lines[0]).toContain('Frozen');
  });

  it('says why an unmodelled set has no number instead of staying silent', () => {
    const lines = fourPieceAssumptions(['ThunderingFury'], {
      hasDamage: true,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('ThunderingFury 4pc not scored:');
    expect(lines[0]).toContain(UNMODELLED_FOUR_PIECE.ThunderingFury);
  });

  it('discloses that a hit-kind set is unscored on a scalar objective', () => {
    // Raiden's Emblem is burst-DMG-from-ER only: nothing a crit_value run can
    // read, and the old copy printed its uptime as if it counted.
    expect(
      fourPieceAssumptions(['EmblemOfSeveredFate'], {
        hasDamage: false,
      }),
    ).toEqual(['EmblemOfSeveredFate 4pc: not scored on this objective.']);
  });

  it('discloses the weapon gate rather than an uptime that cannot apply', () => {
    expect(
      fourPieceAssumptions(['GladiatorsFinale'], {
        hasDamage: true,
        weaponType: 'bow',
      }),
    ).toEqual(['GladiatorsFinale 4pc: not scored for this weapon class.']);
    // …and the same set on a matching weapon is a normal uptime line.
    const ok = fourPieceAssumptions(['GladiatorsFinale'], {
      hasDamage: true,
      weaponType: 'claymore',
    });
    expect(ok[0]).toContain('GladiatorsFinale 4pc: Unconditional');
  });

  it('says the hit-kind bonus is folded into the Elemental DMG figure', () => {
    const [line] = fourPieceAssumptions(['GoldenTroupe'], { hasDamage: true });
    expect(line).toContain('Elemental DMG');
  });

  it('silently skips a set key that is neither modelled nor curated as unmodelled', () => {
    // Exercises the `if (reason)` false branch (setBonuses.ts:386): a set key
    // absent from both FOUR_PIECE_BONUSES and UNMODELLED_FOUR_PIECE — e.g. one
    // with no 4pc effect at all — must not surface a line.
    expect(
      fourPieceAssumptions(['NotACuratedSetAtAll'], { hasDamage: true }),
    ).toEqual([]);
  });

  it('renders the caller-supplied display name', () => {
    const [line] = fourPieceAssumptions(
      ['BlizzardStrayer'],
      { hasDamage: true },
      () => 'Blizzard Strayer',
    );
    expect(line).toContain('Blizzard Strayer 4pc:');
  });
});

describe('weightedHitKindShares', () => {
  it('normalises by the elemental sum, so a part-physical profile is not discounted', () => {
    const d = dmg('hu_tao');
    const shares = weightedHitKindShares({ ...base, em: 300 }, d);
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('is measured at the supplied sheet, not silently at a bare base', () => {
    const d = dmg('hu_tao');
    const bare = weightedHitKindShares(base, d);
    const endgame = weightedHitKindShares(
      { ...base, ...REPRESENTATIVE_ENDGAME_SHEET },
      d,
    );
    // Reaction-carrying hits scale with EM, so the two sheets do not agree —
    // which is the whole reason buildContext stopped passing the bare base.
    expect(endgame).not.toEqual(bare);
  });

  it('skips a physical-bonus hit rather than folding it into the elemental sum', () => {
    // No curated profile has a physical hit today, so this exercises the
    // `hit.bonus !== 'elemental'` skip (setBonuses.ts:341) directly: a profile
    // mixing one physical and one elemental hit must attribute the whole
    // elemental total to the elemental hit alone.
    const d: DamageContext = {
      profile: {
        characterKey: 'synthetic',
        source: 'test',
        hits: [
          {
            name: 'Physical Hit',
            kind: 'normal',
            scaling: 'atk',
            multiplier: 200,
            bonus: 'physical',
            reaction: 'none',
            weight: 1,
          },
          {
            name: 'Elemental Hit',
            kind: 'skill',
            scaling: 'atk',
            multiplier: 200,
            bonus: 'elemental',
            reaction: 'none',
            weight: 1,
          },
        ],
      },
      enemy: DEFAULT_ENEMY,
      charLevel: 90,
    };
    const shares = weightedHitKindShares(base, d);
    expect(shares.normal).toBeUndefined();
    expect(shares.skill).toBeCloseTo(1, 10);
  });

  it('returns no shares at all for an entirely physical profile', () => {
    // Exercises the `elemental <= 0` early return (setBonuses.ts:348-350):
    // with nothing in the elemental bucket, there is nothing to weight.
    const d: DamageContext = {
      profile: {
        characterKey: 'synthetic',
        source: 'test',
        hits: [
          {
            name: 'Physical Hit',
            kind: 'normal',
            scaling: 'atk',
            multiplier: 200,
            bonus: 'physical',
            reaction: 'none',
            weight: 1,
          },
        ],
      },
      enemy: DEFAULT_ENEMY,
      charLevel: 90,
    };
    expect(weightedHitKindShares(base, d)).toEqual({});
  });
});

describe('the Emblem ER floor', () => {
  const emblemBonus = (erFloor?: number) => {
    const d = dmg('raiden_shogun');
    const opts = {
      damage: d,
      base,
      ...(erFloor === undefined ? {} : { erFloor }),
    };
    return fourPieceVector('EmblemOfSeveredFate', opts)?.elemental_dmg ?? 0;
  };

  it('resolves against the caller-supplied floor rather than the profile', () => {
    expect(emblemBonus(250)).toBeGreaterThan(emblemBonus(100));
  });

  it('falls back to the profile requirement when no floor is given', () => {
    const er = DAMAGE_PROFILES.raiden_shogun.erRequirement ?? 100;
    expect(emblemBonus()).toBeCloseTo(emblemBonus(er), 10);
  });

  it("buildContext prefers the request's own ER floor", () => {
    const req = {
      characterKey: 'raiden_shogun',
      weaponKey: 'the_catch',
      buildLevel: 90 as const,
      objective: 'avg_damage' as const,
    };
    const low = buildContext({ ...req, constraints: {} });
    const high = buildContext({
      ...req,
      constraints: { minStats: { er_pct: 300 } },
    });
    expect(
      high.setBonuses.EmblemOfSeveredFate.four?.elemental_dmg ?? 0,
    ).toBeGreaterThan(
      low.setBonuses.EmblemOfSeveredFate.four?.elemental_dmg ?? 0,
    );
  });
});
