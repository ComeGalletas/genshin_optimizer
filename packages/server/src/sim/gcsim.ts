/**
 * The gcsim binary (TODO 5.2): which one this machine needs, getting it
 * into `tools/bin/` only as the exact file `config/tools.json` pins (size
 * and SHA-256 checked before it is ever run, a corrupt or swapped copy
 * replaced), its version, and one run of a config to its JSON result.
 *
 * gcsim is AGPL-3.0 since v2.48 (research note 2026-10-05): it runs here as
 * a separate, unmodified program; nothing of its source is in this
 * repository. 5.3 builds the runner (timeouts, iterations, parsing, a pool)
 * on `runGcsim`.
 * @packageDocumentation
 */

import { execFile } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as z from 'zod';
import { fromRoot } from '../paths';
import { sha256 } from '../hash';

const run = promisify(execFile);

const Binary = z
  .object({
    file: z.string().min(1),
    url: z.string().url().startsWith('https://github.com/genshinsim/gcsim/'),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type GcsimBinary = z.infer<typeof Binary>;

export const GcsimTool = z
  .object({
    version: z.string().regex(/^v\d+\.\d+\.\d+$/),
    released: z.string(),
    /** The commit `gcsim -version` prints for this release. */
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    repository: z.string().url(),
    license: z.string(),
    binaries: z.record(z.string(), Binary),
  })
  .strict();
export type GcsimTool = z.infer<typeof GcsimTool>;

export class GcsimError extends Error {}

/** The pin in `config/tools.json`. */
export function loadGcsimTool(path = fromRoot('config/tools.json')): GcsimTool {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { gcsim?: unknown };
  const r = GcsimTool.safeParse(raw.gcsim);
  if (!r.success)
    throw new GcsimError(
      `${path}: gcsim: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return r.data;
}

/** This machine's key in `binaries`, e.g. `win32-x64`. */
export const platformKey = (
  platform: string = process.platform,
  arch: string = process.arch,
) => `${platform}-${arch}`;

export function binaryFor(tool: GcsimTool, key = platformKey()): GcsimBinary {
  const b = tool.binaries[key];
  if (!b)
    throw new GcsimError(
      `no gcsim ${tool.version} binary for ${key}; config/tools.json has ${Object.keys(tool.binaries).join(', ')}`,
    );
  return b;
}

/** Where the pinned binary lives: the version in the name, so a new pin
 *  never runs an old file. */
export function gcsimPath(
  tool: GcsimTool,
  key = platformKey(),
  binDir = fromRoot('tools/bin'),
): string {
  const ext = binaryFor(tool, key).file.endsWith('.exe') ? '.exe' : '';
  return join(binDir, `gcsim-${tool.version}${ext}`);
}

export interface EnsureResult {
  path: string;
  /** `present`: already there and verified. `downloaded`: fetched now. */
  status: 'present' | 'downloaded';
  /** Why an existing file was replaced, if one was. */
  replaced?: string;
}

/** Make sure the pinned binary is at `gcsimPath`, verified. Downloads to a
 *  temporary name and renames only after size and SHA-256 match, so a
 *  failed or tampered download never sits where it would be run. */
export async function ensureGcsim(
  tool: GcsimTool,
  options: {
    key?: string;
    binDir?: string;
    fetch?: typeof fetch;
    log?: (line: string) => void;
  } = {},
): Promise<EnsureResult> {
  const key = options.key ?? platformKey();
  const bin = binaryFor(tool, key);
  const path = gcsimPath(tool, key, options.binDir);
  const log = options.log ?? (() => {});
  let replaced: string | undefined;

  if (existsSync(path)) {
    const have = readFileSync(path);
    const digest = sha256(have);
    if (have.length === bin.size && digest === bin.sha256)
      return { path, status: 'present' };
    replaced = `the copy at ${path} didn't match the pin (size ${have.length}, sha256 ${digest.slice(0, 12)}…)`;
    log(`${replaced}; downloading it again`);
    rmSync(path, { force: true });
  }

  log(
    `downloading ${bin.file} (${(bin.size / 1e6).toFixed(1)} MB) from ${bin.url}`,
  );
  const res = await (options.fetch ?? fetch)(bin.url);
  if (!res.ok)
    throw new GcsimError(`downloading ${bin.url} failed: HTTP ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  const digest = sha256(data);
  if (data.length !== bin.size || digest !== bin.sha256)
    throw new GcsimError(
      `the download of ${bin.file} doesn't match config/tools.json (size ${data.length} vs ${bin.size}, sha256 ${digest} vs ${bin.sha256}); not installed`,
    );
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.download`;
  writeFileSync(tmp, data);
  if (!path.endsWith('.exe')) chmodSync(tmp, 0o755);
  renameSync(tmp, path);
  return { path, status: 'downloaded', ...(replaced && { replaced }) };
}

/** What `gcsim -version` prints (a version or a git hash). */
export async function gcsimVersion(path: string): Promise<string> {
  const { stdout } = await run(path, ['-version'], { timeout: 30_000 });
  return stdout.trim();
}

/** Run one config and return the parsed JSON result. The config goes to a
 *  temporary directory, and gcsim never opens a browser or a server. */
export async function runGcsim(
  path: string,
  config: string,
  options: { timeoutMs?: number } = {},
): Promise<unknown> {
  return (await invoke(path, config, options, false)).result;
}

/** Run one config and also write gcsim's sample (`-sample`): the event log
 *  of one iteration, frame by frame, for a review (TODO 5.7). */
export async function runGcsimWithSample(
  path: string,
  config: string,
  options: { timeoutMs?: number } = {},
): Promise<{ result: unknown; sample: unknown }> {
  const { result, sample } = await invoke(path, config, options, true);
  return { result, sample };
}

async function invoke(
  path: string,
  config: string,
  options: { timeoutMs?: number },
  withSample: boolean,
): Promise<{ result: unknown; sample?: unknown }> {
  const dir = mkdtempSync(join(tmpdir(), 'gbl-gcsim-'));
  try {
    const cfg = join(dir, 'config.txt');
    const out = join(dir, 'result.json');
    const sample = join(dir, 'sample.json');
    writeFileSync(cfg, config);
    try {
      await run(
        path,
        [
          '-c',
          cfg,
          '-out',
          out,
          '-nb',
          ...(withSample ? ['-sample', sample] : []),
        ],
        {
          cwd: dir,
          timeout: options.timeoutMs ?? 120_000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; killed?: boolean };
      throw new GcsimError(
        err.killed
          ? `gcsim didn't finish within ${(options.timeoutMs ?? 120_000) / 1000} s`
          : `gcsim failed: ${(err.stderr || err.stdout || (e as Error).message).trim().slice(0, 500)}`,
      );
    }
    return {
      result: JSON.parse(readFileSync(out, 'utf8')) as unknown,
      ...(withSample && {
        sample: JSON.parse(readFileSync(sample, 'utf8')) as unknown,
      }),
    };
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}
