import { describe, it, expect } from 'vitest';
import { normalizeGOOD } from '../good/normalize';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import { simCharacterFromAccount, type SimAccount } from './account';

const good = normalizeGOOD(loadSampleGOOD())!;
const account: SimAccount = {
  roster: good.roster,
  weapons: good.weapons,
  artifacts: (good.artifacts ?? []).map((e) => e.artifact),
};

describe('simCharacterFromAccount', () => {
  it('the character as the account has them: levels, constellation, talents, held weapon, worn artifacts', () => {
    const raiden = simCharacterFromAccount(account, 'raiden_shogun');
    const held = good.weapons.find((w) => w.location === 'raiden_shogun')!;
    expect(raiden).toEqual({
      key: 'raiden_shogun',
      level: good.roster.raiden_shogun.level,
      maxLevel: good.roster.raiden_shogun.buildLevel,
      constellation: good.roster.raiden_shogun.constellation,
      talents: good.roster.raiden_shogun.talents,
      weapon: {
        key: held.key,
        level: held.level,
        maxLevel: 90,
        refinement: held.refinement,
      },
      artifacts: account.artifacts.filter(
        (a) => a.location === 'raiden_shogun',
      ),
    });
    expect('artifacts' in raiden && raiden.artifacts.length).toBeGreaterThan(0);
  });

  it('says why a character can’t be simulated, rather than guessing', () => {
    expect(simCharacterFromAccount(account, 'yelan')).toEqual({
      problem: 'yelan is not in the account',
    });
    const noTalents: SimAccount = {
      ...account,
      roster: {
        ...account.roster,
        bennett: { ...account.roster.bennett, talents: undefined },
      },
    };
    expect(simCharacterFromAccount(noTalents, 'bennett')).toEqual({
      problem: "bennett's talent levels aren't in the import",
    });
    const unarmed: SimAccount = {
      roster: {
        bennett: { level: 90, talents: { auto: 1, skill: 1, burst: 1 } },
      },
      weapons: [],
      artifacts: [],
    };
    expect(simCharacterFromAccount(unarmed, 'bennett')).toEqual({
      problem: 'bennett holds no weapon in the import',
    });
  });

  it('caps from the ascension, or the lowest cap the level fits under', () => {
    const c = simCharacterFromAccount(
      {
        roster: {
          bennett: {
            level: 72,
            talents: { auto: 1, skill: 6, burst: 6 },
            weaponKey: 'favonius_sword',
          },
        },
        weapons: [
          {
            index: 0,
            key: 'favonius_sword',
            level: 50,
            ascension: 3,
            refinement: 3,
            location: 'bennett',
          },
        ],
        artifacts: [],
      },
      'bennett',
    );
    expect(c).toMatchObject({
      level: 72,
      maxLevel: 80,
      constellation: 0,
      weapon: { level: 50, maxLevel: 60, refinement: 3 },
    });
  });
});
