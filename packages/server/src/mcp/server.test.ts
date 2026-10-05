import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { importGood, openStore, recordMerge } from '../store/store';
import { Services } from '../api/services';
import { createMcpServer } from './server';

const SAMPLE = readFileSync(
  new URL(
    '../../../engine/src/import/__fixtures__/sample-account.good.json',
    import.meta.url,
  ),
  'utf8',
);

let client: Client;
let services: Services;
beforeEach(async () => {
  const db = openStore(':memory:');
  importGood(db, { text: SAMPLE });
  recordMerge(db, [1]);
  services = new Services(db);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer(services).connect(a);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
});
afterEach(async () => {
  await client.close();
  await services.searches.close();
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (name: string, args: Json = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0].text;
  return { r, text, data: r.structuredContent as Json };
};

describe('MCP server', () => {
  it('offers its tools with instructions, all read-only but drafting a rotation', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'compare_builds',
      'draft_rotation',
      'get_account_summary',
      'get_character',
      'get_import_report',
      'get_rotation',
      'list_characters',
      'list_rotations',
      'optimize_build',
      'query_artifacts',
    ]);
    expect(
      tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name),
    ).toEqual(['draft_rotation']);
    // It saves a draft, never deletes or replaces what isn't its own.
    expect(
      tools.find((t) => t.name === 'draft_rotation')!.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    // Promotion is the owner's alone: no tool for it.
    expect(tools.some((t) => /promote|review/.test(t.name))).toBe(false);
    expect(client.getInstructions()).toMatch(/must come from a tool result/);
  });

  it('answers every tool with a JSON object, the same as its text', async () => {
    for (const [name, args] of [
      ['get_account_summary', {}],
      ['list_characters', {}],
      ['get_character', { characterKey: 'neuvillette' }],
      ['query_artifacts', { slot: 'sands' }],
      ['get_import_report', {}],
      ['list_rotations', {}],
      ['get_rotation', { id: 'raiden-national' }],
    ] as const) {
      const { r, text, data } = await call(name, args);
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(text)).toEqual(data);
      expect(Array.isArray(data)).toBe(false);
    }
  });

  it('gives artifacts compactly, stats rounded to one decimal', async () => {
    const { data } = await call('get_character', {
      characterKey: 'neuvillette',
    });
    const a = data.equipped[0];
    expect(Object.keys(a).sort()).toEqual(
      expect.arrayContaining(['id', 'set', 'slot', 'level', 'main', 'subs']),
    );
    for (const v of Object.values(data.stats as Record<string, number>))
      expect(Math.round(v * 10) / 10).toBe(v);
  });

  it('optimizes, and compares the result with the equipped build', async () => {
    // A ConstraintSpec (ADR-0036): her defaults, any set (the sample
    // account is small), one build.
    const { data: best } = await call('optimize_build', {
      character: 'neuvillette',
      set: { kind: 'any' },
      topK: 1,
    });
    expect(best.status).toBe('ok');
    expect(best.understood).toMatch(
      /^I understood: build Neuvillette \(Tome of the Eternal Flow R1, level 90\) for average damage/,
    );
    const ids = Object.values(best.builds[0].artifacts).map(
      (a) => (a as Json).id,
    );
    const { data: worn } = await call('get_character', {
      characterKey: 'neuvillette',
    });
    const { data: cmp } = await call('compare_builds', {
      characterKey: 'neuvillette',
      a: worn.equipped.map((a: Json) => a.id),
      b: ids,
    });
    expect(cmp.b.objectiveValue).toBeGreaterThanOrEqual(cmp.a.objectiveValue);
    expect(cmp.objectiveDiff).toBeCloseTo(
      cmp.b.objectiveValue - cmp.a.objectiveValue,
      0,
    );
  });

  it('reports problems as tool errors the model can read', async () => {
    const missing = await call('get_character', { characterKey: 'diluc' });
    expect(missing.r.isError).toBe(true);
    expect(missing.text).toMatch(/not_found: .*not in the account/);
    const wrong = await call('compare_builds', {
      characterKey: 'neuvillette',
      a: ['m1-0'],
      b: ['nope'],
    });
    expect(wrong.text).toMatch(/no artifact "nope"/);
    // A spec's problems come back together, each with where it is.
    const bad = await call('optimize_build', {
      character: 'nobody',
      mainStats: { sands: 'crit_rate' },
    });
    expect(bad.r.isError).toBe(true);
    expect(bad.text).toMatch(
      /^invalid_spec: the spec has 2 problems: character: unknown character "nobody"; mainStats.sands: a sands can't have crit_rate/,
    );
  });
});
