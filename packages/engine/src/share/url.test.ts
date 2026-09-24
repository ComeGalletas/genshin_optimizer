import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { encodeBuild, decodeBuild } from './url';
import type { Artifact, BuildResult, OptimizeRequest } from '../game/types';

// Test-only: builds a share param the same way encodeBuild does (deflate +
// base64url), but from a hand-written JSON *string* rather than a real
// BuildSnapshot object — so we can splice in tokens (like `1e400`) that
// JSON.parse turns into non-finite numbers, which JSON.stringify itself can
// never produce (it serializes NaN/Infinity as `null`). Uses node:zlib
// instead of CompressionStream purely for a synchronous one-liner; it
// produces the same zlib/RFC-1950 format `inflate()` expects.
function toBase64UrlParam(json: string): string {
  const bin = deflateSync(new TextEncoder().encode(json)).toString('binary');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const request: OptimizeRequest = {
  // Real dataset keys, and a legal pairing: `isOptimizeRequest` now requires
  // both to resolve and `canEquip` to accept them, because a link the app
  // can't re-run is not a link (see the guard's own note).
  characterKey: 'raiden_shogun',
  weaponKey: 'engulfing_lightning',
  buildLevel: 90,
  constraints: { minStats: { er_pct: 200 } },
  objective: 'crit_value',
};
const build: BuildResult = {
  artifactIds: {
    flower: 'f',
    plume: 'p',
    sands: 's',
    goblet: 'g',
    circlet: 'c',
  },
  totals: { crit_rate: 60, crit_dmg: 120 },
  objectiveValue: 240,
  score: 240,
  diagnostics: {
    bindingConstraints: [],
    marginalBySlot: {},
    explored: 0,
    pruned: 0,
  },
};
const artifacts: Artifact[] = [
  {
    id: 'f',
    setKey: 'EmblemOfSeveredFate',
    slot: 'flower',
    rarity: 5,
    level: 20,
    mainStat: 'hp',
    mainStatValue: 4780,
    subStats: [{ key: 'crit_dmg', value: 14 }],
  },
  {
    id: 'p',
    setKey: 'EmblemOfSeveredFate',
    slot: 'plume',
    rarity: 5,
    level: 20,
    mainStat: 'atk',
    mainStatValue: 311,
    subStats: [],
  },
  {
    id: 's',
    setKey: 'EmblemOfSeveredFate',
    slot: 'sands',
    rarity: 5,
    level: 20,
    mainStat: 'er_pct',
    mainStatValue: 51.8,
    subStats: [],
  },
  {
    id: 'g',
    setKey: 'EmblemOfSeveredFate',
    slot: 'goblet',
    rarity: 5,
    level: 20,
    mainStat: 'elemental_dmg',
    mainStatValue: 46.6,
    subStats: [],
  },
  {
    id: 'c',
    setKey: 'NoblesseOblige',
    slot: 'circlet',
    rarity: 5,
    level: 20,
    mainStat: 'crit_rate',
    mainStatValue: 31.1,
    subStats: [{ key: 'crit_dmg', value: 14 }],
  },
];

describe('decodeBuild validation', () => {
  it('round-trips a valid snapshot unchanged', async () => {
    const out = await decodeBuild(
      await encodeBuild({ request, build, artifacts }),
    );
    expect(out).toEqual({ request, build, artifacts });
  });

  it('rejects an unknown objective', async () => {
    const bad = await encodeBuild({
      request: { ...request, objective: 'haste' as never },
      build,
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an out-of-range build level', async () => {
    const bad = await encodeBuild({
      request: { ...request, buildLevel: 999 as never },
      build,
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an unknown stat key in build.totals', async () => {
    const bad = await encodeBuild({
      request,
      build: { ...build, totals: { bogus_stat: 50 } as never },
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an artifact with an unknown slot', async () => {
    const bad = await encodeBuild({
      request,
      build,
      artifacts: [
        { ...artifacts[0], slot: 'ring' as never },
        ...artifacts.slice(1),
      ],
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an artifact with a non-stat mainStat', async () => {
    const bad = await encodeBuild({
      request,
      build,
      artifacts: [
        { ...artifacts[0], mainStat: 'luck' as never },
        ...artifacts.slice(1),
      ],
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects a non-finite numeric (NaN score)', async () => {
    const bad = await encodeBuild({
      request,
      build: { ...build, score: NaN },
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an over-long key (DoS guard)', async () => {
    const bad = await encodeBuild({
      request: { ...request, characterKey: 'x'.repeat(200) },
      build,
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an unknown stat key in constraints.minStats', async () => {
    const bad = await encodeBuild({
      request: { ...request, constraints: { minStats: { bogus: 1 } as never } },
      build,
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  // A shared request is re-runnable, so its constraints reach the optimizer.
  // meetsSetRequirement and setCeilingVector both read the union's members off
  // `kind`, so a malformed setRequirement has to die at the trust boundary.
  it.each([
    ['an unknown setRequirement kind', { kind: '3pc', setKey: 'A' }],
    ['a 4pc setRequirement with no setKey', { kind: '4pc' }],
    [
      'a 4pc setRequirement with a non-string setKey',
      { kind: '4pc', setKey: 7 },
    ],
    ['a 2+2 setRequirement with one key', { kind: '2+2', setKeys: ['A'] }],
    [
      'a 2+2 setRequirement naming the same set twice',
      {
        kind: '2+2',
        setKeys: ['A', 'A'],
      },
    ],
    ['a setRequirement that is not an object', 'EmblemOfSeveredFate'],
  ])('rejects %s', async (_label, setRequirement) => {
    const bad = await encodeBuild({
      request: { ...request, constraints: { setRequirement } as never },
      build,
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('accepts a well-formed 2+2 setRequirement', async () => {
    const ok = await encodeBuild({
      request: {
        ...request,
        constraints: { setRequirement: { kind: '2+2', setKeys: ['A', 'B'] } },
      },
      build,
      artifacts,
    });
    expect(await decodeBuild(ok)).not.toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an out-of-range critRatioTarget', async () => {
    const bad = await encodeBuild({
      request: { ...request, constraints: { critRatioTarget: 42 } },
      build,
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects mainStatLocks with an unknown slot or stat', async () => {
    for (const locks of [{ helmet: 'crit_rate' }, { sands: 'bogus' }]) {
      const bad = await encodeBuild({
        request: { ...request, constraints: { mainStatLocks: locks } as never },
        build,
        artifacts,
      });
      expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
    }
  });

  it('rejects an artifact carrying duplicate sub-stat keys', async () => {
    const bad = await encodeBuild({
      request,
      build,
      artifacts: artifacts.map((a) =>
        a.id === 'f'
          ? {
              ...a,
              subStats: [
                { key: 'crit_rate' as const, value: 3 },
                { key: 'crit_rate' as const, value: 4 },
              ],
            }
          : a,
      ),
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an artifact whose sub-stat duplicates its main stat', async () => {
    const bad = await encodeBuild({
      request,
      build,
      artifacts: artifacts.map((a) =>
        a.id === 'f'
          ? { ...a, subStats: [{ key: 'hp' as const, value: 3 }] }
          : a,
      ),
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects when artifactIds reference an artifact not carried in the snapshot', async () => {
    const bad = await encodeBuild({
      request,
      build: {
        ...build,
        artifactIds: { ...build.artifactIds, flower: 'missing' },
      },
      artifacts,
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an artifact rarity that overflows to Infinity', async () => {
    // JSON's number grammar allows `1e400`; JSON.parse evaluates it to
    // Infinity since it overflows a float64 — a valid JSON payload
    // JSON.stringify itself could never produce (NaN/Infinity serialize
    // to `null`), so this has to be spliced into raw JSON text.
    const snapshot = { request, build, artifacts };
    const json = JSON.stringify(snapshot).replace(
      `"rarity":${artifacts[0].rarity}`,
      '"rarity":1e400',
    );
    expect(await decodeBuild(toBase64UrlParam(json))).toEqual({
      error: 'UNREADABLE',
    });
  });

  it('rejects a diagnostics object missing the fields the card reads', async () => {
    // `diagnostics: {}` used to sail through — the guard only checked that it
    // was an object, and BuildCard then destructured undefined fields out of it.
    const json = JSON.stringify({
      request,
      build: { ...build, diagnostics: {} },
      artifacts,
    });
    expect(await decodeBuild(toBase64UrlParam(json))).toEqual({
      error: 'UNREADABLE',
    });
  });

  it('rejects marginalBySlot entries that are not a slot, or not a finite number', async () => {
    for (const marginalBySlot of [
      { notASlot: 1 },
      { flower: 'lots' },
      { flower: null },
    ]) {
      const json = JSON.stringify({
        request,
        build: {
          ...build,
          diagnostics: { ...build.diagnostics, marginalBySlot },
        },
        artifacts,
      });
      expect(await decodeBuild(toBase64UrlParam(json))).toEqual({
        error: 'UNREADABLE',
      });
    }
  });

  it('rejects bindingConstraints that are not bounded strings', async () => {
    for (const bindingConstraints of [
      'one constraint',
      [42],
      ['a'.repeat(301)],
      Array.from({ length: 33 }, (_, i) => `c${i}`),
    ]) {
      const json = JSON.stringify({
        request,
        build: {
          ...build,
          diagnostics: { ...build.diagnostics, bindingConstraints },
        },
        artifacts,
      });
      expect(await decodeBuild(toBase64UrlParam(json))).toEqual({
        error: 'UNREADABLE',
      });
    }
  });

  it('still decodes a fully-populated diagnostics payload', async () => {
    const param = await encodeBuild({
      request,
      build: {
        ...build,
        diagnostics: {
          bindingConstraints: ['Energy Recharge ≥ 200 (build has 214.0)'],
          marginalBySlot: {
            flower: 1,
            plume: 2,
            sands: 3,
            goblet: 4,
            circlet: 5,
          },
          explored: 10,
          pruned: 3,
        },
      },
      artifacts,
    });
    const out = await decodeBuild(param);
    expect(out).not.toHaveProperty('error');
    if (!('error' in out))
      expect(out.build.diagnostics.marginalBySlot.goblet).toBe(4);
  });

  it('rejects a share param whose decompressed payload exceeds the size cap (decompression-bomb guard)', async () => {
    // diagnostics is intentionally not deep-validated (see parseBuildSnapshot's
    // comment) — so a huge field hidden there is otherwise a validly-shaped
    // snapshot that would sail through undetected without a decompression cap.
    const snapshot = {
      request,
      build: {
        ...build,
        diagnostics: { ...build.diagnostics, junk: 'a'.repeat(3_000_000) },
      },
      artifacts,
    };
    const json = JSON.stringify(snapshot);
    expect(await decodeBuild(toBase64UrlParam(json))).toEqual({
      error: 'UNREADABLE',
    });
  });
});

describe('share url', () => {
  it('round-trips a self-contained build snapshot (request, build, full artifacts)', async () => {
    const param = await encodeBuild({ request, build, artifacts });
    const out = await decodeBuild(param);
    expect(out).not.toHaveProperty('error');
    if (!('error' in out)) {
      expect(out.request.characterKey).toBe('raiden_shogun');
      expect(out.request.buildLevel).toBe(90);
      expect(out.build.objectiveValue).toBe(240);
      // the five full artifacts survive the round-trip (ADR-0005 self-contained)
      expect(out.artifacts).toHaveLength(5);
      expect(out.artifacts[2].mainStat).toBe('er_pct');
      expect(out.artifacts[0].subStats).toContainEqual({
        key: 'crit_dmg',
        value: 14,
      });
    }
  });

  it('returns UNREADABLE for garbage input instead of throwing', async () => {
    expect(await decodeBuild('not-valid-base64!!')).toEqual({
      error: 'UNREADABLE',
    });
  });

  it('returns UNREADABLE for an empty string', async () => {
    expect(await decodeBuild('')).toEqual({ error: 'UNREADABLE' });
  });

  it('returns UNREADABLE for valid JSON of the wrong shape', async () => {
    const param = await encodeBuild({} as never);
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });
});

describe('element field (ADR-0014)', () => {
  it('round-trips an artifact with element set', async () => {
    const withElement: Artifact[] = [
      { ...artifacts[3], element: 'hydro' },
      ...artifacts.slice(0, 3),
      artifacts[4],
    ];
    const param = await encodeBuild({
      request,
      build,
      artifacts: withElement,
    });
    const out = await decodeBuild(param);
    expect(out).not.toHaveProperty('error');
    if (!('error' in out)) {
      const goblet = out.artifacts.find((a) => a.slot === 'goblet');
      expect(goblet?.element).toBe('hydro');
    }
  });

  it('round-trips an artifact without element (old links stay valid)', async () => {
    const param = await encodeBuild({ request, build, artifacts });
    const out = await decodeBuild(param);
    expect(out).not.toHaveProperty('error');
    if (!('error' in out)) {
      const goblet = out.artifacts.find((a) => a.slot === 'goblet');
      expect(goblet?.element).toBeUndefined();
    }
  });

  it('rejects an artifact with an invalid element value', async () => {
    const bad = await encodeBuild({
      request,
      build,
      artifacts: [
        { ...artifacts[3], element: 'fire' as never },
        ...artifacts.slice(0, 3),
        artifacts[4],
      ],
    });
    expect(await decodeBuild(bad)).toEqual({ error: 'UNREADABLE' });
  });
});

describe('a shared link must describe a build the app can re-run', () => {
  it('rejects a character/weapon pair the character cannot equip', async () => {
    // Nahida is a catalyst user; The Catch is a polearm. `baseStats` would
    // happily build the pair and the recipient would be shown a "proven
    // optimal" result around a weapon that character can never hold.
    const param = await encodeBuild({
      request: { ...request, characterKey: 'nahida', weaponKey: 'the_catch' },
      build,
      artifacts,
    });
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });

  it.each(['characterKey', 'weaponKey'])(
    'rejects a %s the frozen dataset does not carry',
    async (field) => {
      const param = await encodeBuild({
        request: { ...request, [field]: 'not_in_the_snapshot' },
        build,
        artifacts,
      });
      expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
    },
  );

  it('rejects a payload whose five ids all resolve to one circlet', async () => {
    // The old check asked only whether each id existed *somewhere* in the
    // array, so five references to one circlet passed and the recipient was
    // shown that circlet under all five slot headings.
    const circlet = artifacts.find((a) => a.slot === 'circlet')!;
    const param = await encodeBuild({
      request,
      build: {
        ...build,
        artifactIds: {
          flower: circlet.id,
          plume: circlet.id,
          sands: circlet.id,
          goblet: circlet.id,
          circlet: circlet.id,
        },
      },
      artifacts: [circlet],
    });
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects a payload carrying two pieces for the same slot', async () => {
    const circlet = artifacts.find((a) => a.slot === 'circlet')!;
    const param = await encodeBuild({
      request,
      build,
      artifacts: [...artifacts, { ...circlet, id: 'circlet-2' }],
    });
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects a build whose artifactIds is not an object', async () => {
    const param = await encodeBuild({
      request,
      build: { ...build, artifactIds: 'flower' as never },
      artifacts,
    });
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects diagnostics whose marginalBySlot is not an object', async () => {
    const param = await encodeBuild({
      request,
      build: {
        ...build,
        diagnostics: { ...build.diagnostics, marginalBySlot: 'x' as never },
      },
      artifacts,
    });
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });

  it('rejects an objectiveValue that overflows to Infinity', async () => {
    // Same `1e400` trick as the artifact-rarity case above: `objectiveValue`
    // is a `number` per JSON's grammar, but not a finite one — a shape
    // `encodeBuild`'s own JSON.stringify could never produce.
    const snapshot = { request, build, artifacts };
    const json = JSON.stringify(snapshot).replace(
      `"objectiveValue":${build.objectiveValue}`,
      '"objectiveValue":1e400',
    );
    expect(await decodeBuild(toBase64UrlParam(json))).toEqual({
      error: 'UNREADABLE',
    });
  });

  it('rejects a snapshot carrying more artifacts than a build can reference (DoS guard)', async () => {
    const circlet = artifacts.find((a) => a.slot === 'circlet')!;
    const extra = Array.from({ length: 20 }, (_, i) => ({
      ...circlet,
      id: `extra-${i}`,
    }));
    const param = await encodeBuild({
      request,
      build,
      artifacts: [...artifacts, ...extra],
    });
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });
});

describe('decodeBuild tampered/malformed link decode path', () => {
  it('returns UNREADABLE for a corrupted (non-deflate) payload segment', async () => {
    // A share param whose base64url decodes fine but whose bytes are not a
    // valid deflate stream at all (tampered/truncated in transit).
    const good = await encodeBuild({ request, build, artifacts });
    const tampered = good.slice(0, -6) + 'AAAAAA';
    expect(await decodeBuild(tampered)).toEqual({ error: 'UNREADABLE' });
  });

  it('returns UNREADABLE for a valid-shape payload with an out-of-range value', async () => {
    // Same envelope, but the request references a slot key that doesn't
    // exist in the game's SLOTS enum.
    const param = await encodeBuild({
      request: {
        ...request,
        constraints: {
          ...request.constraints,
          mainStatLocks: { flower: 'hp', unknown_slot: 'atk' } as never,
        },
      },
      build,
      artifacts,
    });
    expect(await decodeBuild(param)).toEqual({ error: 'UNREADABLE' });
  });
});
