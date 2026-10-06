import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import { loadSampleGOOD } from '@genshin-build-lab/engine/test-fixtures/sampleAccount';
import type { SimAccount } from '@genshin-build-lab/engine/sim/account';
import type { TeamSimSpec } from '@genshin-build-lab/engine/sim/team';
import { sampleAccountServices } from '../llm/evaluate';
import { Services } from '../api/services';
import { gcsimPath, loadGcsimTool } from './gcsim';
import { installedRotationDeps } from './drafts';
import { readResult, type SimResult } from './result';
import { ROTATIONS_DIR } from './rotations';
import { simulateTeam, TeamSimError, type TeamSimDeps } from './teamsim';

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

/** A pool whose DPS depends only on the config; records the configs. */
function fakeDeps(over: Partial<TeamSimDeps> = {}) {
  const configs: string[] = [];
  const deps: TeamSimDeps = {
    account: ACCOUNT,
    dir: ROTATIONS_DIR,
    gcsim: 'v2.48.8',
    pool: {
      async run(config) {
        configs.push(config);
        const h = createHash('sha256').update(config).digest();
        return {
          key: 'k',
          ms: 1,
          cached: false,
          result: {
            ...REAL,
            iterations: 1000,
            dps: { ...REAL.dps, mean: 50_000 + h.readUInt16BE(0), sd: 3_000 },
          },
        };
      },
    },
    bestBuild: async () => ({ problem: 'not in this test' }),
    ...over,
  };
  return { deps, configs };
}

const BASE: TeamSimSpec = { rotation: 'raiden-national-xingqiu' };

describe('simulateTeam (TODO 6.1)', () => {
  it('the base: each slot from the account as equipped, in the rotation', async () => {
    const { deps, configs } = fakeDeps();
    const r = await simulateTeam(BASE, deps);
    expect(r).toMatchObject({
      iterations: 1000,
      burstWaits: 'filled with attacks',
    });
    const [base] = r.runs;
    expect(base.team!.map((t) => t.character)).toEqual([
      'raiden_shogun',
      'xiangling',
      'xingqiu',
      'bennett',
    ]);
    expect(base.team![0].weapon).toBe(
      good.weapons.find((w) => w.location === 'raiden_shogun')!.key,
    );
    expect(base.vsBase).toBeUndefined();
    expect(base.characters!.map((c) => c.character)).toEqual([
      'raiden_shogun',
      'xiangling',
      'xingqiu',
      'bennett',
    ]);
    expect(configs[0]).toContain('while !.raidenshogun.burst.ready');
  });

  it('variants change a weapon, the enemy, the rotation or a build, each compared with the base', async () => {
    const pieces = ACCOUNT.artifacts
      .filter((a) => a.location === 'raiden_shogun')
      .map((a) => a.id);
    const { deps, configs } = fakeDeps({
      bestBuild: async (character, weapon, conditions, keepOn) => {
        expect({ character, weapon, conditions, keepOn }).toEqual({
          character: 'bennett',
          weapon: good.weapons.find((w) => w.location === 'bennett')!.key,
          conditions: { set: { kind: '4pc', setKey: 'NoblesseOblige' } },
          keepOn: ['raiden_shogun', 'xiangling', 'xingqiu'],
        });
        return ACCOUNT.artifacts.filter((a) => pieces.includes(a.id));
      },
    });
    const r = await simulateTeam(
      {
        ...BASE,
        variants: [
          {
            label: 'The Catch R5',
            weapons: { raiden_shogun: { weapon: 'the_catch', refinement: 5 } },
          },
          { label: 'Three targets', enemy: { count: 3, res: -20 } },
          {
            label: 'Bennett NO',
            builds: {
              bennett: { set: { kind: '4pc', setKey: 'NoblesseOblige' } },
            },
          },
          {
            label: 'Raiden’s pieces on Bennett',
            builds: { bennett: { artifacts: pieces } },
          },
        ],
      },
      deps,
    );
    expect(r.runs.map((x) => x.label)).toEqual([
      'base',
      'The Catch R5',
      'Three targets',
      'Bennett NO',
      'Raiden’s pieces on Bennett',
    ]);
    expect(configs[1]).toContain(
      'raidenshogun add weapon="thecatch" refine=5 lvl=90/90;',
    );
    expect(configs[2].match(/^target .*resist=-0\.2 .*;$/gm)).toHaveLength(3);
    for (const v of r.runs.slice(1)) {
      expect(v.vsBase!.text).toMatch(/^[+−±]\d+\.\d% ± \d+\.\d%$/);
      expect(v.vsBase!.pct).toBeCloseTo(
        (100 * (v.dps!.mean - r.runs[0].dps!.mean)) / r.runs[0].dps!.mean,
        10,
      );
    }
  });

  it('a variant that can’t be built says why, and the others still run', async () => {
    const { deps } = fakeDeps();
    const r = await simulateTeam(
      {
        ...BASE,
        variants: [
          { label: 'Yelan', swap: { xingqiu: 'yelan' } },
          { label: 'Nobody', swap: { kaedehara_kazuha: 'sucrose' } },
          {
            label: 'Bow',
            weapons: { raiden_shogun: { weapon: 'skyward_harp' } },
          },
          {
            label: 'Ghost piece',
            builds: { bennett: { artifacts: ['nope'] } },
          },
          { label: 'Fine', enemy: { level: 95 } },
        ],
      },
      deps,
    );
    expect(r.runs.slice(1).map((x) => x.problems)).toEqual([
      [
        'Raiden National (Xingqiu)\'s "xingqiu" slot takes only Xingqiu, its actions are written for them: for Yelan, choose a rotation that has them (raiden-national)',
      ],
      [
        "Kaedehara Kazuha isn't in this team (Raiden Shogun, Xiangling, Xingqiu, Bennett)",
      ],
      ["Raiden Shogun can't wield Skyward Harp"],
      ['no artifact nope in the account'],
      undefined,
    ]);
    expect(r.runs[5].vsBase).toBeDefined();
  });

  it('what gcsim lacks is not simulated; a base that can’t be built is an error', async () => {
    const { deps } = fakeDeps();
    const r = await simulateTeam(
      {
        ...BASE,
        variants: [
          {
            label: 'Isshin',
            weapons: { bennett: { weapon: 'prized_isshin_blade' } },
          },
        ],
      },
      deps,
    );
    expect(r.runs[1]).toMatchObject({
      notSimulated: ["gcsim v2.48.8 doesn't have Prized Isshin Blade"],
    });
    expect(r.runs[1].dps).toBeUndefined();
    await expect(
      simulateTeam({ rotation: 'raiden-national' }, deps),
    ).rejects.toThrow(
      new TeamSimError([
        {
          path: 'rotation',
          message: 'yelan is not in the account',
        },
      ]),
    );
  });
});

describe('the Services side', () => {
  it('finds gcsim installed after the server started, without a restart', async () => {
    const sample = sampleAccountServices();
    let installed: TeamSimDeps['pool'] | undefined;
    const { deps } = fakeDeps();
    const runner = {
      run: async (config: string) => (await deps.pool.run(config)).result,
      runWithSample: async () => {
        throw new Error('unused');
      },
    };
    let looks = 0;
    const services = new Services(sample.db, undefined, {
      deps: () => {
        looks++;
        return installed ? { gcsim: 'v2.48.8', runner } : undefined;
      },
    });
    await expect(services.simulateTeam(BASE)).rejects.toMatchObject({
      status: 503,
    });
    installed = deps.pool;
    const r = await services.simulateTeam(BASE);
    expect(r.runs[0].dps).toBeDefined();
    // Found once, then kept.
    await services.simulateTeam(BASE);
    expect(looks).toBe(2);
    await services.searches.close();
    await sample.searches.close();
  });

  it('checks the request, needs gcsim, and answers through the pool', async () => {
    const sample = sampleAccountServices();
    const without = new Services(sample.db, undefined, {});
    await expect(
      without.simulateTeam({
        rotation: 'x',
        variants: [{ label: 'a', bogus: 1 }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
      issues: [{ path: 'variants.0.bogus', message: 'unknown field' }],
    });
    await expect(without.simulateTeam(BASE)).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      without.simulateTeam({ rotation: 'raiden-national' }),
    ).rejects.toMatchObject({ status: 503 });
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

describe.skipIf(!installed)('simulate_team over the installed gcsim', () => {
  it('a base and three variants on the sample account, the optimizer filling one build', async () => {
    const sample = sampleAccountServices();
    const services = new Services(sample.db, undefined, {
      deps: installedRotationDeps(),
    });
    const r = await services.simulateTeam({
      rotation: 'raiden-national-xingqiu',
      iterations: 300,
      variants: [
        { label: 'Two targets', enemy: { count: 2 } },
        {
          label: 'Raiden, any set',
          builds: { raiden_shogun: { set: { kind: 'any' } } },
        },
        { label: 'Low resistance', enemy: { res: -20 } },
      ],
    });
    expect(r.runs.every((x) => x.dps && !x.problems)).toBe(true);
    // A second target, 4.5 apart (only AoE reaches both), adds a good part
    // of the damage again (+30 to +50% here); lower resistance raises it.
    expect(r.runs[1].vsBase!.pct).toBeGreaterThan(20);
    expect(r.runs[3].vsBase!.pct).toBeGreaterThan(0);
    await services.searches.close();
    await sample.searches.close();
  }, 180_000);
});
