/**
 * `npm run sim:check` (TODO 5.2): get the gcsim binary `config/tools.json`
 * pins into `tools/bin/` (downloaded only if missing or not matching the
 * pin, size and SHA-256 checked before it is ever run), confirm it reports
 * the pinned commit, and run the golden configs
 * (`packages/server/src/sim/golden/golden.json`), checking any with an
 * expected DPS against its tolerance. Exits 1 on any failure.
 *
 *   npm run sim:check
 *   npm run sim:check -- --only raiden-national-smoke
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import {
  ensureGcsim,
  gcsimVersion,
  loadGcsimTool,
  platformKey,
  runGcsim,
} from '../sim/gcsim';
import { summarizeResult } from '../sim/result';
import { loadGolden } from '../sim/golden';

const args = process.argv.slice(2);
const i = args.indexOf('--only');
const only = i >= 0 ? args[i + 1]?.split(',') : undefined;

let failed = 0;
const fail = (line: string) => {
  failed++;
  console.log(`FAIL  ${line}`);
};

const tool = loadGcsimTool();
console.log(`gcsim ${tool.version} (${tool.released}) for ${platformKey()}`);
const ensured = await ensureGcsim(tool, {
  log: (l) => console.log(`      ${l}`),
});
console.log(
  `ok    ${ensured.status === 'present' ? 'present and verified' : 'downloaded and verified'}: ${ensured.path}`,
);
const version = await gcsimVersion(ensured.path);
if (version === tool.commit) console.log(`ok    gcsim -version: ${version}`);
else fail(`gcsim -version printed ${version}, the pin says ${tool.commit}`);

for (const g of loadGolden().filter((c) => !only || only.includes(c.id))) {
  const t0 = performance.now();
  try {
    const s = summarizeResult(
      await runGcsim(ensured.path, readFileSync(g.path, 'utf8'), {
        timeoutMs: 300_000,
      }),
    );
    const seconds = ((performance.now() - t0) / 1000).toFixed(1);
    const line = `${g.id}: ${s.dps.mean.toFixed(0)} DPS ± ${s.dps.sd.toFixed(0)} (${s.iterations} iterations, ${seconds} s)${s.warnings.length ? `, warnings: ${s.warnings.join(', ')}` : ''}`;
    if (s.incomplete.length)
      fail(`${line}; gcsim implements ${s.incomplete.join(', ')} only partly`);
    else if (g.expected) {
      const off = (100 * (s.dps.mean - g.expected.dps)) / g.expected.dps;
      if (Math.abs(off) <= g.expected.tolerancePct)
        console.log(
          `ok    ${line}; ${off.toFixed(2)}% from the published ${g.expected.dps}`,
        );
      else
        fail(
          `${line}; ${off.toFixed(2)}% from the published ${g.expected.dps} (tolerance ±${g.expected.tolerancePct}%)`,
        );
    } else console.log(`ok    ${line}`);
    for (const c of s.characters)
      console.log(`        ${c.name.padEnd(12)} ${c.dps.toFixed(0)}`);
  } catch (e) {
    fail(`${g.id}: ${(e as Error).message}`);
  }
}
if (failed) {
  console.log(`${failed} check${failed === 1 ? '' : 's'} failed`);
  process.exitCode = 1;
}
