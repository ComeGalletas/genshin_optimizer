import { readFileSync } from 'node:fs';
import { importGood, openStore, recordMerge, type Store } from '../store/store';
import { Services } from '../api/services';
import { buildApp } from '../api/app';
import type { ChatRequest, ChatResponse, LlmClient } from './client';
import { SUBMIT_SPEC, submitSpecTool, translatorPrompt } from './translate';

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
  importGood(db, { text: SAMPLE, importedAt: '2026-01-02T03:04:05.000Z' });
  recordMerge(db, [1], '2026-01-02T03:04:05.000Z');
  services = new Services(db);
});
afterEach(() => services.searches.close());

/** A model that answers turn by turn from `script`, recording requests. */
function fakeModel(script: ((req: ChatRequest) => Partial<ChatResponse>)[]) {
  const requests: ChatRequest[] = [];
  const client: LlmClient = {
    provider: 'ollama',
    model: 'fake',
    async chat(req) {
      requests.push(structuredClone(req));
      const r = script[requests.length - 1]?.(req) ?? { text: 'no idea' };
      return {
        text: r.text ?? '',
        toolCalls: r.toolCalls ?? [],
        stop: r.toolCalls?.length ? 'tool_calls' : 'end',
      };
    },
  };
  return { client, requests };
}
const submit = (spec: object) => () => ({
  toolCalls: [{ id: 's1', name: SUBMIT_SPEC, arguments: spec as never }],
});
const ASK = "What's my best Furina build with at least 180% ER?";

describe('translateSpec', () => {
  it('a spec right the first time: checked, summarised, not run', async () => {
    const { client, requests } = fakeModel([
      submit({ character: 'furina', minStats: { er_pct: 180 } }),
    ]);
    const r = await services.translateSpec(client, ASK);
    expect(r).toMatchObject({
      attempts: 1,
      model: 'fake',
      spec: { version: 1, character: 'furina', minStats: { er_pct: 180 } },
    });
    expect(r.understood).toMatch(
      /^I understood: build Furina \(Favonius Sword R3, level 90\) for average damage \(estimated; default\), with 4-piece Golden Troupe \(default\);.* Energy Recharge at least 180%\.$/,
    );
    expect(r.conditions.at(-1)).toEqual({
      text: 'Energy Recharge at least 180%',
      source: 'asked',
    });
    // The model got the request, the prompt and one tool: the spec schema.
    expect(requests[0].messages).toEqual([{ role: 'user', content: ASK }]);
    expect(requests[0].tools?.map((t) => t.name)).toEqual([SUBMIT_SPEC]);
  });

  it('sends every problem back at once, and accepts the corrected spec', async () => {
    const { client, requests } = fakeModel([
      submit({
        character: 'furina',
        set: { kind: '4pc', setKey: 'GoldenTrope' },
        pool: 'free',
      }),
      submit({
        character: 'furina',
        set: { kind: '4pc', setKey: 'GoldenTroupe' },
        keepEquippedOn: 'all',
      }),
    ]);
    const r = await services.translateSpec(
      client,
      'Furina, 4pc Golden Troupe, only unequipped pieces',
    );
    expect(r.attempts).toBe(2);
    expect(r.spec).toMatchObject({ keepEquippedOn: 'all' });
    const feedback = requests[1].messages.at(-1)!;
    expect(feedback).toMatchObject({ role: 'tool', name: SUBMIT_SPEC });
    // Shape problems first: an unknown field fails the shape check, so the
    // set key is checked on the next round.
    expect(feedback.content).toMatch(
      /^error: the spec has a problem:\n- pool: unknown field "pool"; the fields are /,
    );
  });

  it('meaning and account problems come back too, with suggestions', async () => {
    const { client, requests } = fakeModel([
      submit({ character: 'furnia', mainStats: { sands: 'crit_rate' } }),
      submit({ character: 'diluc' }),
      submit({ character: 'diluc', weapon: "wolf's_gravestone" }),
    ]);
    const r = await services.translateSpec(client, 'Diluc with a claymore');
    expect(r.attempts).toBe(3);
    expect(requests[1].messages.at(-1)!.content).toMatch(
      /^error: the spec has 2 problems:\n- character: unknown character "furnia"; did you mean "furina"\?\n- mainStats\.sands: a sands can't have crit_rate/,
    );
    expect(requests[2].messages.at(-1)!.content).toMatch(
      /- weapon: Diluc isn't in the account; name a weapon to build them with/,
    );
  });

  it('a model that answers in text is told to call the tool', async () => {
    const { client, requests } = fakeModel([
      () => ({ text: 'Furina wants Golden Troupe.' }),
      submit({ character: 'furina' }),
    ]);
    const r = await services.translateSpec(client, 'Furina?');
    expect(r.attempts).toBe(2);
    expect(requests[1].messages.slice(-2)).toEqual([
      { role: 'assistant', content: 'Furina wants Golden Troupe.' },
      {
        role: 'user',
        content: `Call ${SUBMIT_SPEC} with the spec; don't answer in text.`,
      },
    ]);
  });

  it('gives up after three tries with the last problems, never running anything', async () => {
    const bad = submit({ character: 'nobody' });
    const { client, requests } = fakeModel([bad, bad, bad, bad]);
    await expect(services.translateSpec(client, 'x')).rejects.toMatchObject({
      status: 422,
      code: 'not_understood',
      message: expect.stringMatching(
        /fake couldn't turn the request into a valid spec in 3 tries: character: unknown character "nobody"/,
      ),
      issues: [{ path: 'character', message: 'unknown character "nobody"' }],
    });
    expect(requests).toHaveLength(3);
  });
});

describe('the translator prompt and tool', () => {
  it('names the stat keys, the characters and the sets, and the schema without version', () => {
    const prompt = translatorPrompt({
      characters: [{ key: 'furina', name: 'Furina' }],
      sets: [{ key: 'GoldenTroupe', name: 'Golden Troupe' }],
    });
    expect(prompt).toMatch(
      /Characters \(key and name; one the account lacks needs a weapon named\): furina \(Furina\)\./,
    );
    expect(prompt).toMatch(/Artifact sets: GoldenTroupe \(Golden Troupe\)\./);
    expect(prompt).toMatch(/er_pct, crit_rate, crit_dmg/);
    const tool = submitSpecTool();
    expect(tool.parameters).toMatchObject({
      type: 'object',
      required: ['character'],
      additionalProperties: false,
    });
    expect(tool.parameters).not.toHaveProperty('$schema');
    expect(
      (tool.parameters as { properties: object }).properties,
    ).not.toHaveProperty('version');
    expect(
      (tool.parameters as { properties: { buildLevel: object } }).properties
        .buildLevel,
    ).toMatchObject({ enum: [1, 20, 40, 50, 60, 70, 80, 90] });
  });
});

describe('/spec routes', () => {
  const H = { host: 'localhost' };
  const post = (
    app: ReturnType<typeof buildApp>,
    url: string,
    payload: object,
  ) => app.inject({ method: 'POST', url, headers: H, payload });

  it('check summarises without running; run searches; both refuse a bad spec with every issue', async () => {
    const app = buildApp({ db });
    const spec = { character: 'neuvillette', set: { kind: 'any' } };
    const checked = await post(app, '/spec/check', { spec });
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({
      understood: expect.stringMatching(/^I understood: build Neuvillette/),
      request: { characterKey: 'neuvillette' },
    });
    expect(checked.json()).not.toHaveProperty('builds');
    const ran = await post(app, '/spec/run', { spec, topK: 2 });
    expect(ran.statusCode).toBe(200);
    expect(ran.json()).toMatchObject({
      status: 'ok',
      understood: checked.json().understood,
    });
    expect(ran.json().builds).toHaveLength(2);
    const bad = await post(app, '/spec/run', {
      spec: { character: 'nobody', minStats: { energy: 1 } },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({
      error: 'invalid_spec',
      issues: [
        {
          path: 'minStats.energy',
          message: expect.stringMatching(/^unknown stat "energy"/),
        },
      ],
    });
    await app.close();
  });

  it('an infeasible run says why, and what to relax', async () => {
    const app = buildApp({ db });
    const floor = (
      await post(app, '/spec/run', {
        spec: {
          character: 'neuvillette',
          set: { kind: 'any' },
          minStats: { er_pct: 400 },
        },
      })
    ).json();
    expect(floor.status).toBe('infeasible');
    expect(floor.why).toEqual([
      expect.stringMatching(
        /^Energy Recharge at least 400 is out of reach: no build under these conditions can pass \d+\.\d\. Lower it, or relax the set or main stats\.$/,
      ),
    ]);
    const lock = (
      await post(app, '/spec/run', {
        spec: { character: 'neuvillette', mainStats: { circlet: 'healing' } },
      })
    ).json();
    expect(lock.why).toEqual([
      'You own no circlet with a Healing Bonus main stat. Drop that main stat (mainStats {"slot": "any"}) or allow more pieces.',
    ]);
    await app.close();
  });

  it('translate needs a model, and returns the summary and the spec', async () => {
    const none = buildApp({ db });
    expect(
      (await post(none, '/spec/translate', { text: ASK })).statusCode,
    ).toBe(503);
    await none.close();
    const { client } = fakeModel([
      submit({ character: 'furina', minStats: { er_pct: 180 } }),
    ]);
    const app = buildApp({ db, llmClient: client });
    const r = await post(app, '/spec/translate', { text: ASK });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      attempts: 1,
      spec: { character: 'furina', minStats: { er_pct: 180 } },
      understood: expect.stringMatching(/Energy Recharge at least 180%\.$/),
    });
    await app.close();
  });
});
