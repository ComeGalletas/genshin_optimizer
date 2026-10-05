/**
 * The simulation runner (TODO 5.3): one gcsim run of a config with the
 * iterations, duration and time limit the caller asks for, read into a
 * `SimResult`. The config's own `options` line is rewritten rather than
 * trusted, so a caller always knows how many iterations stand behind a
 * number. 5.4 puts a bounded pool and a cache in front of this.
 * @packageDocumentation
 */

import { GcsimError, runGcsim } from './gcsim';
import { readResult, type SimResult } from './result';

export interface SimOptions {
  /** Iterations; gcsim's default of 1000 when neither this nor the config
   *  says. */
  iterations?: number;
  /** Fight length in seconds. */
  duration?: number;
  /** gcsim's own worker threads for one run. */
  workers?: number;
  /** Time limit for the run, in ms. */
  timeoutMs?: number;
}

export const DEFAULT_SIM_TIMEOUT_MS = 120_000;

export class SimTimeout extends GcsimError {}

const OPTIONS_LINE = /^\s*options\b([^;]*);/m;

/** The config with `iteration`, `duration` and `workers` set as asked: in
 *  its `options` line, which is added if there is none. Other options
 *  (swap delay, hitlag…) are kept. */
export function withOptions(config: string, opts: SimOptions): string {
  const set: Record<string, string> = {};
  if (opts.iterations !== undefined) set.iteration = String(opts.iterations);
  if (opts.duration !== undefined) set.duration = String(opts.duration);
  if (opts.workers !== undefined) set.workers = String(opts.workers);
  if (Object.keys(set).length === 0) return config;
  const m = OPTIONS_LINE.exec(config);
  if (!m)
    return `options ${Object.entries(set)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')};\n${config}`;
  const kept = m[1]
    .trim()
    .split(/\s+/)
    .filter((kv) => kv && !(kv.split('=')[0] in set));
  const line = `options ${[...kept, ...Object.entries(set).map(([k, v]) => `${k}=${v}`)].join(' ')};`;
  return config.slice(0, m.index) + line + config.slice(m.index + m[0].length);
}

export class SimRunner {
  constructor(
    private readonly binary: string,
    private readonly defaults: SimOptions = {},
  ) {}

  /** Run `config` once and read the result. Throws `SimTimeout` past the
   *  time limit, `GcsimError` when gcsim refuses the config, and
   *  `SimResultError` when its output can't be read. */
  async run(config: string, options: SimOptions = {}): Promise<SimResult> {
    const opts = { ...this.defaults, ...options };
    const timeoutMs = opts.timeoutMs ?? DEFAULT_SIM_TIMEOUT_MS;
    let json: unknown;
    try {
      json = await runGcsim(this.binary, withOptions(config, opts), {
        timeoutMs,
      });
    } catch (e) {
      if (e instanceof GcsimError && /didn't finish within/.test(e.message))
        throw new SimTimeout(e.message);
      throw e;
    }
    return readResult(json);
  }
}
