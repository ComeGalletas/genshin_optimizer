import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  probeServer,
  serverJson,
  SERVER_URL,
  UNREADABLE_REPLY,
  withArrays,
} from './client';
import { useServer } from './status';

/** A fake fetch answering by path: a status and a JSON body each. */
function serve(routes: Record<string, [number, unknown]>) {
  const f = vi.fn(async (url: string) => {
    const path = url.slice(SERVER_URL.length);
    const hit = routes[path];
    if (!hit) throw new TypeError('fetch failed');
    return { ok: hit[0] === 200, status: hit[0], json: async () => hit[1] };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

const LLM = { provider: 'ollama', model: 'qwen3:8b', ready: true };

afterEach(() => {
  vi.unstubAllGlobals();
  useServer.setState({ status: 'checking', llm: null, reason: undefined });
});

describe('serverJson', () => {
  it('defaults to the server on 127.0.0.1:5198', () => {
    expect(SERVER_URL).toBe('http://127.0.0.1:5198');
  });

  it('says the server is unreachable, or too slow, in words', async () => {
    serve({});
    await expect(serverJson('/health')).rejects.toThrow(
      "the local server isn't reachable at http://127.0.0.1:5198",
    );
    // A fetch that only ends when the request is aborted.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          ),
      ),
    );
    await expect(serverJson('/health', { timeoutMs: 20 })).rejects.toThrow(
      "didn't answer within 0.02 s",
    );
  });

  it('passes the server’s own message on, with the status', async () => {
    serve({ '/x': [404, { error: 'not_found', message: 'no such thing' }] });
    await expect(serverJson('/x')).rejects.toMatchObject({
      message: 'no such thing',
      status: 404,
    });
  });
  it('refuses a success it can’t read: not JSON, or not the shape asked for (QA M1)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      })),
    );
    await expect(serverJson('/imports')).rejects.toMatchObject({
      message: UNREADABLE_REPLY,
      status: 200,
    });
    serve({
      '/imports': [200, []],
      '/ok': [200, { snapshots: [], merges: [] }],
    });
    const shape = withArrays('snapshots', 'merges');
    await expect(
      serverJson('/imports', { expect: shape }),
    ).rejects.toMatchObject({ message: UNREADABLE_REPLY });
    await expect(serverJson('/ok', { expect: shape })).resolves.toEqual({
      snapshots: [],
      merges: [],
    });
  });
});

describe('probeServer', () => {
  it('reports the server and its model', async () => {
    serve({
      '/health': [200, { ok: true, gameVersion: '7.1' }],
      '/llm': [200, LLM],
    });
    expect(await probeServer()).toEqual({
      online: true,
      gameVersion: '7.1',
      llm: LLM,
    });
  });

  it('is online without a model when none is configured', async () => {
    serve({
      '/health': [200, { ok: true }],
      '/llm': [404, { error: 'not_found' }],
    });
    expect(await probeServer()).toEqual({ online: true, llm: null });
  });

  it('is offline, with the reason, when nothing answers', async () => {
    serve({});
    expect(await probeServer()).toMatchObject({
      online: false,
      reason: expect.stringMatching(/isn't reachable/),
    });
  });
});

describe('useServer', () => {
  it('records the probe, sharing one request between overlapping checks', async () => {
    const f = serve({
      '/health': [200, { ok: true }],
      '/llm': [200, LLM],
    });
    const { check } = useServer.getState();
    await Promise.all([check(), check()]);
    expect(f).toHaveBeenCalledTimes(2); // one /health, one /llm
    expect(useServer.getState()).toMatchObject({
      status: 'online',
      llm: LLM,
    });
  });

  it('keeps the last state while re-checking, then goes offline', async () => {
    useServer.setState({ status: 'online', llm: LLM });
    serve({});
    const pending = useServer.getState().check();
    expect(useServer.getState().status).toBe('online');
    await pending;
    expect(useServer.getState()).toMatchObject({
      status: 'offline',
      llm: null,
      reason: expect.stringMatching(/isn't reachable/),
    });
  });
});
