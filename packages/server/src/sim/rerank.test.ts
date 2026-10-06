import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import { loadSampleGOOD } from '@genshin-build-lab/engine/test-fixtures/sampleAccount';
import type { SimAccount } from '@genshin-build-lab/engine/sim/account';
import type { SimCharacter } from '@genshin-build-lab/engine/sim/configgen';
import { sampleAccountServices } from '../llm/evaluate';
import { Services, ServiceError } from '../api/services';
import { GcsimError, gcsimPath, loadGcsimTool } from './gcsim';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { weaponSupport } from '@genshin-build-lab/engine/sim/support';

/** A weapon gcsim has, of the character's type. */
const GCSIM_TABLE_SWORD_OR_ANY = (character: string) =>
  genshinAdapter
    .weapons()
    .find(
      (w) =>
        w.type === genshinAdapter.character(character)!.weaponType &&
        w.rarity === 5 &&
        weaponSupport(w.key) === 'supported',
    )!.key;
import { installedRotationDeps, type RotationDeps } from './drafts';
import { readResult, type SimResult } from './result';
import { ROTATIONS_DIR } from './rotations';
import { candidate, resolveSimTeam } from './rerank';

const REAL: SimResult = readResult(
  JSON.parse(
    readFileSync(
      new URL('./__fixtures__/raiden-national-30.json', import.meta.url),
      'utf8',
    ),
  ),
);

const good = normalizeGOOD(loadSampleGOOD())!;
const ACCOUNT: SimAccount = {
  roster: good.roster,
  weapons: good.weapons,
  artifacts: (good.artifacts ?? []).map((e) => e.artifact),
};

describe('resolveSimTeam', () => {
  it('the named rotation, with the account’s teammates in its other slots', () => {
    const r = resolveSimTeam(
      'raiden_shogun',
      'raiden-national-xingqiu',
      ACCOUNT,
      ROTATIONS_DIR,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.team.slot).toBe('raiden');
    expect(
      Object.fromEntries(
        Object.entries(r.team.teammates).map(([s, c]) => [s, c.key]),
      ),
    ).toEqual({
      xiangling: 'xiangling',
      xingqiu: 'xingqiu',
      bennett: 'bennett',
    });
  });

  it('says what stops it, where a model can fix it', () => {
    const issue = (character: string, rotation?: string) => {
      const r = resolveSimTeam(character, rotation, ACCOUNT, ROTATIONS_DIR);
      return r.ok ? null : r.issues;
    };
    // Raiden is in several validated rotations: one must be chosen.
    expect(issue('raiden_shogun')).toEqual([
      {
        path: 'sim.rotation',
        message: expect.stringMatching(
          /^several rotations have Raiden Shogun \(.*raiden-national, raiden-national-xingqiu.*\): choose one in sim\.rotation$/,
        ),
      },
    ]);
    expect(issue('raiden_shogun', 'raiden-national')).toEqual([
      {
        path: 'sim.rotation',
        message: 'Raiden National needs Yelan: yelan is not in the account',
      },
    ]);
    expect(issue('raiden_shogun', 'ayaka-freeze')).toEqual([
      {
        path: 'sim.rotation',
        message: 'Ayaka Freeze has no slot for Raiden Shogun',
      },
    ]);
    expect(issue('raiden_shogun', 'nope')?.[0].message).toMatch(
      /^no rotation "nope" in the library \(ayaka-freeze, /,
    );
    expect(issue('neuvillette')?.[0].message).toBe(
      'no rotation in the library has Neuvillette: draft one (draft_rotation), or choose another objective',
    );
  });
});

describe('candidate', () => {
  const base: SimCharacter = {
    key: 'raiden_shogun',
    level: 90,
    maxLevel: 90,
    constellation: 2,
    talents: { auto: 9, skill: 9, burst: 10 },
    weapon: { key: 'the_catch', level: 80, maxLevel: 80, refinement: 5 },
    artifacts: [],
  };
  const req = (weaponKey: string, refinement?: number) =>
    ({
      characterKey: 'raiden_shogun',
      weaponKey,
      buildLevel: 90,
      constraints: {},
      objective: 'avg_damage',
      ...(refinement && { refinement }),
    }) as const;

  it('the held weapon as it is; another one at 90/90, R1 unless given', () => {
    expect(candidate(base, req('the_catch'), []).weapon).toEqual(base.weapon);
    expect(candidate(base, req('engulfing_lightning'), []).weapon).toEqual({
      key: 'engulfing_lightning',
      level: 90,
      maxLevel: 90,
      refinement: 1,
    });
    expect(
      candidate(base, req('engulfing_lightning', 3), []).weapon.refinement,
    ).toBe(3);
    expect(candidate(base, req('the_catch'), []).constellation).toBe(2);
  });
});

/** A runner whose DPS depends only on the config (so a build's rank isn't
 *  its stat rank), recording the configs. */
function fakeDeps(incomplete: string[] = []) {
  const configs: string[] = [];
  const result = (config: string): SimResult => {
    configs.push(config);
    const h = createHash('sha256').update(config).digest();
    return {
      ...REAL,
      iterations: 500,
      incomplete,
      dps: { ...REAL.dps, mean: 40_000 + h.readUInt16BE(0), sd: 2_000 },
    };
  };
  const deps: RotationDeps = {
    gcsim: 'v2.48.8',
    commit: 'c'.repeat(40),
    runner: {
      run: async (config) => result(config),
      runWithSample: async (config) => ({ result: result(config), sample: {} }),
    },
  };
  return { deps, configs };
}

// The sample account has 20 artifacts: Raiden's curated set and main
// stats leave one build, so these drop them for a field to rank.
const SPEC = {
  character: 'raiden_shogun',
  defaults: 'replace',
  objective: 'sim',
  sim: { rotation: 'raiden-national-xingqiu', topK: 5 },
};

describe('objective "sim" (TODO 5.8)', () => {
  it('simulates the search’s top builds in the rotation and ranks them by team DPS', async () => {
    const sample = sampleAccountServices();
    const { deps, configs } = fakeDeps();
    const services = new Services(sample.db, undefined, { deps });
    const r = await services.runSpec(SPEC);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok' || !('sim' in r)) throw new Error('not simulated');
    expect(r.understood).toMatch(
      /^I understood: rank Raiden Shogun's top 5 builds \(.*\) by .* by simulated team DPS in Raiden National \(Xingqiu\) with Xiangling, Xingqiu, Bennett \(500 iterations each\)/,
    );
    expect(r.sim).toMatchObject({
      rotation: { id: 'raiden-national-xingqiu', status: 'validated' },
      iterations: 500,
      burstWaits: 'filled with attacks',
    });
    const n = r.builds.length;
    expect(n).toBeGreaterThan(1);
    expect(configs).toHaveLength(n);
    // Ranked by mean, every stat rank present once, intervals around means.
    const means = r.builds.map((b) => b.teamDps.mean);
    expect(means).toEqual([...means].sort((a, b) => b - a));
    expect(r.builds.map((b) => b.rank)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    );
    expect(r.builds.map((b) => b.statRank).sort((a, b) => a - b)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    );
    for (const b of r.builds) {
      expect(b.teamDps.ci95[0]).toBeLessThan(b.teamDps.mean);
      expect(b.teamDps.ci95[1]).toBeGreaterThan(b.teamDps.mean);
    }
    // Each candidate wore its own five pieces, the teammates theirs; waits
    // filled; the spec's teammates kept their gear.
    expect(configs[0]).toContain(
      'while !.raidenshogun.burst.ready { raidenshogun attack; }',
    );
    expect(r.spec.keepEquippedOn).toEqual(['xiangling', 'xingqiu', 'bennett']);
    // Asked again: every run comes from the cache.
    const again = await services.runSpec(SPEC);
    expect('sim' in again && again.sim.cachedRuns).toBe(n);
    expect(configs).toHaveLength(n);
    await services.searches.close();
    await sample.searches.close();
  });

  it('a character the run finds gcsim knows only partly: the stat order, labelled (5.9)', async () => {
    const sample = sampleAccountServices();
    const services = new Services(sample.db, undefined, {
      deps: fakeDeps(['raidenshogun']).deps,
    });
    const r = await services.runSpec(SPEC);
    expect(r).toMatchObject({
      status: 'ok',
      notSimulated: ['gcsim v2.48.8 implements raidenshogun only partly'],
    });
    expect('sim' in r).toBe(false);
    await services.searches.close();
    await sample.searches.close();
  });

  it('gcsim refusing the team at run time: the stat order, with its message', async () => {
    const sample = sampleAccountServices();
    const { deps } = fakeDeps();
    deps.runner.run = () =>
      Promise.reject(new GcsimError('gcsim failed: invalid set foo'));
    const services = new Services(sample.db, undefined, { deps });
    const r = await services.runSpec(SPEC);
    expect(r).toMatchObject({
      status: 'ok',
      notSimulated: ['gcsim refused the team: gcsim failed: invalid set foo'],
    });
    await services.searches.close();
    await sample.searches.close();
  });

  it('what the pinned gcsim lacks runs as the stat search, labelled, without gcsim at all (5.9)', async () => {
    const sample = sampleAccountServices();
    const services = new Services(sample.db, undefined, {});
    // Sandrone: not in gcsim v2.48.8 (nor in this account, so a weapon).
    const sandrone = await services.runSpec({
      character: 'sandrone',
      weapon: GCSIM_TABLE_SWORD_OR_ANY('sandrone'),
      defaults: 'replace',
      objective: 'sim',
    });
    expect(sandrone).toMatchObject({
      status: 'ok',
      notSimulated: ["gcsim v2.48.8 doesn't implement Sandrone"],
      understood: expect.stringMatching(
        /^I understood: rank Sandrone's top 20 builds \(.*\) by .*, not simulated \(gcsim v2\.48\.8 doesn't implement Sandrone\)/,
      ),
    });
    expect('builds' in sandrone && sandrone.builds.length).toBeGreaterThan(0);
    // A weapon gcsim lacks: Bennett with Prized Isshin Blade.
    const isshin = await services.runSpec({
      character: 'bennett',
      weapon: 'prized_isshin_blade',
      defaults: 'replace',
      objective: 'sim',
      sim: { rotation: 'raiden-national-xingqiu' },
    });
    expect(isshin).toMatchObject({
      status: 'ok',
      notSimulated: ["gcsim v2.48.8 doesn't have Prized Isshin Blade"],
    });
    await services.searches.close();
    await sample.searches.close();
  });

  it('needs gcsim, a rotation, and sim options only with "sim"', async () => {
    const sample = sampleAccountServices();
    const without = new Services(sample.db, undefined, {});
    await expect(without.runSpec(SPEC)).rejects.toMatchObject({
      status: 503,
      code: 'gcsim_unavailable',
    });
    await expect(
      without.runSpec({ character: 'neuvillette', objective: 'sim' }),
    ).rejects.toMatchObject({
      status: 400,
      issues: [{ path: 'sim.rotation', message: expect.any(String) }],
    });
    await expect(
      without.runSpec({ character: 'raiden_shogun', sim: { topK: 3 } }),
    ).rejects.toMatchObject({
      issues: [
        {
          path: 'sim',
          message:
            'sim options apply only with objective "sim"; add it, or leave sim out',
        },
      ],
    });
    expect(ServiceError).toBeDefined();
    await without.searches.close();
    await sample.searches.close();
  });
});

const installed = (() => {
  try {
    return existsSync(gcsimPath(loadGcsimTool()));
  } catch {
    return false;
  }
})();

describe.skipIf(!installed)('objective "sim" over the installed gcsim', () => {
  it('ranks the sample account’s Raiden builds in the classic National, K=20 at 500 iterations, well under 2 minutes', async () => {
    const sample = sampleAccountServices();
    const services = new Services(sample.db, undefined, {
      deps: installedRotationDeps(),
    });
    const t0 = performance.now();
    const r = await services.runSpec({
      character: 'raiden_shogun',
      defaults: 'replace',
      objective: 'sim',
      sim: { rotation: 'raiden-national-xingqiu' },
    });
    const seconds = (performance.now() - t0) / 1000;
    expect(r.status).toBe('ok');
    if (r.status !== 'ok' || !('sim' in r)) throw new Error('not simulated');
    expect(r.builds).toHaveLength(20);
    expect(r.builds.every((b) => b.teamDps.mean > 0)).toBe(true);
    expect(seconds).toBeLessThan(120);
    await services.searches.close();
    await sample.searches.close();
  }, 180_000);
});
