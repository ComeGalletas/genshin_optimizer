import { describe, it, expect, vi, afterEach } from 'vitest';
import { SERVER_URL } from './client';
import { fetchRotations } from './teamsim';

afterEach(() => vi.unstubAllGlobals());

describe('fetchRotations', () => {
  // Simulate's two sections open together: one request, not two. The answer
  // isn't kept, so the next view sees a fresh list.
  it('shares a request already out, and asks again once it is back', async () => {
    const rotations = [{ id: 'nilou-bloom' }];
    const f = vi.fn(async (url: string) => {
      expect(url).toBe(`${SERVER_URL}/rotations`);
      return { ok: true, status: 200, json: async () => ({ rotations }) };
    });
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([fetchRotations(), fetchRotations()]);
    expect(a).toEqual(rotations);
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
    await fetchRotations();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('lets the next caller retry after a failure', async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rotations: [] }),
      });
    vi.stubGlobal('fetch', f);
    await expect(fetchRotations()).rejects.toThrow(/isn't reachable/);
    await expect(fetchRotations()).resolves.toEqual([]);
  });
});
