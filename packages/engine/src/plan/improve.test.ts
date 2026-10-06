import { describe, it, expect } from 'vitest';
import { allocateV1, buildValue } from './improve';
import type { AllocatedBuild, AllocationMember, RunOptimize } from './allocate';
import { searchBuilds } from '../optimizer/search';
import { buildContext } from '../optimizer/context';
import type { Artifact, Slot, StatKey } from '../game/types';
import { SLOTS } from '../game/types';

const run: RunOptimize = (req, inv, extras) =>
  Promise.resolve(searchBuilds(req, inv, buildContext(req, extras)));

let n = 0;
const MAIN: Record<Slot, StatKey> = {
  flower: 'hp',
  plume: 'atk',
  sands: 'atk_pct',
  goblet: 'atk_pct',
  circlet: 'atk_pct',
};
function piece(
  slot: Slot,
  subs: Partial<Record<StatKey, number>>,
  setKey = 'GladiatorsFinale',
): Artifact {
  return {
    id: `q${n++}`,
    setKey,
    slot,
    rarity: 5,
    level: 20,
    mainStat: MAIN[slot],
    mainStatValue: 40,
    subStats: Object.entries(subs).map(([key, value]) => ({
      key: key as StatKey,
      value: value!,
    })),
  };
}

const member = (
  characterKey: string,
  weaponKey: string,
  priority: number,
  over: Partial<AllocationMember['request']> = {},
): AllocationMember => ({
  characterKey,
  request: {
    characterKey,
    weaponKey,
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
    ...over,
  },
  priority,
  weight: 1,
});

const FURINA = () => member('furina', 'splendor_of_tranquil_waters', 1);

/** Every slot but `except` twice, equal for everyone. */
const filler = (except: Slot) =>
  SLOTS.filter((s) => s !== except).flatMap((s) => [
    piece(s, { crit_dmg: 20 }),
    piece(s, { crit_dmg: 20 }),
  ]);

const ids = (b: AllocatedBuild) =>
  b.result.status === 'ok' ? Object.values(b.result.builds[0].artifactIds) : [];

describe('allocateV1 (TODO 7.2)', () => {
  it('gives way: the piece one needs for a floor goes to them, the other takes the next best', async () => {
    // Furina picks first and takes the ER sands for 1 point of crit value;
    // Neuvillette needs 120% ER, and only that sands gives it.
    const erSands = piece('sands', { crit_dmg: 30, er_pct: 20 });
    const plainSands = piece('sands', { crit_dmg: 29 });
    const neuv = member('neuvillette', 'tome_of_the_eternal_flow', 2, {
      constraints: { minStats: { er_pct: 120 } },
    });
    const r = await allocateV1(
      [FURINA(), neuv],
      [...filler('sands'), erSands, plainSands],
      run,
    );
    expect(r.score.greedy).toBeLessThan(0.6); // Neuvillette had nothing
    expect(r.score.improved).toBeGreaterThan(0.95);
    expect(r.moves.pair).toBeGreaterThan(0);
    const [furina, neuvillette] = r.builds;
    expect(ids(neuvillette)).toContain(erSands.id);
    expect(ids(furina)).toContain(plainSands.id);
  });

  it('swaps a piece to whom it is worth more', async () => {
    // A flower worth 1 crit value more to Furina, and 100 EM to Nahida.
    const emFlower = piece('flower', { crit_dmg: 21, em: 100 });
    const plainFlower = piece('flower', { crit_dmg: 20 });
    const nahida = member('nahida', 'a_thousand_floating_dreams', 2, {
      objective: 'em',
    });
    const inv = [...filler('flower'), emFlower, plainFlower];
    const r = await allocateV1([FURINA(), nahida], inv, run);
    expect(r.score.improved).toBeGreaterThan(r.score.greedy);
    expect(r.moves.swap + r.moves.pair + r.moves.reoptimise).toBeGreaterThan(0);
    expect(ids(r.builds[1])).toContain(emFlower.id);
  });

  it('never reuses a piece, keeps every build within its constraints, and never scores below greedy (40 random inventories)', async () => {
    let seed = 11;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const STATS: StatKey[] = [
      'crit_rate',
      'crit_dmg',
      'em',
      'er_pct',
      'atk_pct',
    ];
    for (let t = 0; t < 40; t++) {
      const inv = SLOTS.flatMap((s) =>
        Array.from({ length: 2 + Math.floor(rand() * 3) }, () =>
          piece(
            s,
            Object.fromEntries(
              Array.from({ length: 3 }, () => [
                pick(STATS),
                1 + Math.floor(rand() * 20),
              ]),
            ),
            pick(['GladiatorsFinale', 'EmblemOfSeveredFate']),
          ),
        ),
      );
      const members = [
        FURINA(),
        member('neuvillette', 'tome_of_the_eternal_flow', 2, {
          constraints: rand() < 0.5 ? { minStats: { er_pct: 110 } } : {},
        }),
        member('nahida', 'a_thousand_floating_dreams', 3, { objective: 'em' }),
      ];
      const r = await allocateV1(members, inv, run);
      const all = r.builds.flatMap(ids);
      expect(new Set(all).size, `inventory ${t}`).toBe(all.length);
      expect(r.score.improved).toBeGreaterThanOrEqual(r.score.greedy - 1e-9);
      const byId = new Map(inv.map((a) => [a.id, a]));
      for (const [i, b] of r.builds.entries()) {
        if (b.result.status !== 'ok') continue;
        const m = members.find((x) => x.characterKey === b.characterKey)!;
        const pieces = ids(b).map((id) => byId.get(id)!);
        expect(
          buildValue(m, buildContext(m.request), pieces),
          `inventory ${t}, build ${i}`,
        ).not.toBeNull();
        // Nobody beats their own solo best: the search behind it is exact,
        // and the moves rank builds the way it does.
        expect(b.result.builds[0].score).toBeLessThanOrEqual(
          r.solo[b.characterKey]! + 1e-9,
        );
      }
    }
  }, 60_000);

  it('leaves out of the score a member no build fits even alone, and one it can’t plan', async () => {
    const impossible = member('neuvillette', 'tome_of_the_eternal_flow', 2, {
      constraints: { minStats: { er_pct: 500 } },
    });
    const unarmed = { ...member('nahida', '', 3), problem: 'No weapon.' };
    const r = await allocateV1(
      [FURINA(), impossible, unarmed],
      filler('sands').concat([piece('sands', { crit_dmg: 1 })]),
      run,
    );
    expect(r.solo).toEqual({
      furina: expect.any(Number),
      neuvillette: null,
      nahida: null,
    });
    // Furina has her own best: the plan scores 1.
    expect(r.score.improved).toBeCloseTo(1, 9);
    expect(r.builds.map((b) => b.result.status)).toEqual([
      'ok',
      'infeasible',
      'infeasible',
    ]);
  });
});
