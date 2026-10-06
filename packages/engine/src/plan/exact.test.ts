import { describe, it, expect } from 'vitest';
import { allocateV2, solvePacking, type Candidate } from './exact';
import { buildValue } from './improve';
import type { AllocatedBuild, AllocationMember, RunOptimize } from './allocate';
import { searchBuilds } from '../optimizer/search';
import { buildContext } from '../optimizer/context';
import type { Artifact, Slot, StatKey } from '../game/types';
import { SLOTS } from '../game/types';

/** A seeded PRNG, so a failure reproduces. */
function prng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

/** Every choice of at most one candidate per member, no id twice. */
function bruteForce(members: Candidate[][]): number {
  let best = 0;
  const walk = (i: number, used: Set<string>, value: number) => {
    if (i === members.length) {
      best = Math.max(best, value);
      return;
    }
    walk(i + 1, used, value);
    for (const c of members[i]) {
      if (c.ids.some((id) => used.has(id))) continue;
      walk(i + 1, new Set([...used, ...c.ids]), value + c.value);
    }
  };
  walk(0, new Set(), 0);
  return best;
}

describe('solvePacking (TODO 7.3)', () => {
  it('matches brute force on small cases (300 random instances)', () => {
    const rand = prng(3);
    for (let t = 0; t < 300; t++) {
      const universe = 6 + Math.floor(rand() * 10);
      const members: Candidate[][] = Array.from(
        { length: 1 + Math.floor(rand() * 5) },
        () =>
          Array.from({ length: Math.floor(rand() * 6) }, () => ({
            ids: [
              ...new Set(
                Array.from({ length: 1 + Math.floor(rand() * 3) }, () =>
                  String(Math.floor(rand() * universe)),
                ),
              ),
            ],
            value: Math.round(rand() * 100) / 100,
          })),
      );
      const sol = solvePacking(members);
      expect(sol.exact).toBe(true);
      expect(sol.value).toBeCloseTo(bruteForce(members), 9);
      // The choice is feasible and worth what it says.
      const used = new Set<string>();
      let value = 0;
      for (const [i, x] of sol.choice.entries()) {
        if (x < 0) continue;
        for (const id of members[i][x].ids) {
          expect(used.has(id), `instance ${t}`).toBe(false);
          used.add(id);
        }
        value += members[i][x].value;
      }
      expect(value).toBeCloseTo(sol.value, 9);
    }
  });

  it('prefers two that fit together over the single best that blocks them', () => {
    const sol = solvePacking([
      [{ ids: ['a', 'b'], value: 1 }],
      [
        { ids: ['a'], value: 0.7 },
        { ids: ['c'], value: 0.2 },
      ],
      [{ ids: ['b'], value: 0.7 }],
    ]);
    expect(sol).toMatchObject({ choice: [-1, 0, 0], exact: true });
    expect(sol.value).toBeCloseTo(1.4, 9);
  });

  it('stops at its node budget with a feasible plan, and says it isn’t proven', () => {
    const members = Array.from({ length: 8 }, (_, i) =>
      Array.from({ length: 8 }, (_, j) => ({
        ids: [`${(i + j) % 10}`, `${(i * j) % 10}x`],
        value: 1 + ((i * 7 + j * 3) % 5) / 10,
      })),
    );
    const sol = solvePacking(members, { maxNodes: 50 });
    expect(sol.exact).toBe(false);
    expect(sol.nodes).toBeGreaterThan(50);
    const ids = sol.choice.flatMap((x, i) => (x < 0 ? [] : members[i][x].ids));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---- allocation v2 over random inventories ---------------------------------

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
const ids = (b: AllocatedBuild) =>
  b.result.status === 'ok' ? Object.values(b.result.builds[0].artifactIds) : [];

describe('allocateV2 (TODO 7.3)', () => {
  it('never scores below v1, never reuses a piece, and keeps every build valid (25 random inventories)', async () => {
    const rand = prng(17);
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const STATS: StatKey[] = ['crit_rate', 'crit_dmg', 'em', 'er_pct'];
    for (let t = 0; t < 25; t++) {
      const inv: Artifact[] = SLOTS.flatMap((s) =>
        Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({
          id: `r${n++}`,
          setKey: pick(['GladiatorsFinale', 'EmblemOfSeveredFate']),
          slot: s,
          rarity: 5,
          level: 20,
          mainStat: MAIN[s],
          mainStatValue: 40,
          subStats: Array.from({ length: 3 }, () => ({
            key: pick(STATS),
            value: 1 + Math.floor(rand() * 20),
          })),
        })),
      );
      const members = [
        member('furina', 'splendor_of_tranquil_waters', 1),
        member('neuvillette', 'tome_of_the_eternal_flow', 2, {
          constraints:
            rand() < 0.5
              ? {
                  setRequirement: {
                    kind: '2pc',
                    setKey: 'EmblemOfSeveredFate',
                  },
                }
              : {},
        }),
        member('nahida', 'a_thousand_floating_dreams', 3, { objective: 'em' }),
      ];
      const r = await allocateV2(members, inv, run, { topM: 8 });
      expect(r.solver.exact, `inventory ${t}`).toBe(true);
      expect(r.score.exact).toBeGreaterThanOrEqual(r.score.improved - 1e-9);
      expect(r.score.improved).toBeGreaterThanOrEqual(r.score.greedy - 1e-9);
      const all = r.builds.flatMap(ids);
      expect(new Set(all).size, `inventory ${t}`).toBe(all.length);
      const byId = new Map(inv.map((a) => [a.id, a]));
      for (const b of r.builds) {
        if (b.result.status !== 'ok') continue;
        const m = members.find((x) => x.characterKey === b.characterKey)!;
        expect(
          buildValue(
            m,
            buildContext(m.request),
            ids(b).map((id) => byId.get(id)!),
          ),
        ).not.toBeNull();
      }
    }
  }, 120_000);
});
