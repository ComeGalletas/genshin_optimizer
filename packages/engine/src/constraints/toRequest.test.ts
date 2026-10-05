import { describe, it, expect } from 'vitest';
import { normalizeGOOD } from '../good/normalize';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import { buildContext } from '../optimizer/context';
import { searchBuilds } from '../optimizer/search';
import { SLOTS, type Artifact, type BuildResult } from '../game/types';
import { parseConstraintSpec } from './spec';
import { specToRun, type SpecAccount } from './toRequest';

const good = normalizeGOOD(loadSampleGOOD())!;
const account: SpecAccount = {
  roster: good.roster,
  artifacts: good.artifacts!.map((e) => e.artifact),
};
const byId = new Map(account.artifacts.map((a) => [a.id, a]));
const piecesOf = (b: BuildResult): Artifact[] =>
  SLOTS.map((s) => byId.get(b.artifactIds[s])!);

/** Parse, map and search, the way the server will. */
function run(input: object, topK = 5) {
  const parsed = parseConstraintSpec(input);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const mapped = specToRun(parsed.spec, account, { topK });
  if (!mapped.ok) throw new Error(JSON.stringify(mapped.issues));
  const { request, extras, pool } = mapped.run;
  const ctx = buildContext(request, extras);
  const result = searchBuilds(request, pool, ctx);
  return {
    request,
    extras,
    pool,
    builds: result.status === 'ok' ? result.builds : [],
    status: result.status,
  };
}
const issuesOf = (input: object) => {
  const parsed = parseConstraintSpec(input);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const mapped = specToRun(parsed.spec, account);
  if (mapped.ok) throw new Error('expected issues');
  return mapped.issues;
};
const ids = (r: { builds: BuildResult[] }) =>
  r.builds.map((b) => SLOTS.map((s) => b.artifactIds[s]).join());
/** The free-form baseline the field tests change: no defaults, crit value. */
const FREE = { character: 'neuvillette', defaults: 'replace' } as const;

describe('specToRun: defaults', () => {
  it('extends the curated defaults: the Phase 3 question keeps the set and main stats', () => {
    const { request } = run({ character: 'furina', minStats: { er_pct: 180 } });
    expect(request).toMatchObject({
      characterKey: 'furina',
      weaponKey: 'favonius_sword', // equipped
      buildLevel: 90,
      objective: 'avg_damage',
      constraints: {
        setRequirement: { kind: '4pc', setKey: 'GoldenTroupe' },
        mainStatLocks: { sands: 'hp_pct', goblet: 'elemental_dmg' },
        minStats: { er_pct: 180 }, // over the default 130
      },
    });
  });

  it('"replace" starts from nothing, and the search changes with it', () => {
    const extended = run({ character: 'neuvillette' });
    const replaced = run(FREE);
    expect(replaced.request.constraints).toEqual({});
    expect(replaced.request.objective).toBe('crit_value');
    for (const b of extended.builds)
      expect(
        piecesOf(b).filter((a) => a.setKey === 'MarechausseeHunter').length,
      ).toBeGreaterThanOrEqual(4);
    expect(ids(replaced)[0]).not.toBe(ids(extended)[0]);
  });
});

describe('specToRun: each field changes the search as intended', () => {
  it('set: "any" clears the default; a rule of its own is enforced', () => {
    expect(
      run({ character: 'neuvillette', set: { kind: 'any' } }).request
        .constraints.setRequirement,
    ).toBeUndefined();
    const twoPc = run({
      ...FREE,
      set: { kind: '2pc', setKey: 'CrimsonWitchOfFlames' },
    });
    expect(twoPc.builds.length).toBeGreaterThan(0);
    for (const b of twoPc.builds)
      expect(
        piecesOf(b).filter((a) => a.setKey === 'CrimsonWitchOfFlames').length,
      ).toBeGreaterThanOrEqual(2);
    expect(ids(twoPc)[0]).not.toBe(ids(run(FREE))[0]);
  });

  it('mainStats: a lock is enforced, "any" clears one default and keeps the rest', () => {
    const em = run({ ...FREE, mainStats: { sands: 'em' } });
    for (const b of em.builds)
      expect(byId.get(b.artifactIds.sands)!.mainStat).toBe('em');
    expect(
      run({ character: 'neuvillette', mainStats: { sands: 'any' } }).request
        .constraints.mainStatLocks,
    ).toEqual({ goblet: 'elemental_dmg' });
  });

  it('minStats: merge with the default floors key by key, the spec winning', () => {
    expect(
      run({ character: 'neuvillette', minStats: { crit_rate: 50 } }).request
        .constraints.minStats,
    ).toEqual({ er_pct: 110, crit_rate: 50 });
    expect(
      run({ character: 'neuvillette', minStats: { er_pct: 100 } }).request
        .constraints.minStats,
    ).toEqual({ er_pct: 100 });
  });

  it('minStats: a floor the free optimum misses is met by every build', () => {
    const free = run(FREE);
    const er = free.builds[0].totals.er_pct ?? 0;
    const floored = run({ ...FREE, minStats: { er_pct: er + 1 } });
    expect(floored.builds.length).toBeGreaterThan(0);
    for (const b of floored.builds)
      expect(b.totals.er_pct ?? 0).toBeGreaterThanOrEqual(er + 1);
    expect(ids(floored)[0]).not.toBe(ids(free)[0]);
  });

  it('maxStats: a ceiling the free optimum breaks is respected by every build', () => {
    const free = run(FREE);
    const cr = free.builds[0].totals.crit_rate ?? 0;
    const capped = run({ ...FREE, maxStats: { crit_rate: cr - 1 } });
    expect(capped.request.constraints.maxStats).toEqual({ crit_rate: cr - 1 });
    expect(capped.builds.length).toBeGreaterThan(0);
    for (const b of capped.builds)
      expect(b.totals.crit_rate ?? 0).toBeLessThanOrEqual(cr - 1);
  });

  it('objective: a stat ranks by that stat', () => {
    const em = run({ ...FREE, objective: 'em' });
    expect(em.request.objective).toBe('em');
    const top = em.builds[0].totals.em ?? 0;
    expect(top).toBeGreaterThan(run(FREE).builds[0].totals.em ?? 0);
    for (const b of em.builds)
      expect(b.totals.em ?? 0).toBeLessThanOrEqual(top);
  });

  it('objective weights: a weighted sum, and 2:1 crit weights are crit value', () => {
    const w = run({
      ...FREE,
      objective: { weights: { crit_rate: 2, crit_dmg: 1, er_pct: 0 } },
    });
    expect(w.request.objective).toBe('weighted');
    expect(w.extras.weights).toEqual({ crit_rate: 2, crit_dmg: 1 });
    expect(ids(w)).toEqual(ids(run(FREE)));
    const hp = run({ ...FREE, objective: { weights: { hp_pct: 1 } } });
    expect(ids(hp)[0]).toBe(ids(run({ ...FREE, objective: 'hp_pct' }))[0]);
  });

  it('keepEquippedOn: nothing from those characters; "all" leaves only unequipped and own pieces', () => {
    const free = run(FREE);
    // Someone else whose piece the free optimum borrows.
    const owner = piecesOf(free.builds[0]).find(
      (a) => a.location && a.location !== 'neuvillette',
    )!.location!;
    const kept = run({ ...FREE, keepEquippedOn: [owner] });
    expect(kept.builds.length).toBeGreaterThan(0);
    for (const b of kept.builds)
      expect(piecesOf(b).some((a) => a.location === owner)).toBe(false);
    expect(ids(kept)[0]).not.toBe(ids(free)[0]);
    const all = run({ ...FREE, keepEquippedOn: 'all' });
    expect(
      all.pool.every((a) => !a.location || a.location === 'neuvillette'),
    ).toBe(true);
    expect(all.pool.length).toBeLessThan(account.artifacts.length);
    // Her own pieces always stay available.
    expect(all.pool.filter((a) => a.location === 'neuvillette')).toHaveLength(
      account.artifacts.filter((a) => a.location === 'neuvillette').length,
    );
  });

  it('excludeArtifacts: a named piece is never used; an unknown id is an issue', () => {
    const free = run(FREE);
    const circlet = free.builds[0].artifactIds.circlet;
    const without = run({ ...FREE, excludeArtifacts: [circlet] });
    for (const b of without.builds)
      expect(b.artifactIds.circlet).not.toBe(circlet);
    expect(issuesOf({ ...FREE, excludeArtifacts: ['m9-999'] })).toEqual([
      {
        path: 'excludeArtifacts.0',
        message: 'no artifact "m9-999" in the account',
      },
    ]);
  });

  it('teamBuffs: in the totals, so the objective rises and a floor can be met', () => {
    const free = run(FREE);
    const buffed = run({ ...FREE, teamBuffs: { crit_rate: 20 } });
    expect(ids(buffed)[0]).toBe(ids(free)[0]);
    expect(buffed.builds[0].objectiveValue).toBeCloseTo(
      free.builds[0].objectiveValue + 40,
      6,
    );
    const er = free.builds[0].totals.er_pct ?? 0;
    expect(run({ ...FREE, minStats: { er_pct: er + 500 } }).status).toBe(
      'infeasible',
    );
    expect(
      run({
        ...FREE,
        minStats: { er_pct: er + 500 },
        teamBuffs: { er_pct: 1000 },
      }).status,
    ).toBe('ok');
  });

  it('enemy: resistance in percent moves damage, not the ranking', () => {
    const usual = run({ character: 'neuvillette', set: { kind: 'any' } });
    const shred = run({
      character: 'neuvillette',
      set: { kind: 'any' },
      enemy: { res: -20 },
    });
    expect(shred.extras.enemy).toEqual({ res: -20 });
    expect(ids(shred)).toEqual(ids(usual));
    // -20% → ×1.1, against the default 10% → ×0.9. (Damage, not score: the
    // score's crit-ratio tiebreak doesn't scale with the enemy.)
    expect(
      shred.builds[0].objectiveValue / usual.builds[0].objectiveValue,
    ).toBeCloseTo(1.1 / 0.9, 9);
  });

  it('weapon and buildLevel: override the equipped weapon and level', () => {
    const r = run({
      ...FREE,
      weapon: 'favonius_codex',
      buildLevel: 80,
    });
    expect(r.request).toMatchObject({
      weaponKey: 'favonius_codex',
      buildLevel: 80,
    });
    const usual = run(FREE);
    expect(r.builds[0].totals.hp ?? 0).toBeLessThan(
      usual.builds[0].totals.hp ?? 0,
    );
  });

  it('topK comes from the caller', () => {
    expect(run(FREE, 2).builds).toHaveLength(2);
  });
});

describe('specToRun: what only the account can tell', () => {
  it('a character with no weapon to use', () => {
    expect(issuesOf({ character: 'diluc' })).toEqual([
      {
        path: 'weapon',
        message: "Diluc isn't in the account; name a weapon to build them with",
      },
    ]);
    // Naming one is enough.
    expect(
      specToRun(
        (
          parseConstraintSpec({
            character: 'diluc',
            weapon: "wolf's_gravestone",
          }) as {
            ok: true;
            spec: never;
          }
        ).spec,
        account,
      ).ok,
    ).toBe(true);
  });

  it('a default floor above the spec’s ceiling, said plainly', () => {
    expect(
      issuesOf({ character: 'bennett', maxStats: { er_pct: 150 } }),
    ).toEqual([
      {
        path: 'maxStats.er_pct',
        message:
          'Bennett\'s default minimum er_pct is 180, above your maximum 150; lower the minimum too, or use defaults "replace"',
      },
    ]);
  });
});
