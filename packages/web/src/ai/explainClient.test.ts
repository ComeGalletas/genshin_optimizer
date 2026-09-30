import { describe, it, expect, vi, afterEach } from 'vitest';
import { explainBuild } from './explainClient';
import type { ExplainPayload } from '@genshin-build-lab/engine/explain/explain';

const payload: ExplainPayload = {
  characterKey: 'furina',
  objective: 'crit_value',
  totals: { hp: 30000 },
  gap: { feasibility: [], shortfalls: [], action: null },
};

afterEach(() => vi.unstubAllGlobals());

describe('explainBuild', () => {
  it('POSTs the payload and returns the explanation', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ explanation: 'Strong build.' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await explainBuild(payload);
    expect(text).toBe('Strong build.');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5198/explain',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.characterKey).toBe('furina');
  });

  it('throws on a non-OK response, with the server’s reason when it gives one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    await expect(explainBuild(payload)).rejects.toThrow(/answered 500/);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 504,
        json: async () => ({
          error: 'llm_timeout',
          message: "qwen3:8b didn't answer within 120 s",
        }),
      })),
    );
    await expect(explainBuild(payload)).rejects.toThrow(
      "qwen3:8b didn't answer within 120 s",
    );
  });

  it('throws on a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ nope: 1 }) })),
    );
    await expect(explainBuild(payload)).rejects.toThrow();
  });
});
