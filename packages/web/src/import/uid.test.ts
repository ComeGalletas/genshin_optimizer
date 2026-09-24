import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUidArtifacts } from './uid';
import type { Artifact } from '@genshin-build-lab/engine/game/types';

afterEach(() => vi.restoreAllMocks());

describe('fetchUidArtifacts', () => {
  it('returns NO_SHOWCASE when avatarInfoList is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ playerInfo: {} }),
      }),
    );
    const r = await fetchUidArtifacts('700000000');
    expect(r).toEqual({ error: 'NO_SHOWCASE' });
  });

  it('returns NOT_FOUND on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const r = await fetchUidArtifacts('123');
    expect(r).toEqual({ error: 'NOT_FOUND' });
  });

  it('maps equipped reliquaries to artifacts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          avatarInfoList: [
            {
              equipList: [
                {
                  reliquary: { level: 21 },
                  flat: {
                    itemType: 'ITEM_RELIQUARY',
                    equipType: 'EQUIP_BRACER',
                    rankLevel: 5,
                    setNameTextMapHash: 'x',
                    reliquaryMainstat: {
                      mainPropId: 'FIGHT_PROP_HP',
                      statValue: 4780,
                    },
                    reliquarySubstats: [
                      { appendPropId: 'FIGHT_PROP_CRITICAL', statValue: 7 },
                    ],
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
    const r = await fetchUidArtifacts('123');
    expect(Array.isArray(r)).toBe(true);
  });

  /** Stub a successful Enka response carrying `avatarInfoList`. */
  function stubAvatars(avatarInfoList: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ avatarInfoList }),
      }),
    );
  }

  /** A well-formed showcase reliquary, with `flat` overridable per test. */
  const reliquary = (flat: Record<string, unknown> = {}) => ({
    avatarInfoList: [
      {
        equipList: [
          {
            reliquary: { level: 21 },
            flat: {
              itemType: 'ITEM_RELIQUARY',
              equipType: 'EQUIP_BRACER',
              rankLevel: 5,
              setNameTextMapHash: 'x',
              reliquaryMainstat: {
                mainPropId: 'FIGHT_PROP_HP',
                statValue: 4780,
              },
              reliquarySubstats: [
                { appendPropId: 'FIGHT_PROP_CRITICAL', statValue: 7 },
              ],
              ...flat,
            },
          },
        ],
      },
    ],
  });

  // Enka's payload is third-party JSON — a null or primitive at any level of
  // the nesting must be skipped, not thrown on.
  it.each([
    ['a null avatar entry', [null]],
    ['a primitive avatar entry', [5]],
    ['a non-array equipList', [{ equipList: 'nope' }]],
    ['a null equip entry', [{ equipList: [null] }]],
    ['a null flat', [{ equipList: [{ flat: null }] }]],
    [
      'a non-array reliquarySubstats',
      [
        {
          equipList: [
            {
              flat: {
                itemType: 'ITEM_RELIQUARY',
                equipType: 'EQUIP_BRACER',
                reliquaryMainstat: { mainPropId: 'FIGHT_PROP_HP' },
                reliquarySubstats: 'nope',
              },
            },
          ],
        },
      ],
    ],
    [
      'a null reliquarySubstats element',
      [
        {
          equipList: [
            {
              flat: {
                itemType: 'ITEM_RELIQUARY',
                equipType: 'EQUIP_BRACER',
                reliquaryMainstat: { mainPropId: 'FIGHT_PROP_HP' },
                reliquarySubstats: [null],
              },
            },
          ],
        },
      ],
    ],
  ])('tolerates %s instead of throwing', async (_label, avatars) => {
    stubAvatars(avatars);
    const r = await fetchUidArtifacts('123');
    expect(Array.isArray(r)).toBe(true);
  });

  it('drops a sub-stat with a non-finite value, keeping the rest of the piece', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          reliquary({
            reliquarySubstats: [
              { appendPropId: 'FIGHT_PROP_CRITICAL', statValue: 7 },
              { appendPropId: 'FIGHT_PROP_CRITICAL_HURT', statValue: NaN },
            ],
          }),
      }),
    );
    const r = await fetchUidArtifacts('123');
    expect(r).toHaveLength(1);
    expect((r as Artifact[])[0].subStats).toEqual([
      { key: 'crit_rate', value: 7 },
    ]);
  });

  it('drops a sub-stat duplicating the main stat and caps sub-stats at 4', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          reliquary({
            reliquarySubstats: [
              { appendPropId: 'FIGHT_PROP_HP', statValue: 100 }, // == main stat
              { appendPropId: 'FIGHT_PROP_CRITICAL', statValue: 7 },
              { appendPropId: 'FIGHT_PROP_CRITICAL_HURT', statValue: 14 },
              { appendPropId: 'FIGHT_PROP_ATTACK', statValue: 18 },
              { appendPropId: 'FIGHT_PROP_DEFENSE', statValue: 21 },
              { appendPropId: 'FIGHT_PROP_ELEMENT_MASTERY', statValue: 40 },
            ],
          }),
      }),
    );
    const r = await fetchUidArtifacts('123');
    expect(r).toHaveLength(1);
    const subs = (r as Artifact[])[0].subStats;
    expect(subs).toHaveLength(4);
    expect(subs.map((s) => s.key)).not.toContain('hp');
  });

  it('returns NETWORK when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const r = await fetchUidArtifacts('123');
    expect(r).toEqual({ error: 'NETWORK' });
  });

  it('returns NETWORK when the response body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token in JSON');
        },
      }),
    );
    const r = await fetchUidArtifacts('123');
    expect(r).toEqual({ error: 'NETWORK' });
  });

  it('skips non-reliquary equip items (e.g. weapons)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          avatarInfoList: [
            { equipList: [{ flat: { itemType: 'ITEM_WEAPON' } }] },
          ],
        }),
      }),
    );
    const r = await fetchUidArtifacts('123');
    // Showcase present but no reliquaries → empty list, not an error.
    expect(r).toEqual([]);
  });
});

describe('fetchUidArtifacts rarity and set key', () => {
  const piece = (flat: Record<string, unknown>) => ({
    avatarInfoList: [
      {
        equipList: [
          {
            reliquary: { level: 21 },
            flat: {
              itemType: 'ITEM_RELIQUARY',
              equipType: 'EQUIP_BRACER',
              setNameTextMapHash: '1234567890',
              reliquaryMainstat: {
                mainPropId: 'FIGHT_PROP_HP',
                statValue: 4780,
              },
              reliquarySubstats: [],
              ...flat,
            },
          },
        ],
      },
    ],
  });

  const fetchOnce = (body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
    );

  it('keeps a 4★ piece at its own rarity', async () => {
    fetchOnce(piece({ rankLevel: 4 }));
    const out = await fetchUidArtifacts('700000000');
    expect(Array.isArray(out) && out[0].rarity).toBe(4);
  });

  // `mainStatValue` indexes the dataset's per-rarity curves, so defaulting a
  // missing rankLevel to 5 invented a stat value Enka never reported.
  it.each([[undefined], [3], ['5'], [NaN]])(
    'skips a piece whose rankLevel is %s rather than assuming 5',
    async (rankLevel) => {
      fetchOnce(piece({ rankLevel }));
      expect(await fetchUidArtifacts('700000000')).toEqual([]);
    },
  );

  it('skips a piece whose set-name hash exceeds the shared key bound', async () => {
    fetchOnce(piece({ rankLevel: 5, setNameTextMapHash: 'x'.repeat(200) }));
    expect(await fetchUidArtifacts('700000000')).toEqual([]);
  });
});
