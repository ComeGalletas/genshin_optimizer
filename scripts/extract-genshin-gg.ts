/**
 * `npm run guides:genshin-gg`: read each character's build from genshin.gg
 * into `packages/engine/src/meta/genshinGg.generated.json`, the cross-check
 * beside the guide builds (TODO 10.2, ADR-0060). Run by hand, never by the
 * app: one request a second, plain page fetches only. genshin.gg's
 * robots.txt allows every crawler and the site links no terms of use
 * (checked 2026-10-07); re-check both before a run.
 *
 * Each page holds one build in one template: a role, ranked sets with piece
 * counts, main stats per slot and a substat order. Labels the script can't
 * map are printed and left out, never guessed. Review the diff before
 * committing it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type { StatKey } from '@genshin-build-lab/engine/game/types';
import type { GenshinGgBuild } from '@genshin-build-lab/engine/meta/genshinGg';

const SITE = 'https://genshin.gg';
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/engine/src/meta/genshinGg.generated.json',
);
/** Where the site's page name isn't any part of the character's. */
const SLUG_OVERRIDES: Record<string, string> = { tartaglia: 'childe' };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]/g, '');
const decode = (s: string) =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
const textLines = (html: string) =>
  html
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .map(decode)
    .filter(Boolean);

const SET_BY_NAME = new Map(
  genshinAdapter.sets().map((s) => [norm(s.name), s.key]),
);
const MAIN: Record<string, StatKey> = {
  hp: 'hp_pct',
  'hp%': 'hp_pct',
  'atk%': 'atk_pct',
  'def%': 'def_pct',
  'energy recharge': 'er_pct',
  'energy rechage': 'er_pct',
  er: 'er_pct',
  'elemental mastery': 'em',
  'elemental master': 'em',
  em: 'em',
  'crit rate': 'crit_rate',
  'crit dmg': 'crit_dmg',
  'healing bonus': 'healing',
  healing: 'healing',
  'physical dmg': 'physical_dmg',
};
const SUB: Record<string, StatKey> = {
  ...MAIN,
  hp: 'hp',
  atk: 'atk',
  def: 'def',
  'flat hp': 'hp',
  'flat atk': 'atk',
  'flat def': 'def',
};
/** Placeholders the site writes in a list, not stats. */
const IGNORED = new Set(['any', 'dmg', '']);

const unmapped: string[] = [];
function mapStat(table: Record<string, StatKey>, raw: string, who: string) {
  const k = raw.trim().toLowerCase();
  if (
    table === MAIN &&
    /^(pyro|hydro|electro|cryo|anemo|geo|dendro) dmg( bonus)?$/.test(k)
  )
    return 'elemental_dmg' as StatKey;
  const v = table[k];
  if (!v && !IGNORED.has(k)) unmapped.push(`${who}: "${raw.trim()}"`);
  return v;
}

function parse(key: string, url: string, html: string): GenshinGgBuild | null {
  const lines = textLines(html);
  const head = lines.findIndex((l) => /^Genshin Impact .* Build$/.test(l));
  const a = lines.findIndex((l) => / Best Artifacts$/.test(l));
  const b = lines.findIndex((l) => / Best Stats$/.test(l));
  if (head < 0 || a < 0 || b < 0) return null;
  // "1 | Set | 4 | 2 | Set | 2 | Set | 2 | 3 | ...": a rank, then each set
  // with its piece count.
  const sets: string[][] = [];
  let cur: string[] = [];
  for (let i = a + 1; i < b; i++) {
    const l = lines[i];
    if (/^\d+$/.test(l)) {
      if (SET_BY_NAME.has(norm(lines[i - 1]))) continue;
      if (cur.length) sets.push(cur);
      cur = [];
      continue;
    }
    const set = SET_BY_NAME.get(norm(l));
    if (set) cur.push(set);
    else unmapped.push(`${key}: set "${l}"`);
  }
  if (cur.length) sets.push(cur);
  const after = (label: string) => {
    const i = lines.findIndex((l, j) => j > b && l === label);
    return i > 0 ? lines[i + 1] : '';
  };
  const list = (table: Record<string, StatKey>, raw: string) => [
    ...new Set(
      raw
        .split(/[>/]/)
        .map((s) => mapStat(table, s, key))
        .filter((s): s is StatKey => !!s),
    ),
  ];
  return {
    url,
    role: lines[head + 3] ?? '',
    sets,
    mains: {
      sands: list(MAIN, after('Sands:')),
      goblet: list(MAIN, after('Goblet:')),
      circlet: list(MAIN, after('Circlet:')),
    },
    substats: list(SUB, after('Substats:')),
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const index = await (await fetch(`${SITE}/builds/`)).text();
  const slugs = new Set(
    [...index.matchAll(/href="\/characters\/([^"/]+)\//g)].map((m) => m[1]),
  );
  const builds: Record<string, GenshinGgBuild> = {};
  const missing: string[] = [];
  for (const c of genshinAdapter.characters()) {
    const names = [c.key, c.name, ...c.name.split(' ')].map(norm);
    const slug = SLUG_OVERRIDES[c.key] ?? names.find((n) => slugs.has(n));
    if (!slug) {
      missing.push(c.key);
      continue;
    }
    const url = `${SITE}/characters/${slug}/`;
    const build = parse(c.key, url, await (await fetch(url)).text());
    if (build) builds[c.key] = build;
    else missing.push(`${c.key} (page not in the usual template)`);
    await wait(1000);
  }
  const sorted = Object.fromEntries(
    Object.entries(builds).sort(([x], [y]) => x.localeCompare(y)),
  );
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: SITE,
        fetched: new Date().toISOString().slice(0, 10),
        builds: sorted,
      },
      null,
      1,
    ) + '\n',
    'utf-8',
  );
  console.log(`genshin.gg: ${Object.keys(builds).length} builds → ${OUT}`);
  console.log(`missing: ${missing.join(', ') || 'none'}`);
  console.log(`left out (unmapped labels): ${unmapped.join('; ') || 'none'}`);
}

await main();
