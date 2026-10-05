/**
 * `npm run spec:eval` (TODO 4.4, ADR-0039): score a model on the
 * translator's golden set, against the committed sample account.
 *
 *   npm run spec:eval                          the model in config/llm.json
 *   npm run spec:eval -- --model qwen3:14b     another model, same provider
 *   npm run spec:eval -- --provider anthropic --model <id>
 *   npm run spec:eval -- --only furina-er-floor,raiden-4pc
 *   npm run spec:eval -- --out docs/spec-eval/<name>.md
 *
 * Exits 1 when the score is below `--min <percent>` (equivalent), if given.
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { loadServerEnv } from '../env';
import { fromRoot } from '../paths';
import {
  DEFAULT_LLM_CONFIG,
  LlmConfigError,
  resolveLlmConfig,
} from '../llm/config';
import { createLlmClient } from '../llm/client';
import { importGood, openStore, recordMerge } from '../store/store';
import { Services } from '../api/services';
import { evaluateGolden, evaluationReport, loadGolden } from '../llm/evaluate';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

loadServerEnv();
let config;
try {
  const raw = JSON.parse(
    readFileSync(fromRoot(DEFAULT_LLM_CONFIG), 'utf8'),
  ) as Record<string, unknown>;
  const provider = option('provider');
  config = resolveLlmConfig(
    {
      ...raw,
      ...(provider && { provider }),
      // Another provider's base URL doesn't carry over.
      ...(provider && provider !== raw.provider && { baseUrl: undefined }),
      ...(option('model') && { model: option('model') }),
      ...(option('base-url') && { baseUrl: option('base-url') }),
    },
    process.env,
  );
} catch (e) {
  if (!(e instanceof LlmConfigError)) throw e;
  console.error(e.message);
  process.exit(1);
}
if (config.notReady) {
  console.error(`${config.provider} ${config.model}: ${config.notReady}`);
  process.exit(1);
}

// The committed sample account, in a store of its own.
const db = openStore(':memory:');
importGood(db, {
  text: readFileSync(
    fromRoot(
      'packages/engine/src/import/__fixtures__/sample-account.good.json',
    ),
    'utf8',
  ),
  importedAt: '2026-01-02T03:04:05.000Z',
});
recordMerge(db, [1], '2026-01-02T03:04:05.000Z');
const services = new Services(db);

const only = option('only')?.split(',');
const cases = loadGolden().filter((c) => !only || only.includes(c.id));
const client = createLlmClient(config);
console.error(
  `${config.provider} ${config.model}: ${cases.length} requests against the sample account`,
);
const e = await evaluateGolden(client, services, cases, (r, i) =>
  console.error(
    `${String(i + 1).padStart(2)}. ${r.equivalent ? 'ok  ' : r.translated ? 'diff' : 'FAIL'} ${r.id} (${(r.ms / 1000).toFixed(1)} s, ${r.attempts} attempt${r.attempts === 1 ? '' : 's'})${r.equivalent ? '' : `: ${r.error ?? r.diff.join('; ')}`}`,
  ),
);
await services.searches.close();

const report = evaluationReport(e, new Date().toISOString().slice(0, 10));
const out = option('out');
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, report);
  // Formatted like the rest of docs/, so CI's format check passes as is.
  const prettier = createRequire(fromRoot('package.json')).resolve(
    'prettier/bin/prettier.cjs',
  );
  spawnSync(process.execPath, [prettier, '--write', out], { stdio: 'ignore' });
  console.error(`report: ${out}`);
} else console.log(report);

const min = option('min');
if (min !== undefined && (100 * e.equivalent) / e.total < Number(min))
  process.exitCode = 1;
