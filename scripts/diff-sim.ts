/**
 * `npm run diff:sim -- <file.good.json>`: check the "what changed" diff
 * (TODO 2.8) against simulated play on a real export. The file is played
 * forward with a seed (upgrades with real rolls, moves, lock changes,
 * consumed fodder, new drops), and the diff is scored against what the
 * simulation did: with first rolls (as Irminsul exports), without them (as
 * an OCR scan), and without the unactivated line too.
 *
 *   npm run diff:sim -- imports/inbox/export.json
 *   npm run diff:sim -- <file> --seeds 5
 * @packageDocumentation
 */
import { readFileSync } from 'node:fs';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import {
  diffSnapshots,
  type ImportDiff,
} from '@genshin-build-lab/engine/diff/diff';
import {
  simulatePlay,
  withoutRollData,
  type PlayTruth,
} from '@genshin-build-lab/engine/test-fixtures/simulatePlay';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const seedsAt = args.indexOf('--seeds');
const seeds = seedsAt >= 0 ? Number(args[seedsAt + 1]) : 3;

if (!file) {
  console.error('usage: npm run diff:sim -- <file.good.json> [--seeds N]');
  process.exitCode = 1;
} else {
  const before = normalizeGOOD(
    JSON.parse(readFileSync(file, 'utf8')),
  )?.artifacts;
  if (!before) {
    console.error(`${file}: no GOOD artifact list`);
    process.exitCode = 1;
  } else run(before);
}

function run(
  before: NonNullable<ReturnType<typeof normalizeGOOD>>['artifacts'] & object,
) {
  const n = before.length;
  const counts = {
    upgrades: Math.ceil(n * 0.04),
    moves: Math.ceil(n * 0.025),
    locks: Math.ceil(n * 0.02),
    consumed: Math.ceil(n * 0.07),
    drops: Math.ceil(n * 0.055),
  };
  console.log(`${n} artifacts; per seed: ${JSON.stringify(counts)}\n`);
  console.log(
    '| seed | source | upgraded | false | added | removed | moved | locks | unexplained |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (let seed = 1; seed <= seeds; seed++) {
    const { after, truth } = simulatePlay(before!, counts, seed);
    const variants: [string, ImportDiff][] = [
      ['first rolls', diffSnapshots(before!, after)],
      [
        'OCR-like',
        diffSnapshots(withoutRollData(before!), withoutRollData(after)),
      ],
      [
        'no 4th line',
        diffSnapshots(
          withoutRollData(before!, false),
          withoutRollData(after, false),
        ),
      ],
    ];
    for (const [name, d] of variants) console.log(row(seed, name, d, truth));
  }
}

function row(seed: number, name: string, d: ImportDiff, t: PlayTruth): string {
  const pairs = (xs: [number, number][]) =>
    new Set(xs.map(([a, b]) => `${a}>${b}`));
  const up = pairs(d.upgraded.map((u) => [u.before, u.after]));
  const truthUp = pairs(t.upgraded);
  const falseUp = [...up].filter((x) => !truthUp.has(x)).length;
  const hit = (got: number, want: number) => `${got}/${want}`;
  return `| ${seed} | ${name} | ${hit(up.size - falseUp, truthUp.size)} | ${falseUp} | ${hit(d.added.filter((j) => t.added.includes(j)).length, t.added.length)} | ${hit(d.removed.filter((i) => t.removed.includes(i)).length, t.removed.length)} | ${hit(d.moved.length, t.moved.length)} | ${hit(d.lockChanged.length, t.lockChanged.length)} | ${d.unexplained.length} |`;
}
