import { readFileSync, existsSync } from 'node:fs';
import { openStore } from '../store/store';
import { gcsimPath, loadGcsimTool } from './gcsim';
import { loadGolden } from './golden';
import { readResult, type SimResult } from './result';
import { SimRunner, type SimOptions } from './runner';
import {
  poolSizing,
  READER_VERSION,
  simKey,
  SimPool,
  StoreSimCache,
  type RunsSims,
} from './pool';

const REAL: SimResult = readResult(
  JSON.parse(
    readFileSync(
      new URL('./__fixtures__/raiden-national-30.json', import.meta.url),
      'utf8',
    ),
  ),
);

/** A runner that takes `ms` per run and records what it was asked and how
 *  many runs overlapped. `fail` makes the runs for that config throw. */
function fakeRunner(ms = 20, fail?: string) {
  const calls: { config: string; options?: SimOptions }[] = [];
  let now = 0;
  let peak = 0;
  const runner: RunsSims = {
    async run(config, options) {
      calls.push({ config, options });
      peak = Math.max(peak, ++now);
      await new Promise((r) => setTimeout(r, ms));
      now--;
      if (config === fail) throw new Error('gcsim failed: no');
      return { ...REAL, iterations: options?.iterations ?? REAL.iterations };
    },
  };
  return { runner, calls, peak: () => peak };
}

const CONFIG =
  'options iteration=100 duration=90;\nactive raiden;\nraiden attack;\n';

describe('SimPool: bounded', () => {
  it('never runs more than `concurrency` at once, and runs everything', async () => {
    const f = fakeRunner(15);
    const pool = new SimPool(f.runner, 'c'.repeat(40), {
      concurrency: 3,
      workersPerRun: 5,
    });
    const configs = Array.from({ length: 12 }, (_, i) => `${CONFIG}# ${i}\n`);
    const runs = await Promise.all(configs.map((c) => pool.run(c)));
    expect(runs).toHaveLength(12);
    expect(f.calls).toHaveLength(12);
    expect(f.peak()).toBe(3);
    // Each run gets its share of the cores as gcsim workers.
    expect(f.calls.every((c) => c.options?.workers === 5)).toBe(true);
    expect(pool.stats()).toEqual({ running: 0, queued: 0 });
  });

  it('a failure frees its slot and isn’t cached; the rest carry on', async () => {
    const f = fakeRunner(5, 'bad');
    const pool = new SimPool(f.runner, 'c'.repeat(40), {
      concurrency: 1,
      cache: new StoreSimCache(openStore(':memory:')),
    });
    const [bad, good] = await Promise.allSettled([
      pool.run('bad'),
      pool.run(CONFIG),
    ]);
    expect(bad).toMatchObject({ status: 'rejected' });
    expect(good).toMatchObject({ status: 'fulfilled' });
    // Not cached: asked again, it runs again.
    await pool.run('bad').catch(() => {});
    expect(f.calls.filter((c) => c.config === 'bad')).toHaveLength(2);
  });

  it('sizes itself from the cores: up to 4 runs, the cores shared between them', () => {
    expect(poolSizing(16)).toEqual({ concurrency: 4, workersPerRun: 4 });
    expect(poolSizing(8)).toEqual({ concurrency: 2, workersPerRun: 4 });
    expect(poolSizing(2)).toEqual({ concurrency: 1, workersPerRun: 2 });
    expect(poolSizing(64)).toEqual({ concurrency: 4, workersPerRun: 16 });
  });
});

describe('SimPool: cached', () => {
  const pool = (f = fakeRunner(), commit = 'c'.repeat(40)) => {
    const db = openStore(':memory:');
    return {
      f,
      db,
      pool: new SimPool(f.runner, commit, {
        cache: new StoreSimCache(db),
        concurrency: 2,
        now: () => new Date('2026-10-05T00:00:00Z'),
      }),
    };
  };

  it('answers the same request from the cache, which survives the pool', async () => {
    const { f, db, pool: p } = pool();
    const first = await p.run(CONFIG, { iterations: 500 });
    const again = await p.run(CONFIG, { iterations: 500 });
    expect(first.cached).toBe(false);
    expect(again).toMatchObject({ cached: true, key: first.key });
    expect(again.result).toEqual(first.result);
    expect(f.calls).toHaveLength(1);
    // A new pool on the same store: still cached.
    const later = new SimPool(fakeRunner().runner, 'c'.repeat(40), {
      cache: new StoreSimCache(db),
    });
    expect((await later.run(CONFIG, { iterations: 500 })).cached).toBe(true);
    expect(
      db.prepare('SELECT iterations, created_at FROM sim_cache').get(),
    ).toEqual({ iterations: 500, created_at: '2026-10-05T00:00:00.000Z' });
  });

  it('a different run is a different key: iterations, duration, the config, the gcsim pin', async () => {
    const base = simKey(CONFIG, { iterations: 500 }, 'a'.repeat(40));
    expect(simKey(CONFIG, { iterations: 1000 }, 'a'.repeat(40))).not.toBe(base);
    expect(
      simKey(CONFIG, { iterations: 500, duration: 120 }, 'a'.repeat(40)),
    ).not.toBe(base);
    expect(
      simKey(`${CONFIG}bennett skill;\n`, { iterations: 500 }, 'a'.repeat(40)),
    ).not.toBe(base);
    expect(simKey(CONFIG, { iterations: 500 }, 'b'.repeat(40))).not.toBe(base);
    expect(READER_VERSION).toBeGreaterThan(0);
  });

  it('what doesn’t change the simulation doesn’t change the key: workers, line endings, the timeout', () => {
    const base = simKey(CONFIG, { iterations: 500 }, 'a'.repeat(40));
    expect(
      simKey(
        CONFIG,
        { iterations: 500, workers: 8, timeoutMs: 5 },
        'a'.repeat(40),
      ),
    ).toBe(base);
    expect(
      simKey(
        CONFIG.replace(/\n/g, '\r\n'),
        { iterations: 500 },
        'a'.repeat(40),
      ),
    ).toBe(base);
    // Asking for the iterations the config already has is the same run.
    expect(simKey(CONFIG, {}, 'a'.repeat(40))).toBe(
      simKey(CONFIG, { iterations: 100 }, 'a'.repeat(40)),
    );
  });

  it('two identical requests in flight share one run', async () => {
    const { f, pool: p } = pool(fakeRunner(30));
    const [a, b] = await Promise.all([p.run(CONFIG), p.run(CONFIG)]);
    expect(f.calls).toHaveLength(1);
    expect([a.cached, b.cached].sort()).toEqual([false, true]);
    expect(b.result).toEqual(a.result);
  });

  it('a new gcsim pin never reuses an old result', async () => {
    const { f, db, pool: p } = pool();
    await p.run(CONFIG);
    const newPin = new SimPool(f.runner, 'd'.repeat(40), {
      cache: new StoreSimCache(db),
    });
    expect((await newPin.run(CONFIG)).cached).toBe(false);
    expect(f.calls).toHaveLength(2);
  });
});

// Runs only where `npm run sim:check` installed the pinned binary.
const installed = (() => {
  try {
    const p = gcsimPath(loadGcsimTool());
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
})();

describe.skipIf(!installed)('SimPool over the installed gcsim', () => {
  it('runs in parallel within its bound, and answers a repeat from the cache', async () => {
    const smoke = readFileSync(
      loadGolden().find((g) => g.id === 'raiden-national-smoke')!.path,
      'utf8',
    );
    const pool = new SimPool(
      new SimRunner(installed!),
      loadGcsimTool().commit,
      {
        cache: new StoreSimCache(openStore(':memory:')),
      },
    );
    const variants = [90, 100, 110, 120].map((duration) =>
      pool.run(smoke, { iterations: 100, duration }),
    );
    const runs = await Promise.all(variants);
    expect(runs.every((r) => !r.cached && r.result.iterations === 100)).toBe(
      true,
    );
    expect(runs.map((r) => r.result.durationSec)).toEqual([90, 100, 110, 120]);
    const repeat = await pool.run(smoke, { iterations: 100, duration: 90 });
    expect(repeat.cached).toBe(true);
    expect(repeat.result.dps.mean).toBe(runs[0].result.dps.mean);
  }, 120_000);
});
