/**
 * Allocation's properties (TODO 7.5), on seeded random inventories and
 * members: v2 equals a brute force over every assignment on small cases;
 * every pass keeps every piece to one member, within what each spec allows
 * and its constraints, with v2 ≥ v1 ≥ greedy; and the move list, played
 * with the game's swaps, ends with every planned piece on its member.
 */
import { describe, it, expect } from 'vitest';
import {
  allocateGreedy,
  type AllocatedBuild,
  type AllocationMember,
  type RunOptimize,
} from './allocate';
import { allocateV1, buildValue } from './improve';
import { allocateV2 } from './exact';
import { planMoves, planShare } from './output';
import { searchBuilds } from '../optimizer/search';
import { buildContext } from '../optimizer/context';
import type {
  Artifact,
  OptimizeConstraints,
  Objective,
  Slot,
  StatKey,
} from '../game/types';
import { SLOTS } from '../game/types';

const run: RunOptimize = (req, inv, extras) =>
  Promise.resolve(searchBuilds(req, inv, buildContext(req, extras)));

/** A seeded PRNG, so a failure reproduces. */
function prng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}
type Rand = () => number;
const pick = <T>(rand: Rand, xs: readonly T[]) =>
  xs[Math.floor(rand() * xs.length)];

const CHARACTERS = [
  ['furina', 'splendor_of_tranquil_waters'],
  ['neuvillette', 'tome_of_the_eternal_flow'],
  ['nahida', 'a_thousand_floating_dreams'],
  ['raiden_shogun', 'engulfing_lightning'],
  ['xingqiu', 'sacrificial_sword'],
] as const;
const SETS = ['GladiatorsFinale', 'EmblemOfSeveredFate'];
const SUBS: StatKey[] = ['crit_rate', 'crit_dmg', 'em', 'er_pct', 'atk_pct'];
const MAIN: Record<Slot, StatKey[]> = {
  flower: ['hp'],
  plume: ['atk'],
  sands: ['atk_pct', 'er_pct'],
  goblet: ['atk_pct', 'em'],
  circlet: ['crit_rate', 'crit_dmg'],
};

let n = 0;
/** `perSlot` random pieces in each slot. */
function inventory(rand: Rand, perSlot: () => number): Artifact[] {
  return SLOTS.flatMap((slot) =>
    Array.from({ length: perSlot() }, () => {
      const mainStat = pick(rand, MAIN[slot]);
      return {
        id: `x${n++}`,
        setKey: pick(rand, SETS),
        slot,
        rarity: 5,
        level: 20,
        mainStat,
        mainStatValue: 30,
        subStats: SUBS.filter((k) => k !== mainStat && rand() < 0.6).map(
          (key) => ({ key, value: 1 + Math.floor(rand() * 15) }),
        ),
      };
    }),
  );
}

/** `count` distinct members with random objectives, constraints, weights
 *  and allowed pieces; now and then one that can't be planned. */
function members(
  rand: Rand,
  count: number,
  inv: readonly Artifact[],
  opts: { problems?: boolean } = {},
): AllocationMember[] {
  const chars = [...CHARACTERS].sort(() => rand() - 0.5).slice(0, count);
  return chars.map(([characterKey, weaponKey]) => {
    const constraints: OptimizeConstraints = {};
    const c = rand();
    if (c < 0.2)
      constraints.setRequirement = { kind: '2pc', setKey: pick(rand, SETS) };
    else if (c < 0.3)
      constraints.setRequirement = { kind: '4pc', setKey: pick(rand, SETS) };
    else if (c < 0.45) constraints.minStats = { er_pct: 115 };
    const objective: Objective = pick(rand, [
      'crit_value',
      'crit_value',
      'em',
      'atk_pct',
    ] as const);
    return {
      characterKey,
      request: {
        characterKey,
        weaponKey,
        buildLevel: 90,
        constraints,
        objective,
      },
      priority: Math.floor(rand() * 3),
      weight: pick(rand, [1, 1.5, 2, 0.7]),
      ...(rand() < 0.3 && {
        allowed: new Set(inv.filter(() => rand() < 0.8).map((a) => a.id)),
      }),
      ...(opts.problems && rand() < 0.1 && { problem: 'No weapon.' }),
    };
  });
}

const idsOf = (b: AllocatedBuild) =>
  b.result.status === 'ok'
    ? SLOTS.map(
        (s) =>
          (b.result as { builds: { artifactIds: Record<Slot, string> }[] })
            .builds[0].artifactIds[s],
      )
    : [];

/** The best plan's score over every assignment: each member any build of
 *  pieces they may use (or none), no piece twice. Independent of the
 *  optimizer: every build is enumerated and valued with `buildValue`. */
function bruteForce(ms: readonly AllocationMember[], inv: readonly Artifact[]) {
  const options = ms.map((m) => {
    if (m.problem) return { solo: null, builds: [] };
    const ctx = buildContext(m.request, m.extras);
    const pools = SLOTS.map((s) =>
      inv.filter((a) => a.slot === s && (!m.allowed || m.allowed.has(a.id))),
    );
    const builds: { ids: string[]; v: number }[] = [];
    const walk = (i: number, chosen: Artifact[]) => {
      if (i === SLOTS.length) {
        const v = buildValue(m, ctx, chosen);
        if (v !== null) builds.push({ ids: chosen.map((a) => a.id), v });
        return;
      }
      for (const a of pools[i]) walk(i + 1, [...chosen, a]);
    };
    walk(0, []);
    const best = Math.max(0, ...builds.map((b) => b.v));
    const solo = best > 0 ? best : null;
    return {
      solo,
      builds: solo
        ? builds.map((b) => ({ ids: b.ids, value: (m.weight * b.v) / solo }))
        : [],
    };
  });
  let best = 0;
  const used = new Set<string>();
  const walk = (i: number, value: number) => {
    if (i === ms.length) {
      best = Math.max(best, value);
      return;
    }
    walk(i + 1, value);
    for (const b of options[i].builds) {
      if (b.value <= 0 || b.ids.some((id) => used.has(id))) continue;
      for (const id of b.ids) used.add(id);
      walk(i + 1, value + b.value);
      for (const id of b.ids) used.delete(id);
    }
  };
  walk(0, 0);
  const weight =
    ms.reduce((s, m, i) => s + (options[i].solo ? m.weight : 0), 0) || 1;
  return {
    score: best / weight,
    solo: Object.fromEntries(
      ms.map((m, i) => [m.characterKey, options[i].solo]),
    ),
  };
}

/** No piece twice; each build within what the member may use and their
 *  constraints; nobody above their best alone. */
function expectValid(
  ms: readonly AllocationMember[],
  inv: readonly Artifact[],
  builds: readonly AllocatedBuild[],
  where: string,
  solo?: Record<string, number | null>,
) {
  const all = builds.flatMap(idsOf);
  expect(new Set(all).size, where).toBe(all.length);
  const byId = new Map(inv.map((a) => [a.id, a]));
  for (const b of builds) {
    const m = ms.find((x) => x.characterKey === b.characterKey)!;
    const ids = idsOf(b);
    if (!ids.length) continue;
    expect(m.problem, where).toBeUndefined();
    for (const id of ids)
      expect(!m.allowed || m.allowed.has(id), `${where}: ${id}`).toBe(true);
    const pieces = ids.map((id) => byId.get(id)!);
    expect(new Set(pieces.map((a) => a.slot)).size, where).toBe(5);
    expect(
      buildValue(m, buildContext(m.request, m.extras), pieces),
      where,
    ).not.toBeNull();
    if (solo) {
      const share = planShare(b, solo[b.characterKey]);
      if (share !== null) expect(share, where).toBeLessThanOrEqual(1 + 1e-9);
    }
  }
}

describe('allocation properties (TODO 7.5)', () => {
  it('v2 equals a brute force over every assignment on small cases (80 random cases)', async () => {
    const rand = prng(75);
    let improvedOverV1 = 0;
    for (let t = 0; t < 80; t++) {
      // Two members on three pieces a slot, three on two, or three on
      // three: the case where a third circlet on a core can matter.
      const [count, perSlot] = pick(rand, [
        [2, 3],
        [3, 2],
        [3, 3],
      ] as const);
      const inv = inventory(rand, () => perSlot);
      const ms = members(rand, count, inv);
      const oracle = bruteForce(ms, inv);
      const r = await allocateV2(ms, inv, run, { topM: 300 });
      const where = `case ${t}`;
      expect(r.solver.exact, where).toBe(true);
      // The solo bests behind the score agree with the enumeration.
      for (const m of ms) {
        const want = oracle.solo[m.characterKey];
        const got = r.solo[m.characterKey];
        if (want === null) expect(got, where).toBeNull();
        else expect(got, where).toBeCloseTo(want, 9);
      }
      expect(r.score.exact, where).toBeCloseTo(oracle.score, 9);
      expectValid(ms, inv, r.builds, where, r.solo);
      if (r.score.exact > r.score.improved + 1e-9) improvedOverV1++;
    }
    // The cases aren't all trivial: v2 beats v1 on some.
    expect(improvedOverV1).toBeGreaterThan(0);
  }, 120_000);

  it('every pass: no piece twice, every build allowed and valid, nobody above their best alone, v2 ≥ v1 ≥ greedy (30 random cases)', async () => {
    const rand = prng(7);
    for (let t = 0; t < 30; t++) {
      const inv = inventory(rand, () => 2 + Math.floor(rand() * 4));
      const ms = members(rand, 2 + Math.floor(rand() * 4), inv, {
        problems: true,
      });
      const where = `case ${t}`;
      const greedy = await allocateGreedy(ms, inv, run);
      expectValid(ms, inv, greedy.builds, `${where}, greedy`);
      const v2 = await allocateV2(ms, inv, run, { topM: 10 });
      expectValid(ms, inv, v2.builds, `${where}, v2`, v2.solo);
      const v1 = await allocateV1(ms, inv, run);
      expectValid(ms, inv, v1.builds, `${where}, v1`, v1.solo);
      expect(v1.score.improved).toBeCloseTo(v2.score.improved, 9);
      expect(v1.score.improved, where).toBeGreaterThanOrEqual(
        v1.score.greedy - 1e-9,
      );
      expect(v2.score.exact, where).toBeGreaterThanOrEqual(
        v2.score.improved - 1e-9,
      );
      // Every member comes back once, in picking order.
      expect(v2.builds.map((b) => b.characterKey).sort(), where).toEqual(
        ms.map((m) => m.characterKey).sort(),
      );
    }
  }, 120_000);

  it('the move list, played with the game’s swaps, puts every planned piece on its member (30 random cases)', async () => {
    const rand = prng(41);
    for (let t = 0; t < 30; t++) {
      const raw = inventory(rand, () => 2 + Math.floor(rand() * 3));
      // Pieces worn as the game allows: one a slot per character, by the
      // members and by others.
      const wearers = [...CHARACTERS.map(([k]) => k), 'bennett', 'xiangling'];
      const taken = new Set<string>();
      const inv = raw.map((a) => {
        const who = rand() < 0.7 ? pick(rand, wearers) : undefined;
        if (!who || taken.has(`${who}|${a.slot}`)) return a;
        taken.add(`${who}|${a.slot}`);
        return { ...a, location: who };
      });
      const ms = members(rand, 2 + Math.floor(rand() * 3), inv);
      const r = await allocateV2(ms, inv, run, { topM: 10 });
      const { moves, inPlace } = planMoves(r.builds, inv);
      const where = `case ${t}`;

      // The game: equipping a piece someone wears swaps it with the
      // equipper's piece in that slot; an unworn one sends theirs back.
      const wearer = new Map(inv.map((a) => [a.id, a.location ?? null]));
      const slotOf = new Map(inv.map((a) => [a.id, a.slot]));
      const wornBy = (who: string, slot: Slot) =>
        [...wearer].find(
          ([id, w]) => w === who && slotOf.get(id) === slot,
        )?.[0] ?? null;
      for (const mv of moves) {
        expect(wearer.get(mv.artifactId), where).toBe(mv.from);
        expect(mv.from, where).not.toBe(mv.characterKey);
        const own = wornBy(mv.characterKey, mv.slot);
        expect(own, where).toBe(mv.displaced);
        wearer.set(mv.artifactId, mv.characterKey);
        if (own) wearer.set(own, mv.from);
      }
      const planned = r.builds.flatMap((b) =>
        idsOf(b).map((id) => [id, b.characterKey] as const),
      );
      for (const [id, who] of planned)
        expect(wearer.get(id), `${where}: ${id}`).toBe(who);
      // One slot per character still.
      const pairs = [...wearer]
        .filter(([, w]) => w)
        .map(([id, w]) => `${w}|${slotOf.get(id)}`);
      expect(new Set(pairs).size, where).toBe(pairs.length);
      expect(moves.length + inPlace, where).toBe(planned.length);
    }
  }, 120_000);
});
