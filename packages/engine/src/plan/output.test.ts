import { describe, it, expect } from 'vitest';
import { describePiece, planFarming, planMoves, planShare } from './output';
import { allocateV1 } from './improve';
import type { AllocatedBuild, AllocationMember, RunOptimize } from './allocate';
import { searchBuilds } from '../optimizer/search';
import { buildContext } from '../optimizer/context';
import type { Artifact, Slot, StatKey } from '../game/types';
import { SLOTS } from '../game/types';

const MAIN: Record<Slot, StatKey> = {
  flower: 'hp',
  plume: 'atk',
  sands: 'atk_pct',
  goblet: 'atk_pct',
  circlet: 'atk_pct',
};
const art = (
  id: string,
  slot: Slot,
  location?: string,
  cv = 10,
  setKey = 'GladiatorsFinale',
): Artifact => ({
  id,
  setKey,
  slot,
  rarity: 5,
  level: 20,
  mainStat: MAIN[slot],
  mainStatValue: 40,
  subStats: [{ key: 'crit_dmg', value: cv }],
  ...(location && { location }),
});
/** A build of these ids, flower to circlet, as an allocation returns it. */
const built = (
  characterKey: string,
  ids: string[],
  score = 1,
): AllocatedBuild =>
  ({
    characterKey,
    objective: 'crit_value',
    conflicts: [],
    result: {
      status: 'ok',
      explored: 0,
      pruned: 0,
      builds: [
        {
          artifactIds: Object.fromEntries(SLOTS.map((s, i) => [s, ids[i]])),
          score,
        },
      ],
    },
  }) as unknown as AllocatedBuild;
const none = (characterKey: string): AllocatedBuild => ({
  characterKey,
  objective: 'crit_value',
  conflicts: [],
  result: { status: 'infeasible', explored: 0, pruned: 0 },
});

describe('planMoves (TODO 7.4)', () => {
  it('follows the game’s swaps: who wears each piece at that point, and a swap that saves a move', () => {
    const inv = [
      // Neuvillette's own plume, goblet and circlet stay.
      ...(['plume', 'goblet', 'circlet'] as Slot[]).map((s) =>
        art(`n-${s}`, s, 'neuvillette'),
      ),
      ...(['plume', 'goblet', 'circlet'] as Slot[]).map((s) =>
        art(`f-${s}`, s, 'furina'),
      ),
      art('free-flower', 'flower'),
      art('n-flower', 'flower', 'neuvillette'),
      art('f-flower', 'flower', 'furina'),
      art('f-sands', 'sands', 'furina'),
      art('n-sands', 'sands', 'neuvillette'),
    ];
    const { moves, inPlace } = planMoves(
      [
        built('neuvillette', [
          'free-flower',
          'n-plume',
          'f-sands',
          'n-goblet',
          'n-circlet',
        ]),
        built('furina', [
          'n-flower',
          'f-plume',
          'n-sands',
          'f-goblet',
          'f-circlet',
        ]),
      ],
      inv,
    );
    expect(
      moves.map((m) => [m.characterKey, m.artifactId, m.from, m.displaced]),
    ).toEqual([
      // Unequipped: Neuvillette's flower goes back to the inventory.
      ['neuvillette', 'free-flower', null, 'n-flower'],
      // Furina wears it: she takes Neuvillette's sands in the swap...
      ['neuvillette', 'f-sands', 'furina', 'n-sands'],
      // ...and the flower is in the inventory by now.
      ['furina', 'n-flower', null, 'f-flower'],
    ]);
    // ...so Furina's planned sands is already on her: 6 pieces in place
    // from the start, and that one.
    expect(inPlace).toBe(7);
    expect(moves[0].text).toBe(
      "Neuvillette: equip the Gladiator's Finale flower (HP, +20; CRIT DMG 10.0%), unequipped; Neuvillette's current flower goes back to the inventory.",
    );
    expect(moves[1].text).toMatch(
      /^Neuvillette: equip the .* sands .*, from Furina; Furina takes Neuvillette's current sands\.$/,
    );
  });

  it('has nothing to do when every piece is on its member, and skips members without a build', () => {
    const inv = SLOTS.map((s) => art(`x-${s}`, s, 'lisa'));
    const r = planMoves(
      [
        built(
          'lisa',
          SLOTS.map((s) => `x-${s}`),
        ),
        none('noelle'),
      ],
      inv,
    );
    expect(r).toEqual({ moves: [], inPlace: 5 });
  });

  it('describes a piece as the game shows it', () => {
    expect(
      describePiece({
        ...art('a', 'sands', undefined, 0, 'EmblemOfSeveredFate'),
        mainStat: 'er_pct',
        level: 16,
        subStats: [
          { key: 'crit_rate', value: 7 },
          { key: 'em', value: 23 },
        ],
      }),
    ).toBe(
      'Emblem of Severed Fate sands (Energy Recharge, +16; CRIT Rate 7.0%, Elemental Mastery 23)',
    );
  });
});

describe('planFarming (TODO 7.4)', () => {
  const lisa: AllocationMember = {
    characterKey: 'lisa',
    request: {
      characterKey: 'lisa',
      weaponKey: '',
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    },
    priority: 0,
    weight: 2,
  };
  const noelle: AllocationMember = {
    ...lisa,
    characterKey: 'noelle',
    request: { ...lisa.request, characterKey: 'noelle' },
    priority: 1,
    weight: 1,
  };
  const amber: AllocationMember = {
    ...noelle,
    characterKey: 'amber',
    request: {
      ...noelle.request,
      characterKey: 'amber',
      constraints: {
        setRequirement: { kind: '4pc', setKey: 'CrimsonWitchOfFlames' },
      },
    },
    priority: 2,
  };
  const good = SLOTS.map((s) => art(`g-${s}`, s));
  const poor = SLOTS.map((s) => art(`p-${s}`, s));
  const inv = [...good, ...poor];

  it('says who holds the pieces of a member’s best build, and why one has none', () => {
    const lines = planFarming(
      [
        lisa,
        noelle,
        amber,
        { ...amber, characterKey: 'amber2', problem: 'No weapon equipped.' },
      ],
      [
        built(
          'lisa',
          good.map((a) => a.id),
          100,
        ),
        built(
          'noelle',
          poor.map((a) => a.id),
          80,
        ),
        none('amber'),
        none('amber2'),
      ],
      inv,
      {
        solo: { lisa: 100, noelle: 100, amber: null, amber2: null },
        soloPieces: {
          lisa: good.map((a) => a.id),
          noelle: good.map((a) => a.id),
          amber: null,
          amber2: null,
        },
      },
    );
    expect(lines[0]).toBe(
      "Noelle: 80.0% of their best build alone; the plan gives that build's flower, plume, sands, goblet and circlet to Lisa.",
    );
    expect(lines.slice(1, 3)).toEqual([
      'Amber: no build meets their conditions even with every piece.',
      'Amber: You own 0 Crimson Witch of Flames pieces across slots they may use; their conditions need 4.',
    ]);
    // amber2 has no dataset name: its key stands in.
    expect(lines[3]).toMatch(/: No weapon equipped\.$/);
    expect(lines).toHaveLength(4);
  });

  it('asks to level a planned piece below its rarity’s top level', () => {
    const low = [
      { ...good[0], level: 16 },
      { ...good[1], rarity: 4, level: 16 },
      { ...good[2], rarity: 4, level: 12 },
      ...good.slice(3),
    ];
    expect(
      planFarming(
        [noelle],
        [
          built(
            'noelle',
            good.map((a) => a.id),
          ),
        ],
        low,
      ),
    ).toEqual([
      "Noelle: level the planned Gladiator's Finale flower from +16 to +20.",
      "Noelle: level the planned Gladiator's Finale sands from +12 to +16.",
    ]);
  });

  it('names who took a member’s pieces when the plan leaves them none, and says less without the solo bests', () => {
    const members = [lisa, noelle];
    const builds = [
      built(
        'lisa',
        good.map((a) => a.id),
      ),
      none('noelle'),
    ];
    expect(
      planFarming(members, builds, inv, {
        solo: { lisa: 1, noelle: 1 },
        soloPieces: {
          lisa: good.map((a) => a.id),
          noelle: [...good.slice(0, 2), ...poor.slice(2)].map((a) => a.id),
        },
      }),
    ).toEqual([
      "Noelle: no build left for them; the plan gives their best build's flower and plume to Lisa.",
    ]);
    expect(planFarming(members, builds, inv)).toEqual([
      'Noelle: no build meets their conditions from what the members ahead left.',
    ]);
  });

  it('adds the curated meta target’s gaps over the pieces left to each member', async () => {
    const run: RunOptimize = (req, i, extras) =>
      Promise.resolve(searchBuilds(req, i, buildContext(req, extras)));
    const furina: AllocationMember = {
      characterKey: 'furina',
      request: {
        characterKey: 'furina',
        weaponKey: 'splendor_of_tranquil_waters',
        buildLevel: 90,
        constraints: {},
        objective: 'crit_value',
      },
      priority: 0,
      weight: 1,
    };
    const r = await allocateV1([furina], inv, run);
    const lines = planFarming([furina], r.builds, inv, r);
    // Furina's meta wants 4-piece Golden Troupe and an HP% sands.
    expect(lines).toContain(
      'Furina: You own 0 Golden Troupe pieces across slots — need 4 for the meta set.',
    );
    expect(lines).toContain(
      'Furina: You own no HP% Sands — the meta build needs it.',
    );
    expect(planShare(r.builds[0], r.solo.furina)).toBeCloseTo(1, 9);
    expect(planShare(none('furina'), 1)).toBeNull();
  });
});
