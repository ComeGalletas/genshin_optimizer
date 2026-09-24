import { describe, it, expect, vi, afterEach } from 'vitest';
import { explainBuild } from './explainClient';
import type { ExplainPayload } from './explainShared';

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
      '/api/explain',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.characterKey).toBe('furina');
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    await expect(explainBuild(payload)).rejects.toThrow();
  });

  it('throws on a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ nope: 1 }) })),
    );
    await expect(explainBuild(payload)).rejects.toThrow();
  });
});
