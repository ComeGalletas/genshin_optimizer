/**
 * Many simulations at once (TODO 5.4): a bounded pool in front of the
 * runner, and a cache of results.
 *
 * - **Bounded.** At most `concurrency` gcsim processes run at a time, the
 *   rest wait in order. gcsim is multi-threaded itself (20 workers by
 *   default), so the machine's cores are divided between the concurrent
 *   runs (`workersPerRun`) instead of every run claiming them all.
 * - **Cached.** A result is keyed by the SHA-256 of the gcsim commit, the
 *   result reader's version and the config as it runs (iterations and
 *   duration applied; the worker count left out, since it doesn't change
 *   what is simulated). The same request again is answered from the cache;
 *   a new gcsim pin or a new reader never reuses an old result.
 * - **Deduplicated.** Two identical requests in flight share one run.
 * - Failures (timeouts, refused configs) are never cached.
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import type { Store } from '../store/store';
import type { SimResult } from './result';
import { withOptions, type SimOptions } from './runner';

/** Bump when `readResult` changes what it returns, so cached results made
 *  by an older reader are not served. */
// 2: the DPS quartiles (TODO 6.2).
export const READER_VERSION = 2;

export interface CachedRun {
  result: SimResult;
  ms: number;
  createdAt: string;
}

export interface SimCache {
  get(key: string): CachedRun | undefined;
  set(
    key: string,
    entry: CachedRun & { gcsimCommit: string; iterations: number },
  ): void;
}

/** The cache in the SQLite store (migration 3). */
export class StoreSimCache implements SimCache {
  constructor(private readonly db: Store) {}
  get(key: string): CachedRun | undefined {
    const row = this.db
      .prepare(
        'SELECT result_json, ms, created_at FROM sim_cache WHERE key = ?',
      )
      .get(key) as
      { result_json: string; ms: number; created_at: string } | undefined;
    return row
      ? {
          result: JSON.parse(row.result_json) as SimResult,
          ms: row.ms,
          createdAt: row.created_at,
        }
      : undefined;
  }
  set(
    key: string,
    e: CachedRun & { gcsimCommit: string; iterations: number },
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO sim_cache
           (key, gcsim_commit, iterations, result_json, ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        key,
        e.gcsimCommit,
        e.iterations,
        JSON.stringify(e.result),
        e.ms,
        e.createdAt,
      );
  }
}

export interface PoolRun {
  result: SimResult;
  /** Answered from the cache, or from an identical run already in flight. */
  cached: boolean;
  key: string;
  /** How long the gcsim run took (for a cached result, when it ran). */
  ms: number;
}

/** What the pool needs from a runner (`SimRunner`, or a fake in tests). */
export interface RunsSims {
  run(config: string, options?: SimOptions): Promise<SimResult>;
}

/** Concurrent runs, and gcsim workers for each, for a machine's cores. */
export function poolSizing(cores = cpus().length): {
  concurrency: number;
  workersPerRun: number;
} {
  const concurrency = Math.max(1, Math.min(4, Math.floor(cores / 4)));
  return {
    concurrency,
    workersPerRun: Math.max(1, Math.floor(cores / concurrency)),
  };
}

/** The config as it runs, written one way: line endings normalised, the
 *  iterations and duration applied, and the `options` line's settings in
 *  order, so the same settings in another order are the same run. */
function asRun(config: string, options: SimOptions): string {
  const applied = withOptions(config.replace(/\r\n/g, '\n').trim(), {
    iterations: options.iterations,
    duration: options.duration,
  });
  return applied.replace(
    /^\s*options\b([^;]*);/m,
    (_, settings: string) =>
      `options ${settings.trim().split(/\s+/).filter(Boolean).sort().join(' ')};`,
  );
}

/** The cache key: what is simulated, by which gcsim, read by which reader. */
export function simKey(
  config: string,
  options: SimOptions,
  gcsimCommit: string,
): string {
  return createHash('sha256')
    .update(
      `gcsim ${gcsimCommit}
reader ${READER_VERSION}
${asRun(config, options)}`,
    )
    .digest('hex');
}

export class SimPool {
  private running = 0;
  private readonly queue: (() => void)[] = [];
  private readonly inFlight = new Map<string, Promise<PoolRun>>();
  private readonly cache?: SimCache;
  private readonly now: () => Date;
  readonly concurrency: number;
  readonly workersPerRun: number;

  constructor(
    private readonly runner: RunsSims,
    private readonly gcsimCommit: string,
    options: {
      cache?: SimCache;
      concurrency?: number;
      workersPerRun?: number;
      now?: () => Date;
    } = {},
  ) {
    const sizing = poolSizing();
    this.concurrency = options.concurrency ?? sizing.concurrency;
    this.workersPerRun = options.workersPerRun ?? sizing.workersPerRun;
    this.cache = options.cache;
    this.now = options.now ?? (() => new Date());
  }
  /** Runs now, and waiting for a slot. */
  stats() {
    return { running: this.running, queued: this.queue.length };
  }

  run(config: string, options: SimOptions = {}): Promise<PoolRun> {
    const key = simKey(config, options, this.gcsimCommit);
    const hit = this.cache?.get(key);
    if (hit)
      return Promise.resolve({
        result: hit.result,
        cached: true,
        key,
        ms: hit.ms,
      });
    const pending = this.inFlight.get(key);
    if (pending) return pending.then((r) => ({ ...r, cached: true }));
    const job = this.slot(async () => {
      const t0 = performance.now();
      const result = await this.runner.run(config, {
        ...options,
        workers: this.workersPerRun,
      });
      const ms = Math.round(performance.now() - t0);
      this.cache?.set(key, {
        result,
        ms,
        createdAt: this.now().toISOString(),
        gcsimCommit: this.gcsimCommit,
        iterations: result.iterations,
      });
      return { result, cached: false, key, ms };
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  /** Wait for a free slot, run, and hand the slot on. */
  private async slot<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency)
      await new Promise<void>((resolve) => this.queue.push(resolve));
    this.running++;
    try {
      return await work();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}
