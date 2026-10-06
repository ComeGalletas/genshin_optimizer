/**
 * TODO 4.5: an invalid spec never reaches the optimizer, on any path.
 *
 * Every search goes through `SearchRunner.run` (the worker thread), so that
 * one method is the gateway watched here. Invalid specs of every kind
 * (wrong shape, wrong meaning, wrong for the account) are pushed through
 * every way in: the service, REST, MCP, the chat's tool loop and the
 * translator. Then a seeded fuzz of the golden set's specs checks the
 * invariant both ways: whatever the input, the optimizer runs only a spec
 * that passed every check, and every spec that passed does run.
 */

import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { parseConstraintSpec } from '@genshin-build-lab/engine/constraints/spec';
import { specToRun } from '@genshin-build-lab/engine/constraints/toRequest';
import {
  currentRoster,
  importGood,
  openStore,
  recordMerge,
  type Store,
} from './store/store';
import { SearchRunner } from './optimize/pool';
import { Services } from './api/services';
import { buildApp } from './api/app';
import { createMcpServer } from './mcp/server';
import { accountTools } from './mcp/tools';
import { runChat } from './chat/loop';
import { SUBMIT_SPEC } from './llm/translate';
import { loadGolden } from './llm/evaluate';
import type { ChatResponse, LlmClient } from './llm/client';
import { resolveSimTeam } from './sim/rerank';
import { ROTATIONS_DIR } from './sim/rotations';
import type { RotationDeps } from './sim/drafts';

/** gcsim for `objective: "sim"` specs: never reached here (the search is
 *  mocked infeasible), but present, so a valid sim spec gets to the search. */
const NO_SIMS: RotationDeps = {
  gcsim: 'v2.48.8',
  runner: {
    run: () => Promise.reject(new Error('no simulations in this test')),
    runWithSample: () => Promise.reject(new Error('no simulations')),
  },
};

const SAMPLE = readFileSync(
  new URL(
    '../../engine/src/import/__fixtures__/sample-account.good.json',
    import.meta.url,
  ),
  'utf8',
);

let db: Store;
let services: Services;
let runs: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db = openStore(':memory:');
  importGood(db, { text: SAMPLE, importedAt: '2026-01-02T03:04:05.000Z' });
  recordMerge(db, [1], '2026-01-02T03:04:05.000Z');
  services = new Services(db, undefined, { deps: NO_SIMS });
  // The optimizer's only door. No search really runs: these tests are about
  // what is let through, not about builds.
  runs = vi
    .spyOn(SearchRunner.prototype, 'run')
    .mockResolvedValue({ status: 'infeasible', explored: 0, pruned: 0 });
});
afterEach(async () => {
  runs.mockRestore();
  await services.searches.close();
});

/** One of each kind of invalid spec, and the path its first issue names. */
const INVALID: [string, unknown, string][] = [
  ['not an object', 'furina', 'spec'],
  ['no character', { minStats: { er_pct: 180 } }, 'character'],
  ['an invented field', { character: 'furina', pool: 'free' }, 'pool'],
  [
    'a wrong type',
    { character: 'furina', minStats: { er_pct: '180' } },
    'minStats.er_pct',
  ],
  [
    'out of range',
    { character: 'furina', enemy: { level: 900 } },
    'enemy.level',
  ],
  ['another version', { version: 2, character: 'furina' }, 'version'],
  ['an unknown character', { character: 'furnia' }, 'character'],
  [
    'an unknown set',
    { character: 'furina', set: { kind: '4pc', setKey: 'GoldenTrope' } },
    'set.setKey',
  ],
  [
    'a main stat the slot lacks',
    { character: 'furina', mainStats: { sands: 'crit_rate' } },
    'mainStats.sands',
  ],
  [
    'min above max',
    {
      character: 'furina',
      minStats: { er_pct: 200 },
      maxStats: { er_pct: 150 },
    },
    'minStats.er_pct',
  ],
  [
    'a weapon she can’t wield',
    { character: 'furina', weapon: "wolf's_gravestone" },
    'weapon',
  ],
  [
    'damage without a profile',
    {
      character: 'diluc',
      objective: 'avg_damage',
      weapon: "wolf's_gravestone",
    },
    'objective',
  ],
  ['no weapon for an unowned character', { character: 'diluc' }, 'weapon'],
  [
    'an artifact id not in the account',
    { character: 'furina', excludeArtifacts: ['m9-999'] },
    'excludeArtifacts.0',
  ],
  [
    'a default floor above the ceiling',
    { character: 'bennett', maxStats: { er_pct: 150 } },
    'maxStats.er_pct',
  ],
];

describe('no invalid spec reaches the optimizer (TODO 4.5)', () => {
  it('the service: refused with every issue, never searched', async () => {
    for (const [what, spec, path] of INVALID) {
      const e = await services.runSpec(spec).catch((x: unknown) => x);
      expect(e, what).toMatchObject({ status: 400, code: 'invalid_spec' });
      expect((e as { issues: { path: string }[] }).issues[0].path, what).toBe(
        path,
      );
    }
    expect(runs).not.toHaveBeenCalled();
  });

  it('REST: /spec/run and /spec/check answer 400, never searched', async () => {
    const app = buildApp({ db });
    for (const url of ['/spec/run', '/spec/check'])
      for (const [what, spec, path] of INVALID) {
        const r = await app.inject({
          method: 'POST',
          url,
          headers: { host: 'localhost' },
          payload: { spec },
        });
        expect(r.statusCode, `${url} ${what}`).toBe(400);
        expect(r.json().issues[0].path, `${url} ${what}`).toBe(path);
      }
    await app.close();
    expect(runs).not.toHaveBeenCalled();
  });

  it('MCP: optimize_build answers a tool error, never searched', async () => {
    const server = createMcpServer(services);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'guard', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    for (const [what, spec] of INVALID) {
      // MCP arguments are objects; a bare string is the client's problem.
      if (typeof spec !== 'object') continue;
      const r = await client.callTool({
        name: 'optimize_build',
        arguments: spec as never,
      });
      expect(r.isError, what).toBe(true);
    }
    await client.close();
    expect(runs).not.toHaveBeenCalled();
  });

  it('the chat: every bad call goes back to the model, never searched', async () => {
    const specs = INVALID.filter(([, s]) => typeof s === 'object');
    let turn = 0;
    const client: LlmClient = {
      provider: 'ollama',
      model: 'fake',
      async chat(): Promise<ChatResponse> {
        const s = specs[turn++];
        return s
          ? {
              text: '',
              toolCalls: [
                {
                  id: `c${turn}`,
                  name: 'optimize_build',
                  arguments: s[1] as never,
                },
              ],
              stop: 'tool_calls',
            }
          : { text: 'I could not build that.', toolCalls: [], stop: 'end' };
      },
    };
    const r = await runChat(
      client,
      accountTools(services),
      [{ role: 'user', content: 'Build things' }],
      { maxModelCalls: specs.length + 1 },
    );
    expect(r.steps).toHaveLength(specs.length);
    expect(r.steps.every((s) => !s.ok)).toBe(true);
    expect(runs).not.toHaveBeenCalled();
  });

  it('the translator: never runs anything, valid or not', async () => {
    let i = 0;
    const client: LlmClient = {
      provider: 'ollama',
      model: 'fake',
      async chat(): Promise<ChatResponse> {
        const spec =
          i++ < 2 ? { character: 'nobody' } : { character: 'furina' };
        return {
          text: '',
          toolCalls: [{ id: 'x', name: SUBMIT_SPEC, arguments: spec as never }],
          stop: 'tool_calls',
        };
      },
    };
    await expect(
      services.translateSpec(client, 'Furina'),
    ).resolves.toMatchObject({
      attempts: 3,
    });
    expect(runs).not.toHaveBeenCalled();
  });
});

describe('the invariant, fuzzed (TODO 4.5)', () => {
  it('runs exactly the specs that pass every check, and nothing else (400 mutations)', async () => {
    let seed = 45;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const GARBAGE = [
      undefined,
      null,
      -1,
      0,
      1.8,
      180,
      1e9,
      '',
      'any',
      'all',
      'furina',
      'GoldenTrope',
      [],
      ['furina'],
      {},
      { kind: '4pc' },
      { er_pct: 180 },
      { er_pct: -5 },
      true,
    ];
    const FIELDS = [
      'character',
      'weapon',
      'buildLevel',
      'defaults',
      'set',
      'mainStats',
      'minStats',
      'maxStats',
      'objective',
      'keepEquippedOn',
      'excludeArtifacts',
      'teamBuffs',
      'enemy',
      'sim',
      'version',
      'bogus',
    ];
    const golden = loadGolden().map(
      (c) => c.expected as Record<string, unknown>,
    );
    const account = {
      roster: currentRoster(db).roster,
      weapons: currentRoster(db).weapons,
      artifacts: (await import('./store/store'))
        .currentAccount(db)
        .map((m) => m.artifact),
    };
    let valid = 0;
    for (let n = 0; n < 400; n++) {
      const spec: Record<string, unknown> = structuredClone(pick(golden));
      // 0 to 2 changes: some specs stay valid, most break.
      for (let m = Math.floor(rand() * 3); m > 0; m--) {
        const f = pick(FIELDS);
        const v = pick(GARBAGE);
        if (v === undefined) delete spec[f];
        else spec[f] = structuredClone(v);
      }
      // The oracle: the engine's own checks, applied directly, and for
      // "sim" the rotation and teammates too (TODO 5.8).
      const parsed = parseConstraintSpec(spec);
      const ok =
        parsed.ok &&
        specToRun(parsed.spec, account).ok &&
        (parsed.spec.objective !== 'sim' ||
          resolveSimTeam(
            parsed.spec.character,
            parsed.spec.sim?.rotation,
            account,
            ROTATIONS_DIR,
          ).ok);
      runs.mockClear();
      const result = await services.runSpec(spec).catch((e: unknown) => e);
      if (ok) {
        valid++;
        expect(runs, JSON.stringify(spec)).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
          understood: expect.stringMatching(/^I understood/),
        });
      } else {
        expect(runs, JSON.stringify(spec)).not.toHaveBeenCalled();
        expect(result).toMatchObject({ code: 'invalid_spec' });
      }
    }
    // Both sides of the invariant were exercised.
    expect(valid).toBeGreaterThan(20);
    expect(valid).toBeLessThan(380);
  });
});
