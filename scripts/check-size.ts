/**
 * Bundle-size drift gate (run in CI via `npm run size:check`, after `npm run build`).
 *
 * Compares the gzip total of packages/web/dist/assets/*.js against the checked-in baseline
 * (scripts/size-baseline.json), mirroring the bench:check drift-gate pattern.
 * Fails when the total grows more than TOLERANCE over the baseline. Refresh the
 * baseline deliberately with `npm run size:update` and commit it.
 */
import { gzipSync } from 'zlib';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIST = 'packages/web/dist/assets';
const BASELINE = 'scripts/size-baseline.json';
const TOLERANCE = 0.05; // ponytail: flat 5% total-gzip budget; per-chunk budgets if this masks a regression

const files = readdirSync(DIST).filter((f) => f.endsWith('.js'));
if (files.length === 0) {
  console.error(
    `size:check failed — no .js files in ${DIST}; run \`npm run build\` first.`,
  );
  process.exit(1);
}
const total = files.reduce(
  (sum, f) => sum + gzipSync(readFileSync(join(DIST, f))).length,
  0,
);

if (process.argv.includes('--update')) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ totalGzipBytes: total }, null, 2) + '\n',
  );
  console.log(
    `size baseline updated: ${total} gzip bytes across ${files.length} chunks.`,
  );
  process.exit(0);
}

const baseline: { totalGzipBytes: number } = JSON.parse(
  readFileSync(BASELINE, 'utf-8'),
);
const limit = Math.round(baseline.totalGzipBytes * (1 + TOLERANCE));
if (total > limit) {
  console.error(
    `size:check failed — dist JS gzip total ${total} B exceeds ${limit} B ` +
      `(baseline ${baseline.totalGzipBytes} B + ${TOLERANCE * 100}%).\n` +
      `If the growth is intentional, run \`npm run size:update\` and commit ${BASELINE}.`,
  );
  process.exit(1);
}
console.log(
  `size:check — ok (${total} B gzip vs baseline ${baseline.totalGzipBytes} B, limit ${limit} B).`,
);
