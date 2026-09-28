/**
 * `npm run prospects -- <file.good.json>`: which artifacts are worth levelling
 * (ADR-0024). Reads a GOOD file, ranks every 5★ piece by its substat score at
 * +20 (exact for +20 pieces, expected for the rest) within its slot and main
 * stat, and prints the top of each group. The ranking is the engine's pure
 * `rankProspects`; this script only reads the file and formats it.
 *
 *   npm run prospects -- imports/inbox/export.json
 *   npm run prospects -- <file> --objective atk_pct --top 10
 *   npm run prospects -- <file> --json
 */
import { readFileSync } from 'node:fs';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import { rankProspects } from '@genshin-build-lab/engine/prospects/prospects';
import {
  isObjective,
  type ScalarObjective,
} from '@genshin-build-lab/engine/game/types';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
);
const objective = option('objective') ?? 'crit_value';
const top = Number(option('top') ?? 5);

if (!file || !isObjective(objective) || objective === 'avg_damage') {
  console.error(
    'usage: npm run prospects -- <file.good.json> [--objective crit_value|<stat>] [--top N] [--json]',
  );
  process.exitCode = 1;
} else {
  const good = normalizeGOOD(JSON.parse(readFileSync(file, 'utf8')));
  if (!good?.artifacts) {
    console.error(`${file}: no GOOD artifact list`);
    process.exitCode = 1;
  } else {
    const ranking = rankProspects(good.artifacts, objective as ScalarObjective);
    if (args.includes('--json')) console.log(JSON.stringify(ranking, null, 2));
    else print(ranking, objective, top);
  }
}

function print(
  { rows, notProjected }: ReturnType<typeof rankProspects>,
  objective: string,
  n: number,
): void {
  const fmt = (x: number) => x.toFixed(1);
  console.log(
    `# Levelling prospects (${objective}, substats only)\n\n` +
      `Upgraded: +20, score as is. Prospect: expected score at +20 ` +
      `(remaining rolls at 85% of max, spread over the 4 lines). ` +
      `Upgraded pieces win ties.\n`,
  );
  const groups = [...new Set(rows.map((r) => r.group))].sort();
  for (const g of groups) {
    const inGroup = rows.filter((r) => r.group === g);
    const prospects = inGroup.filter((r) => r.status === 'prospect').length;
    console.log(
      `## ${g} (${inGroup.length} pieces, ${prospects} below +20)\n\n` +
        '| # | status | level | set | now | at +20 |\n' +
        '| --- | --- | --- | --- | --- | --- |',
    );
    for (const r of inGroup.slice(0, n))
      console.log(
        `| ${r.rank} | ${r.status} | +${r.artifact.level} | ${r.artifact.setKey} | ${fmt(r.current)} | ${fmt(r.atPlus20)} |`,
      );
    console.log('');
  }
  if (notProjected.length) {
    const byReason: Record<string, number> = {};
    for (const p of notProjected)
      byReason[p.reason] = (byReason[p.reason] ?? 0) + 1;
    console.log(
      'Not projected: ' +
        Object.entries(byReason)
          .map(([reason, count]) => `${count} ${reason}`)
          .join(', '),
    );
  }
}
