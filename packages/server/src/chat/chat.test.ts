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
import {
  MASK,
  maskUngrounded,
  sourceValues,
  ungroundedNumbers,
} from './grounding';
import { chatTools, runChat, CHAT_SYSTEM } from './loop';

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

  it('leaves no ungrounded number behind, whatever the answer (200 random answers)', () => {
    // A seeded PRNG, so a failure reproduces.
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const grounded = sourceValues(sources);
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
      required: ['characterKey'],
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
              call('optimize_build', { characterKey: 'nobody' }),
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
      ['delete_account', false],
      ['query_artifacts', false],
    ]);
    const shown = requests[1].messages
      .filter((m) => m.role === 'tool')
      .map((m) => m.content);
    expect(shown[0]).toMatch(
      /^error: invalid arguments: characterKey: unknown character/,
    );
    expect(shown[1]).toMatch(
      /^error: no tool named delete_account; the tools are get_account_summary/,
    );
    expect(shown[2]).toMatch(/^error: the result is too large/);
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
