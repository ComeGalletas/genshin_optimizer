import { describe, it, expect, vi } from 'vitest';
import {
  allocateGreedy,
  memberFromRun,
  pickingOrder,
  type AllocationMember,
  type RunOptimize,
} from './allocate';
import { searchBuilds } from '../optimizer/search';
import { buildContext } from '../optimizer/context';
import type { Artifact, Slot, StatKey } from '../game/types';
import { SLOTS } from '../game/types';
import { normalizeGOOD } from '../good/normalize';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import { parseConstraintSpec } from '../constraints/spec';
import { specToRun } from '../constraints/toRequest';

const run: RunOptimize = (req, inv, extras) =>
  Promise.resolve(searchBuilds(req, inv, buildContext(req, extras)));

let n = 0;
/** A piece whose crit value is `cv` (crit rate cv/2 … as crit damage). */
function art(slot: Slot, cv: number, setKey = 'GladiatorsFinale'): Artifact {
  const main: Record<Slot, StatKey> = {
    flower: 'hp',
    plume: 'atk',
    sands: 'atk_pct',
    goblet: 'atk_pct',
    circlet: 'atk_pct',
  };
  return {
    id: `p${n++}`,
    setKey,
    slot,
    rarity: 5,
    level: 20,
    mainStat: main[slot],
    mainStatValue: 40,
    subStats: [{ key: 'crit_dmg', value: cv }],
  };
}

/** Two pieces per slot: a good one (cv 30) and a poor one (cv 10). */
const INVENTORY = SLOTS.flatMap((s) => [art(s, 30), art(s, 10)]);
const good = new Set(
  INVENTORY.filter((a) => a.subStats[0].value === 30).map((a) => a.id),
);

const member = (
  characterKey: string,
  weaponKey: string,
  priority: number,
  over: Partial<AllocationMember> = {},
): AllocationMember => ({
  characterKey,
  request: {
    characterKey,
    weaponKey,
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
  },
  priority,
  weight: 1,
  ...over,
});

describe('allocateGreedy (TODO 7.1)', () => {
  it('lets the first in priority take the best pieces; nobody gets a piece twice', async () => {
    const { builds, taken } = await allocateGreedy(
      [
        member('furina', 'splendor_of_tranquil_waters', 2),
        member('neuvillette', 'tome_of_the_eternal_flow', 1),
      ],
      INVENTORY,
      run,
    );
    // Picking order: Neuvillette (priority 1) first.
    expect(builds.map((b) => b.characterKey)).toEqual([
      'neuvillette',
      'furina',
    ]);
    const ids = (b: (typeof builds)[number]) =>
      b.result.status === 'ok'
        ? Object.values(b.result.builds[0].artifactIds)
        : [];
    expect(ids(builds[0]).every((id) => good.has(id))).toBe(true);
    expect(ids(builds[1]).every((id) => !good.has(id))).toBe(true);
    const all = builds.flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
    expect(taken.map((a) => a.id).sort()).toEqual([...all].sort());
  });

  it('keeps each member to the pieces their spec allows', async () => {
    const poor = new Set(
      INVENTORY.filter((a) => !good.has(a.id)).map((a) => a.id),
    );
    const { builds } = await allocateGreedy(
      [member('furina', 'splendor_of_tranquil_waters', 1, { allowed: poor })],
      INVENTORY,
      run,
    );
    const b = builds[0].result;
    expect(b.status).toBe('ok');
    if (b.status === 'ok')
      expect(
        Object.values(b.builds[0].artifactIds).every((id) => poor.has(id)),
      ).toBe(true);
  });

  it('records a member it can’t plan without searching, and reports progress', async () => {
    const spy = vi.fn(run);
    const progress: [number, number][] = [];
    const { builds } = await allocateGreedy(
      [
        member('furina', '', 1, { problem: 'No weapon equipped.' }),
        member('neuvillette', 'tome_of_the_eternal_flow', 2),
      ],
      INVENTORY,
      spy,
      { onProgress: (d, t) => progress.push([d, t]) },
    );
    expect(builds[0]).toMatchObject({
      characterKey: 'furina',
      problem: 'No weapon equipped.',
      result: { status: 'infeasible' },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('notes the pieces of a wanted set an earlier member took, and passes the extras', async () => {
    const spy = vi.fn(run);
    const wantsGlad = member('furina', 'splendor_of_tranquil_waters', 2, {
      request: {
        ...member('furina', 'splendor_of_tranquil_waters', 2).request,
        constraints: {
          setRequirement: { kind: '2pc', setKey: 'GladiatorsFinale' },
        },
      },
      extras: { buffs: { atk: 1000 } },
    });
    const { builds } = await allocateGreedy(
      [member('neuvillette', 'tome_of_the_eternal_flow', 1), wantsGlad],
      INVENTORY,
      spy,
    );
    expect(builds[1].conflicts).toHaveLength(5);
    expect(builds[1].conflicts[0]).toMatch(
      /^A GladiatorsFinale \w+ went to an earlier member of the plan\.$/,
    );
    expect(spy.mock.calls[1][2]).toEqual({ buffs: { atk: 1000 } });
  });

  it('orders by priority, then by the members’ own order', () => {
    expect(
      pickingOrder([
        member('a', 'w', 2),
        member('b', 'w', 1),
        member('c', 'w', 2),
        member('d', 'w', 1),
      ]).map((m) => m.characterKey),
    ).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('memberFromRun', () => {
  const g = normalizeGOOD(loadSampleGOOD())!;
  const account = {
    roster: g.roster,
    weapons: g.weapons,
    artifacts: (g.artifacts ?? []).map((e) => e.artifact),
  };
  const spec = (x: unknown) => {
    const p = parseConstraintSpec(x);
    if (!p.ok) throw new Error(JSON.stringify(p.issues));
    return p.spec;
  };
  // As the server builds a member: the spec mapped onto the account, as a
  // single search maps it, then the member from that run.
  const memberFromSpec = (
    s: ReturnType<typeof spec>,
    acc: typeof account,
    opts: { priority: number; weight?: number },
  ) => {
    const mapped = specToRun(s, acc, { topK: 1 });
    return mapped.ok
      ? { ok: true as const, member: memberFromRun(mapped.run, opts) }
      : mapped;
  };

  it('maps a spec the way a single search does: request, extras, allowed pieces', () => {
    const r = memberFromSpec(
      spec({
        character: 'furina',
        defaults: 'replace',
        objective: { weights: { hp_pct: 1, crit_rate: 2 } },
        keepEquippedOn: ['neuvillette'],
        teamBuffs: { atk: 500 },
      }),
      account,
      { priority: 3, weight: 2 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = r.member;
    expect(m).toMatchObject({
      characterKey: 'furina',
      priority: 3,
      weight: 2,
      request: { objective: 'weighted', topK: 1 },
      extras: { buffs: { atk: 500 }, weights: { hp_pct: 1, crit_rate: 2 } },
    });
    const neuvillettes = account.artifacts.filter(
      (a) => a.location === 'neuvillette',
    );
    expect(neuvillettes.length).toBeGreaterThan(0);
    for (const a of neuvillettes) expect(m.allowed!.has(a.id)).toBe(false);
  });

  it('says what is wrong with a spec, and weighs by role unless told (ADR-0048)', () => {
    const bad = memberFromSpec(
      spec({ character: 'furina', excludeArtifacts: ['nope'] }),
      account,
      { priority: 1 },
    );
    expect(bad).toEqual({
      ok: false,
      issues: [
        {
          path: 'excludeArtifacts.0',
          message: 'no artifact "nope" in the account',
        },
      ],
    });
    // Furina is a buffer in the curated archetypes; Neuvillette a carry.
    const furina = memberFromSpec(spec({ character: 'furina' }), account, {
      priority: 1,
    });
    expect(furina.ok && furina.member.weight).toBe(1);
    const neuv = memberFromSpec(spec({ character: 'neuvillette' }), account, {
      priority: 1,
    });
    expect(neuv.ok && neuv.member.weight).toBe(2);
  });
});
