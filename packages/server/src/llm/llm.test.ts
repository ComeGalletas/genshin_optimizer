import { readFileSync } from 'node:fs';
import {
  describeLlm,
  LlmConfigError,
  LlmConfigFile,
  resolveLlmConfig,
  type LlmConfig,
} from './config';
import { checkLlm } from './check';
import { openStore } from '../store/store';
import { buildApp } from '../api/app';

const KEY = 'sk-ant-test-1234567890';

describe('config/llm.json', () => {
  it('the committed file is valid', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL('../../../../config/llm.json', import.meta.url),
        'utf8',
      ),
    );
    expect(LlmConfigFile.safeParse(raw).success).toBe(true);
  });

  it('fills provider defaults and reads the key from the environment', () => {
    const c = resolveLlmConfig(
      { provider: 'anthropic', model: 'claude-sonnet-5' },
      { ANTHROPIC_API_KEY: KEY },
    );
    expect(c).toMatchObject({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      keyVar: 'ANTHROPIC_API_KEY',
      timeoutMs: 120_000,
    });
    expect(c.notReady).toBeUndefined();
    expect(
      resolveLlmConfig(
        { provider: 'ollama', model: 'qwen3:8b', baseUrl: 'http://box:11434/' },
        {},
      ).baseUrl,
    ).toBe('http://box:11434');
  });

  it('is not ready without a required key, and says why', () => {
    const c = resolveLlmConfig(
      { provider: 'anthropic', model: 'claude-sonnet-5' },
      {},
    );
    expect(c.notReady).toMatch(/ANTHROPIC_API_KEY is not set/);
    // A key is optional for OpenAI-compatible servers.
    expect(
      resolveLlmConfig({ provider: 'openai_compatible', model: 'm' }, {})
        .notReady,
    ).toBeUndefined();
  });

  it('refuses a secret in the file, and anything malformed', () => {
    expect(() =>
      resolveLlmConfig({ provider: 'anthropic', model: 'x', apiKey: KEY }, {}),
    ).toThrow(/API keys go in \.env/);
    expect(() =>
      resolveLlmConfig({ provider: 'gemini', model: 'x' }, {}),
    ).toThrow(LlmConfigError);
    expect(() =>
      resolveLlmConfig(
        { provider: 'ollama', model: 'x', baseUrl: 'file:///etc' },
        {},
      ),
    ).toThrow(/baseUrl/);
  });

  it('never describes the key itself', () => {
    const c = resolveLlmConfig(
      { provider: 'anthropic', model: 'claude-sonnet-5' },
      { ANTHROPIC_API_KEY: KEY },
    );
    const d = describeLlm(c);
    expect(JSON.stringify(d)).not.toContain(KEY);
    expect(d).toMatchObject({ apiKey: 'set', ready: true });
  });
});

describe('checkLlm', () => {
  const fake = (
    status: number,
    body: unknown,
    seen: { url?: string; headers?: unknown }[] = [],
  ) =>
    (async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
  const cfg = (raw: object, env: Record<string, string> = {}): LlmConfig =>
    resolveLlmConfig(raw, env);

  it('finds an Ollama model, or says how to pull it', async () => {
    const c = cfg({ provider: 'ollama', model: 'qwen3:8b' });
    expect(
      (await checkLlm(c, fake(200, { models: [{ name: 'qwen3:8b' }] }))).ok,
    ).toBe(true);
    const miss = await checkLlm(
      c,
      fake(200, { models: [{ name: 'llama3.1:8b' }] }),
    );
    expect(miss).toMatchObject({ ok: false, available: ['llama3.1:8b'] });
    expect(miss.detail).toMatch(/ollama pull qwen3:8b/);
    // An untagged name means :latest.
    expect(
      (
        await checkLlm(
          cfg({ provider: 'ollama', model: 'mistral' }),
          fake(200, { models: [{ name: 'mistral:latest' }] }),
        )
      ).ok,
    ).toBe(true);
  });

  it('asks Anthropic about the model with the key in a header only', async () => {
    const seen: { url?: string; headers?: unknown }[] = [];
    const c = cfg(
      { provider: 'anthropic', model: 'claude-sonnet-5' },
      { ANTHROPIC_API_KEY: KEY },
    );
    const ok = await checkLlm(c, fake(200, {}, seen));
    expect(ok.ok).toBe(true);
    expect(seen[0].url).toBe(
      'https://api.anthropic.com/v1/models/claude-sonnet-5',
    );
    expect(seen[0].headers).toMatchObject({ 'x-api-key': KEY });
    expect((await checkLlm(c, fake(401, {}))).detail).toMatch(
      /refused the key/,
    );
    expect((await checkLlm(c, fake(404, {}))).detail).toMatch(/no model/);
    expect(JSON.stringify(await checkLlm(c, fake(401, {})))).not.toContain(KEY);
  });

  it('lists an OpenAI-compatible server’s models', async () => {
    const c = cfg({ provider: 'openai_compatible', model: 'local-model' });
    expect(
      (await checkLlm(c, fake(200, { data: [{ id: 'local-model' }] }))).ok,
    ).toBe(true);
    expect(
      (await checkLlm(c, fake(200, { data: [{ id: 'other' }] }))).available,
    ).toEqual(['other']);
  });

  it('reports an unreachable provider and a missing key without calling', async () => {
    const down = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(
      (await checkLlm(cfg({ provider: 'ollama', model: 'x' }), down)).detail,
    ).toMatch(/can't reach .*ECONNREFUSED/);
    const seen: unknown[] = [];
    const noKey = await checkLlm(
      cfg({ provider: 'anthropic', model: 'claude-sonnet-5' }),
      fake(200, {}, seen as never),
    );
    expect(noKey.ok).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe('GET /llm', () => {
  it('describes the model, never the key', async () => {
    const llm = resolveLlmConfig(
      { provider: 'anthropic', model: 'claude-sonnet-5' },
      { ANTHROPIC_API_KEY: KEY },
    );
    const app = buildApp({ db: openStore(':memory:'), llm });
    const r = await app.inject({
      method: 'GET',
      url: '/llm',
      headers: { host: 'localhost' },
    });
    expect(r.json()).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      apiKey: 'set',
    });
    expect(r.body).not.toContain(KEY);
    await app.close();
  });
});
