import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { importGood, openStore, recordMerge, type Store } from '../store/store';
import { Services } from '../api/services';
import { buildApp } from '../api/app';
import { createMcpServer } from '../mcp/server';
import { accountTools } from '../mcp/tools';
import type {
  ChatRequest,
  ChatResponse,
  LlmClient,
  ToolCall,
} from '../llm/client';
import { MASK, maskUngrounded, ungroundedNumbers } from './grounding';
import { chatTools, runChat, CHAT_SYSTEM } from './loop';
import { createHash } from 'node:crypto';
import { readResult } from '../sim/result';
import { mulberry32 } from '@genshin-build-lab/engine/numbers';

const SAMPLE = readFileSync(
  new URL(
    '../../../engine/src/import/__fixtures__/sample-account.good.json',
    import.meta.url,
  ),
  'utf8',
);

let db: Store;
let services: Services;
beforeEach(() => {
  db = openStore(':memory:');
  // Fixed times: tool results carry them, and grounding reads every number
  // in a result, so "now" made these tests depend on the clock (at 21:xx
  // UTC an invented "21" matched the merge's timestamp).
  importGood(db, { text: SAMPLE, importedAt: '2026-01-02T03:04:05.000Z' });
  recordMerge(db, [1], '2026-01-02T03:04:05.000Z');
  services = new Services(db);
});
afterEach(() => services.searches.close());

// ---- a scripted fake model --------------------------------------------------

type Script = (req: ChatRequest, turn: number) => Partial<ChatResponse>;

/** A model that answers from `script`, recording every request. */
function fakeModel(script: Script) {
  const requests: ChatRequest[] = [];
  const client: LlmClient = {
    provider: 'ollama',
    model: 'fake',
    async chat(req) {
      requests.push(structuredClone(req));
      const r = script(req, requests.length - 1);
      const toolCalls = r.toolCalls ?? [];
      return {
        text: r.text ?? '',
        toolCalls,
        stop: toolCalls.length ? 'tool_calls' : 'end',
      };
    },
  };
  return { client, requests };
}
const call = (name: string, args: Record<string, unknown>): ToolCall => ({
  id: `c-${name}`,
  name,
  arguments: args,
});
/** The last tool result the model was shown, parsed. */
const lastResult = (req: ChatRequest) => {
  const m = req.messages.findLast((x) => x.role === 'tool');
  return JSON.parse(m!.content);
};
const ask = (q: string) => [{ role: 'user' as const, content: q }];

// ---- grounding ----------------------------------------------------------------

describe('grounding', () => {
  const sources = ['{"hp":39812.4,"crit_rate":71.23,"er_pct":183.5}'];

  it('accepts numbers as written, rounded or cut to the answer’s precision', () => {
    expect(
      ungroundedNumbers(
        'HP 39,812, crit rate 71.2% (about 71%), ER 183.5% — 183% at least.',
        sources,
      ),
    ).toEqual([]);
  });

  it('accepts counting words and the owner’s own numbers', () => {
    expect(
      ungroundedNumbers('A 4-piece set, top 3 builds, 10 at most.', []),
    ).toEqual([]);
    expect(
      ungroundedNumbers('Your 180% floor holds.', [
        ...sources,
        'best build with at least 180% ER?',
      ]),
    ).toEqual([]);
  });

  it('flags invented, summed or mis-rounded numbers', () => {
    expect(
      ungroundedNumbers(
        'Crit value 254.9, ER 185%, HP 40,000, and 12 more pieces.',
        sources,
      ),
    ).toEqual(['254.9', '185', '40,000', '12']);
  });

  it('masks what it flags and nothing else', () => {
    expect(maskUngrounded('HP 39,812 and DMG 99,999.', sources)).toEqual({
      text: `HP 39,812 and DMG ${MASK}.`,
      masked: ['99,999'],
    });
  });

  it('holds a signed number to its sign: a loss is not a gain (TODO 6.3)', () => {
    const diff = ['{"diff":{"crit_rate":-3.2,"hp":1200.5}}'];
    expect(ungroundedNumbers('Crit rate −3.2, HP +1,200.5.', diff)).toEqual([]);
    expect(ungroundedNumbers('Crit rate -3.2 (3.2 lower).', diff)).toEqual([]);
    expect(ungroundedNumbers('Crit rate +3.2, HP −1200.5.', diff)).toEqual([
      '+3.2',
      '−1200.5',
    ]);
    // Hyphens inside words, dates and ranges aren't signs.
    expect(
      ungroundedNumbers('Piece m1-17, 3.2-1200.5, 2026-01-02.', [
        ...diff,
        'm1-17 2026-01-02',
      ]),
    ).toEqual([]);
  });

  it('accepts a comparison only exactly as simulate_team wrote it (TODO 6.3)', () => {
    const sim = [
      JSON.stringify({
        runs: [
          { label: 'base' },
          { label: 'Kazuha', vsBase: { text: '+7.4% ± 1.2%', pct: 7.4 } },
          { label: 'Catch', vsBase: { text: '−8.6% ± 0.3%', pct: -8.6 } },
        ],
      }),
    ];
    expect(
      ungroundedNumbers(
        'Kazuha: +7.4% ± 1.2% team DPS. Catch: −8.6% ± 0.3% team DPS (or -8.6% ± 0.3%).',
        sim,
      ),
    ).toEqual([]);
    expect(
      ungroundedNumbers(
        'Kazuha: +7% ± 1% (rounded), Catch: +8.6% ± 0.3% (wrong way), Kazuha: +7.4% ± 0.3% (wrong interval), 7.4% ± 1.2% (no sign).',
        sim,
      ),
    ).toEqual(['+7% ± 1%', '+8.6% ± 0.3%', '+7.4% ± 0.3%', '7.4% ± 1.2%']);
    expect(
      maskUngrounded('Kazuha: +7.4% ± 1.2%; Catch: +8.6% ± 0.3%.', sim),
    ).toEqual({
      text: `Kazuha: +7.4% ± 1.2%; Catch: ${MASK}.`,
      masked: ['+8.6% ± 0.3%'],
    });
  });

  it('leaves no ungrounded number behind, whatever the answer (200 random answers)', () => {
    // The engine's seeded PRNG, so a failure reproduces.
    const rand = mulberry32(7);
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    // Numbers from the sources to mix in; the property holds for any.
    const grounded = sources.flatMap((s) => s.match(/\d+(?:\.\d+)?/g) ?? []);
    for (let i = 0; i < 200; i++) {
      const words = Array.from({ length: 12 }, () =>
        pick([
          () => String(pick(grounded)),
          () => (rand() * 1e5).toFixed(pick([0, 1, 2])),
          () => Math.floor(rand() * 1e6).toLocaleString('en-US'),
          () => String(Math.floor(rand() * 11)),
          () => pick(['HP', 'crit', '%', ',', '.', '4pc', 'm1-17']),
        ])(),
      );
      const { text } = maskUngrounded(
        words.join(pick([' ', '', ', '])),
        sources,
      );
      expect(ungroundedNumbers(text, sources)).toEqual([]);
    }
  });
});

// ---- the loop -----------------------------------------------------------------

describe('runChat', () => {
  it('offers exactly the MCP tools, with JSON Schemas', async () => {
    const mcp = createMcpServer(services);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '0' });
    await Promise.all([mcp.connect(a), client.connect(b)]);
    const names = (await client.listTools()).tools.map((t) => t.name);
    const offered = chatTools(accountTools(services));
    expect(offered.map((t) => t.name)).toEqual(names);
    const optimize = offered.find((t) => t.name === 'optimize_build')!;
    expect(optimize.parameters).toMatchObject({
      type: 'object',
      required: ['character'],
    });
    expect(optimize.parameters).not.toHaveProperty('$schema');
    await client.close();
  });

  it('runs the tools the model calls and returns an answer quoting them', async () => {
    const { client, requests } = fakeModel((req, turn) =>
      turn === 0
        ? {
            toolCalls: [call('get_character', { characterKey: 'neuvillette' })],
          }
        : { text: `Neuvillette has ${lastResult(req).stats.hp} HP.` },
    );
    const r = await runChat(
      client,
      accountTools(services),
      ask('How much HP does Neuvillette have?'),
    );
    expect(r.stop).toBe('answer');
    expect(r.masked).toEqual([]);
    expect(r.answer).toMatch(/^Neuvillette has \d+(\.\d)? HP\.$/);
    expect(r.steps).toEqual([
      expect.objectContaining({ tool: 'get_character', ok: true }),
    ]);
    expect(requests[0].system).toBe(CHAT_SYSTEM);
    expect(requests[1].messages.at(-1)).toMatchObject({
      role: 'tool',
      name: 'get_character',
    });
  });

  it('never lets a number no tool gave reach the owner (TODO 3.6)', async () => {
    // A model that insists on an invented figure, even when asked to revise.
    const { client, requests } = fakeModel((req, turn) =>
      turn === 0
        ? {
            toolCalls: [call('get_character', { characterKey: 'neuvillette' })],
          }
        : {
            text: `Neuvillette has ${lastResult(req).stats.hp} HP and deals 98765.4 damage.`,
          },
    );
    const r = await runChat(
      client,
      accountTools(services),
      ask('Neuvillette?'),
    );
    expect(r.answer).not.toContain('98765.4');
    expect(r.answer).toContain(`deals ${MASK} damage`);
    expect(r.masked).toEqual(['98765.4']);
    // It was asked to revise once, naming the number, before masking.
    expect(requests).toHaveLength(3);
    expect(requests[2].messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringMatching(/no tool result gave: 98765\.4/),
    });
    // The rule holds for the final text as a whole.
    const toolText = requests[2].messages
      .filter((m) => m.role === 'tool')
      .map((m) => m.content);
    expect(ungroundedNumbers(r.answer, [...toolText, 'Neuvillette?'])).toEqual(
      [],
    );
  });

  it('keeps a revised answer that drops the invented number', async () => {
    const { client, requests } = fakeModel((req, turn) =>
      turn === 0
        ? { toolCalls: [call('get_account_summary', {})] }
        : turn === 1
          ? { text: 'You own 21 artifacts.' }
          : { text: `You own ${lastResult(req).artifacts.total} artifacts.` },
    );
    const r = await runChat(client, accountTools(services), ask('How many?'));
    expect(r).toMatchObject({ answer: 'You own 20 artifacts.', masked: [] });
    expect(requests).toHaveLength(3);
  });

  it('reports bad arguments, unknown tools and oversized results to the model, not the owner', async () => {
    const { client, requests } = fakeModel((_req, turn) =>
      turn === 0
        ? {
            toolCalls: [
              call('optimize_build', { character: 'nobody' }),
              call('get_character', { characterKey: 'furina', pool: 'free' }),
              call('delete_account', {}),
              call('query_artifacts', { limit: 200 }),
            ],
          }
        : { text: 'I couldn’t get that.' },
    );
    const r = await runChat(client, accountTools(services), ask('Go'), {
      maxResultChars: 500,
    });
    expect(r.steps.map((s) => [s.tool, s.ok])).toEqual([
      ['optimize_build', false],
      ['get_character', false],
      ['delete_account', false],
      ['query_artifacts', false],
    ]);
    const shown = requests[1].messages
      .filter((m) => m.role === 'tool')
      .map((m) => m.content);
    expect(shown[0]).toMatch(
      /^error: invalid_spec: the spec has a problem: character: unknown character "nobody"/,
    );
    // Strict arguments: an invented field is named, not dropped.
    expect(shown[1]).toMatch(/^error: invalid arguments: .*pool/);
    expect(shown[2]).toMatch(
      /^error: no tool named delete_account; the tools are get_account_summary/,
    );
    expect(shown[3]).toMatch(/^error: the result is too large/);
    expect(r.answer).toBe('I couldn’t get that.');
  });

  it('stops a model that never answers', async () => {
    const { client, requests } = fakeModel(() => ({
      toolCalls: [call('get_account_summary', {})],
    }));
    const r = await runChat(client, accountTools(services), ask('Loop'), {
      maxModelCalls: 3,
    });
    expect(r.stop).toBe('step_limit');
    expect(requests).toHaveLength(3);
    expect(r.steps).toHaveLength(3);
  });
});

// ---- POST /chat -------------------------------------------------------------------

describe('a team comparison from one chat request (TODO 6.3)', () => {
  /** Services whose gcsim is a fake: DPS depends only on the config. */
  function simServices() {
    const fixture = readResult(
      JSON.parse(
        readFileSync(
          new URL(
            '../sim/__fixtures__/raiden-national-30.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ),
    );
    const result = (config: string) => {
      const h = createHash('sha256').update(config).digest();
      return {
        ...fixture,
        iterations: 1000,
        dps: {
          ...fixture.dps,
          mean: 60_000 + h.readUInt16BE(0) / 4,
          sd: 3_000,
        },
      };
    };
    return new Services(db, undefined, {
      deps: {
        gcsim: 'v2.48.8',
        commit: 'c'.repeat(40),
        runner: {
          run: async (config) => result(config),
          runWithSample: async (config) => ({
            result: result(config),
            sample: {},
          }),
        },
      },
    });
  }

  const REQUEST = {
    rotation: 'raiden-national-xingqiu',
    variants: [
      {
        label: 'The Catch R5',
        weapons: { raiden_shogun: { weapon: 'the_catch', refinement: 5 } },
      },
      { label: 'Two targets', enemy: { count: 2 } },
      { label: 'Low resistance', enemy: { res: -20 } },
    ],
  };

  /** How a well-behaved model explains a simulate_team result: each
   *  variant's label and its vsBase.text, as the tool wrote it. */
  const explain = (req: ChatRequest) =>
    (
      lastResult(req).runs as {
        label: string;
        vsBase?: { text: string; withinNoise: boolean };
      }[]
    )
      .filter((r) => r.vsBase)
      .map(
        (r) =>
          `- ${r.label}: ${r.vsBase!.text} team DPS${r.vsBase!.withinNoise ? ' (no different from the base)' : ''}`,
      )
      .join('\n');

  it('runs three variants from one request, and the explanation’s numbers are the tool’s, exactly', async () => {
    const sim = simServices();
    const { client, requests } = fakeModel((req, turn) =>
      turn === 0
        ? { toolCalls: [call('simulate_team', REQUEST)] }
        : { text: `Against your current team:\n${explain(req)}` },
    );
    const r = await runChat(
      client,
      accountTools(sim),
      ask(
        'Compare my classic National with The Catch R5 on Raiden, two targets, and -20% resistance.',
      ),
    );
    expect(r.stop).toBe('answer');
    expect(r.masked).toEqual([]);
    expect(r.steps).toEqual([
      expect.objectContaining({ tool: 'simulate_team', ok: true }),
    ]);
    // One request, three variants run, each cited.
    const result = JSON.parse(
      requests[1].messages.findLast((m) => m.role === 'tool')!.content,
    );
    expect(result.runs.map((x: { label: string }) => x.label)).toEqual([
      'base',
      'The Catch R5',
      'Two targets',
      'Low resistance',
    ]);
    const texts = result.runs
      .slice(1)
      .map((x: { vsBase: { text: string } }) => x.vsBase.text);
    const cited = [...r.answer.matchAll(/[+−±]\d+\.\d% ± \d+\.\d%/g)].map(
      (m) => m[0],
    );
    expect(cited).toEqual(texts);
    for (const [i, label] of [
      'The Catch R5',
      'Two targets',
      'Low resistance',
    ].entries())
      expect(r.answer).toContain(`${label}: ${texts[i]} team DPS`);
    await sim.searches.close();
  });

  it('sends back a rounded or sign-flipped comparison, and masks it if it stays', async () => {
    const sim = simServices();
    let tool:
      { runs: { label: string; vsBase?: { text: string } }[] } | undefined;
    const wrong: string[] = [];
    const { client, requests } = fakeModel((req, turn) => {
      if (turn === 0) return { toolCalls: [call('simulate_team', REQUEST)] };
      tool ??= lastResult(req);
      const [, a, b, c] = tool!.runs;
      // Rounded to whole percents; and with its sign flipped.
      const rounded = a.vsBase!.text.replace(
        /(\d+)\.\d% ± (\d+)\.\d%/,
        '$1% ± $2%',
      );
      const flipped = b.vsBase!.text.replace(/^[+−]/, (x) =>
        x === '+' ? '−' : '+',
      );
      wrong.splice(0, 2, rounded, flipped);
      return {
        text: `- ${a.label}: ${rounded}\n- ${b.label}: ${flipped}\n- ${c.label}: ${c.vsBase!.text}`,
      };
    });
    const r = await runChat(client, accountTools(sim), ask('Compare.'));
    // Asked to revise once, told how to cite, then masked.
    expect(requests).toHaveLength(3);
    expect(requests[2].messages.at(-1)!.content).toMatch(
      /Comparisons must be copied exactly from simulate_team's vsBase\.text/,
    );
    expect(r.masked).toEqual(wrong);
    expect(r.answer.split('\n')).toEqual([
      `- ${tool!.runs[1].label}: ${MASK}`,
      `- ${tool!.runs[2].label}: ${MASK}`,
      `- ${tool!.runs[3].label}: ${tool!.runs[3].vsBase!.text}`,
    ]);
    await sim.searches.close();
  });
});

describe('POST /chat', () => {
  const H = { host: 'localhost' };

  it('answers with the steps, the provider and the model', async () => {
    const { client } = fakeModel((req, turn) =>
      turn === 0
        ? { toolCalls: [call('get_account_summary', {})] }
        : { text: `${lastResult(req).characters} characters.` },
    );
    const app = buildApp({ db, llmClient: client });
    const r = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: H,
      payload: { messages: ask('How many characters?') },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      answer: '8 characters.',
      masked: [],
      stop: 'answer',
      steps: [{ tool: 'get_account_summary', ok: true }],
      provider: 'ollama',
      model: 'fake',
    });
    await app.close();
  });

  it('refuses a conversation that doesn’t end with a question, and answers 503 without a model', async () => {
    const { client } = fakeModel(() => ({ text: 'x' }));
    const app = buildApp({ db, llmClient: client });
    const bad = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: H,
      payload: { messages: [{ role: 'assistant', content: 'hi' }] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toMatch(/last message must be/);
    await app.close();
    const none = buildApp({ db: openStore(':memory:') });
    const r = await none.inject({
      method: 'POST',
      url: '/chat',
      headers: H,
      payload: { messages: ask('hi') },
    });
    expect(r.statusCode).toBe(503);
    await none.close();
  });
});
