/**
 * `npm run sim:check` (TODO 5.2): get the gcsim binary `config/tools.json`
 * pins into `tools/bin/` (downloaded only if missing or not matching the
 * pin, size and SHA-256 checked before it is ever run), confirm it reports
 * the pinned commit, and run the golden configs
 * (`packages/server/src/sim/golden/golden.json`), checking any with an
 * expected DPS against its tolerance; then run each rotation in the library
 * (`rotations/`, TODO 5.6) on its reference builds, checking a community
 * rotation against its published DPS (±2%). Exits 1 on any failure.
 * `--record` writes each rotation's result into its `meta.json` as its
 * validation with this gcsim (after a new pin, or to validate a draft's
 * clean run; status is never changed here).
 *
 *   npm run sim:check
 *   npm run sim:check -- --only raiden-national-smoke,ayaka-freeze
 *   npm run sim:check -- --record
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rotationConfig } from '@genshin-build-lab/engine/sim/rotation';
import {
  ensureGcsim,
  gcsimVersion,
  loadGcsimTool,
  platformKey,
} from '../sim/gcsim';
import { SimRunner } from '../sim/runner';
import { loadGolden } from '../sim/golden';
import { formatJson, loadRotations, ROTATIONS_DIR } from '../sim/rotations';
import type { SimResult } from '../sim/result';

/** How far a community rotation may land from its published DPS. */
const PUBLISHED_TOLERANCE_PCT = 2;
const ROTATION_ITERATIONS = 1000;

const args = process.argv.slice(2);
const i = args.indexOf('--only');
const only = i >= 0 ? args[i + 1]?.split(',') : undefined;
const record = args.includes('--record');

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

const runner = new SimRunner(ensured.path, { timeoutMs: 300_000 });
for (const g of loadGolden().filter((c) => !only || only.includes(c.id))) {
  const t0 = performance.now();
  try {
    const s = await runner.run(readFileSync(g.path, 'utf8'));
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
    details(s);
  } catch (e) {
    fail(`${g.id}: ${(e as Error).message}`);
  }
}

for (const r of loadRotations().filter(
  (r) => !only || only.includes(r.meta.id),
)) {
  const { meta } = r;
  if (!r.reference) {
    console.log(`skip  ${meta.id}: no reference builds`);
    continue;
  }
  const t0 = performance.now();
  try {
    const s = await runner.run(
      rotationConfig(r, 'reference', { iterations: ROTATION_ITERATIONS }),
    );
    const seconds = ((performance.now() - t0) / 1000).toFixed(1);
    const published = meta.source.publishedDps;
    const off = published
      ? (100 * (s.dps.mean - published)) / published
      : undefined;
    const line = `${meta.id} (${meta.status}): ${s.dps.mean.toFixed(0)} DPS ± ${s.dps.sd.toFixed(0)} over ${s.durationSec.toFixed(1)} s (${s.iterations} iterations, ${seconds} s)${s.warnings.length ? `, warnings: ${s.warnings.join(', ')}` : ''}${off === undefined ? '' : `; ${off.toFixed(2)}% from the published ${published}`}`;
    if (s.incomplete.length)
      fail(`${line}; gcsim implements ${s.incomplete.join(', ')} only partly`);
    else if (off !== undefined && Math.abs(off) > PUBLISHED_TOLERANCE_PCT)
      fail(`${line} (tolerance ±${PUBLISHED_TOLERANCE_PCT}%)`);
    else console.log(`ok    ${line}`);
    if (meta.validation && meta.validation.gcsim !== tool.version)
      console.log(
        `      validated with gcsim ${meta.validation.gcsim}; record again with --record`,
      );
    details(s);
    if (record && !s.incomplete.length) {
      const path = join(ROTATIONS_DIR, meta.id, 'meta.json');
      const file = JSON.parse(readFileSync(path, 'utf8')) as Record<
        string,
        unknown
      >;
      file.validation = {
        gcsim: tool.version,
        date: new Date().toISOString().slice(0, 10),
        iterations: s.iterations,
        dps: Math.round(s.dps.mean),
        sd: Math.round(s.dps.sd),
        durationSec: Math.round(s.durationSec * 100) / 100,
        warnings: s.warnings,
        ...(off !== undefined && { offPct: Math.round(off * 100) / 100 }),
      };
      writeFileSync(path, formatJson(file));
      console.log(`      recorded in rotations/${meta.id}/meta.json`);
    }
  } catch (e) {
    fail(`${meta.id}: ${(e as Error).message}`);
  }
}

function details(s: SimResult) {
  for (const c of s.characters)
    console.log(
      `        ${c.name.padEnd(15)} ${c.dps.mean.toFixed(0).padStart(6)} DPS (${(100 * c.share).toFixed(0)}%), on field ${c.fieldTimeSec.toFixed(1)} s, waited ${c.energyWaitSec.toFixed(1)} s for energy`,
    );
  if (Object.keys(s.reactions).length)
    console.log(
      `        reactions per run: ${Object.entries(s.reactions)
        .map(([k, v]) => `${k} ${v.toFixed(0)}`)
        .join(', ')}`,
    );
}
if (failed) {
  console.log(`${failed} check${failed === 1 ? '' : 's'} failed`);
  process.exitCode = 1;
}
