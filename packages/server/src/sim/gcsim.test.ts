import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  binaryFor,
  ensureGcsim,
  GcsimError,
  gcsimPath,
  loadGcsimTool,
  runGcsim,
  type GcsimTool,
} from './gcsim';
import { summarizeResult, SimResultError } from './result';
import { loadGolden } from './golden';

describe('the pin (config/tools.json)', () => {
  it('names a version, its commit and a verified binary per platform', () => {
    const tool = loadGcsimTool();
    expect(tool.version).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(tool.commit).toMatch(/^[0-9a-f]{40}$/);
    for (const key of ['win32-x64', 'linux-x64', 'darwin-arm64'])
      expect(binaryFor(tool, key).url).toContain(`/download/${tool.version}/`);
    expect(() => binaryFor(tool, 'aix-ppc64')).toThrow(
      /no gcsim v\d+\.\d+\.\d+ binary for aix-ppc64; config\/tools\.json has win32-x64/,
    );
    expect(gcsimPath(tool, 'win32-x64', 'bin')).toBe(
      join('bin', `gcsim-${tool.version}.exe`),
    );
    expect(gcsimPath(tool, 'linux-x64', 'bin')).toBe(
      join('bin', `gcsim-${tool.version}`),
    );
  });
});

describe('ensureGcsim', () => {
  const BYTES = new TextEncoder().encode('pretend this is gcsim');
  const tool: GcsimTool = {
    version: 'v9.9.9',
    released: '2026-01-01',
    commit: 'a'.repeat(40),
    repository: 'https://github.com/genshinsim/gcsim',
    license: 'test',
    binaries: {
      'linux-x64': {
        file: 'gcsim_linux_amd64',
        url: 'https://github.com/genshinsim/gcsim/releases/download/v9.9.9/gcsim_linux_amd64',
        size: BYTES.length,
        sha256: createHash('sha256').update(BYTES).digest('hex'),
      },
    },
  };
  const serve = (body: Uint8Array, status = 200) => {
    const f = vi.fn(async () => new Response(body, { status }));
    return f as unknown as typeof fetch & typeof f;
  };
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gbl-gcsim-bin-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const opts = (fetch: typeof globalThis.fetch) => ({
    key: 'linux-x64',
    binDir: dir,
    fetch,
  });

  it('downloads, verifies, and installs under the version’s name', async () => {
    const f = serve(BYTES);
    const r = await ensureGcsim(tool, opts(f));
    expect(r).toEqual({
      path: join(dir, 'gcsim-v9.9.9'),
      status: 'downloaded',
    });
    expect(readFileSync(r.path)).toEqual(Buffer.from(BYTES));
    expect(f).toHaveBeenCalledWith(tool.binaries['linux-x64'].url);
    expect(readdirSync(dir)).toEqual(['gcsim-v9.9.9']);
  });

  it('refuses a download that doesn’t match the pin, and installs nothing', async () => {
    // The same size, so only the checksum can tell.
    const tampered = new TextEncoder().encode('pretend this is malwa');
    expect(tampered.length).toBe(BYTES.length);
    await expect(ensureGcsim(tool, opts(serve(tampered)))).rejects.toThrow(
      /doesn't match config\/tools\.json .*; not installed/,
    );
    await expect(ensureGcsim(tool, opts(serve(BYTES, 404)))).rejects.toThrow(
      /failed: HTTP 404/,
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it('uses a verified copy without downloading, and replaces one that doesn’t match', async () => {
    await ensureGcsim(tool, opts(serve(BYTES)));
    const again = serve(BYTES);
    expect(await ensureGcsim(tool, opts(again))).toMatchObject({
      status: 'present',
    });
    expect(again).not.toHaveBeenCalled();
    writeFileSync(join(dir, 'gcsim-v9.9.9'), 'swapped');
    const fixed = await ensureGcsim(tool, opts(serve(BYTES)));
    expect(fixed).toMatchObject({
      status: 'downloaded',
      replaced: expect.stringMatching(/didn't match the pin \(size 7,/),
    });
    expect(readFileSync(fixed.path)).toEqual(Buffer.from(BYTES));
  });

  it('is a typed error for callers to report', async () => {
    await expect(
      ensureGcsim(tool, { ...opts(serve(BYTES)), key: 'win32-x64' }),
    ).rejects.toBeInstanceOf(GcsimError);
  });
});

describe('summarizeResult', () => {
  const result = {
    sim_version: 'abc',
    character_details: [{ name: 'raidenshogun' }, { name: 'bennett' }],
    statistics: {
      iterations: 100,
      dps: { mean: 17798.4, sd: 629.1, min: 16000, max: 19000 },
      character_dps: [{ mean: 6049 }, { mean: 582 }],
      warnings: { insufficient_energy: true, swap_cd: false, burst_cd: true },
    },
  };

  it('reads mean and spread, per-character DPS and the warnings raised', () => {
    expect(summarizeResult(result)).toEqual({
      simVersion: 'abc',
      iterations: 100,
      dps: { mean: 17798.4, sd: 629.1, min: 16000, max: 19000 },
      characters: [
        { name: 'raidenshogun', dps: 6049 },
        { name: 'bennett', dps: 582 },
      ],
      warnings: ['insufficient_energy', 'burst_cd'],
      incomplete: [],
    });
  });

  it('refuses a result without the numbers, rather than reading zero', () => {
    expect(() =>
      summarizeResult({ statistics: { iterations: 1, dps: {} } }),
    ).toThrow(/no mean DPS/);
    expect(() => summarizeResult({ nope: true })).toThrow(SimResultError);
  });
});

describe('the golden configs', () => {
  it('list existing files, each with a purpose', () => {
    const golden = loadGolden();
    expect(golden.length).toBeGreaterThan(0);
    for (const g of golden) {
      expect(existsSync(g.path), g.id).toBe(true);
      expect(g.purpose.length).toBeGreaterThan(0);
    }
  });
});

// Runs only where `npm run sim:check` has installed the pinned binary
// (not in CI, which doesn't download it).
const installed = (() => {
  try {
    const p = gcsimPath(loadGcsimTool());
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
})();

describe.skipIf(!installed)('the installed gcsim', () => {
  it('runs the smoke config and its result parses', async () => {
    const smoke = loadGolden().find((g) => g.id === 'raiden-national-smoke')!;
    const config = readFileSync(smoke.path, 'utf8').replace(
      /iteration=\d+/,
      'iteration=20',
    );
    const s = summarizeResult(await runGcsim(installed!, config));
    expect(s.iterations).toBe(20);
    expect(s.dps.mean).toBeGreaterThan(1000);
    expect(s.characters.map((c) => c.name)).toEqual([
      'raidenshogun',
      'xiangling',
      'yelan',
      'bennett',
    ]);
    expect(s.incomplete).toEqual([]);
  }, 120_000);

  it('reports a broken config as gcsim’s own error', async () => {
    await expect(runGcsim(installed!, 'this is not a config;')).rejects.toThrow(
      /^gcsim failed: /,
    );
  }, 60_000);
});
