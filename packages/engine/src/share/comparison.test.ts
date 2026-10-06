import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
  decodeComparison,
  encodeComparison,
  MAX_COMPARISON_PARAM,
  type SharedComparison,
  type SharedRun,
} from './comparison';

const param = (json: string) =>
  btoa(deflateSync(new TextEncoder().encode(json)).toString('binary'))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const member = (slot: string, character: string) => ({
  slot,
  character,
  weapon: 'favonius_sword',
  refinement: 5,
  sets: ['EmblemOfSeveredFate', 'GladiatorsFinale'],
});
/** A full run, every field the server sends. */
const run = (label: string, mean: number, extra: Partial<SharedRun> = {}) => ({
  label,
  rotation: {
    id: 'raiden-national',
    name: 'Raiden National',
    status: 'validated',
  },
  team: [
    member('raiden', 'raiden_shogun'),
    member('xiangling', 'xiangling'),
    member('yelan', 'yelan'),
    member('bennett', 'bennett'),
  ],
  enemy: { level: 100, res: 10, count: 1 },
  dps: {
    mean,
    sd: 4012.3,
    ci95: [mean - 249.1, mean + 251.7] as [number, number],
    min: mean - 15_000.4,
    q1: mean - 3000.2,
    median: mean + 500.9,
    q3: mean + 3000.1,
    max: mean + 9000.6,
  },
  fightSec: 108.21,
  characters: ['raiden_shogun', 'xiangling', 'yelan', 'bennett'].map(
    (character, i) => ({
      character,
      dps: mean * 0.25 + i,
      share: 0.25,
      fieldSec: 27.3 + i,
      energyWaitSec: i ? 0 : 1.4,
    }),
  ),
  reactions: {
    vaporize: 93.2,
    overload: 58.1,
    'crystallize-pyro': 4,
    burning: 17.5,
    electrocharged: 11,
  },
  warnings: ['insufficient_energy', 'swap_cd'],
  ...extra,
});
const vs = (pct: number) => ({
  pct,
  ci95Pct: 0.3,
  withinNoise: Math.abs(pct) < 0.3,
  text: `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% ± 0.3%`,
});
/** The largest comparison the app makes: a base and five variants. */
const SIX: Omit<SharedComparison, 'v'> = {
  iterations: 1000,
  burstWaits: 'filled with attacks',
  ms: 4231.7,
  runs: [
    run('base', 85_128),
    ...[1, 2, 3, 4, 5].map((i) =>
      run(`Variant ${i}: The Catch R5 on Raiden Shogun`, 85_000 + i * 900, {
        vsBase: vs(i - 2.5),
      }),
    ),
  ],
};

describe('shared comparisons (TODO 8.3, ADR-0051)', () => {
  it('round-trips the largest comparison the app makes, well under the cap', async () => {
    const p = (await encodeComparison(SIX))!;
    expect(p).not.toBeNull();
    const back = await decodeComparison(p);
    expect(back).toEqual({ v: 1, ...SIX, ms: 4232 });
    // The size ADR-0051 quotes: a base and five full variants.
    expect(p.length).toBeLessThan(4_000);
    expect(p.length).toBeLessThan(MAX_COMPARISON_PARAM / 4);
  });

  it('keeps only what a reader needs', async () => {
    const p = (await encodeComparison({
      ...SIX,
      runs: [{ ...run('base', 1), cached: true, secret: 'x' } as SharedRun],
    }))!;
    const back = (await decodeComparison(p)) as SharedComparison;
    expect(back.runs[0]).not.toHaveProperty('cached');
    expect(back.runs[0]).not.toHaveProperty('secret');
  });

  it('refuses what it can’t show: too many runs, wrong version, bad fields, too long', async () => {
    expect(
      await encodeComparison({ ...SIX, runs: [...SIX.runs, run('7th', 1)] }),
    ).toBeNull();
    const ok = { v: 1, ...SIX };
    for (const bad of [
      { ...ok, v: 2 },
      { ...ok, runs: [] },
      { ...ok, iterations: 0 },
      { ...ok, runs: [{ ...run('base', 1), label: 'x'.repeat(500) }] },
      {
        ...ok,
        runs: [{ ...run('base', 1), dps: { mean: 'a', sd: 1, ci95: [1, 2] } }],
      },
      {
        ...ok,
        runs: [
          { ...run('base', 1), team: [{ ...member('a', 'b'), refinement: 9 }] },
        ],
      },
      { ...ok, runs: [{ ...run('base', 1), reactions: { a: Infinity } }] },
      {
        ...ok,
        runs: [{ ...run('base', 1), vsBase: { ...vs(1), withinNoise: 'no' } }],
      },
      'a comparison',
    ])
      expect(await decodeComparison(param(JSON.stringify(bad)))).toEqual({
        error: 'UNREADABLE',
      });
    expect(await decodeComparison('not base64 at all!')).toEqual({
      error: 'UNREADABLE',
    });
    expect(
      await decodeComparison('A'.repeat(MAX_COMPARISON_PARAM + 1)),
    ).toEqual({ error: 'UNREADABLE' });
  });
});
