/**
 * `npm run sources`: read the guide sites into `data/sources/` (ADR-0061).
 * Offline and by hand, never by the app: each page through the polite
 * fetcher (`sources/fetch.ts`), read by the engine's pure parsers, merged
 * into the app's data afterwards by `npm run data:guides`.
 *
 *   npm run sources -- kqm [--only=nahida,furina] [--refresh] [--llm]
 *   npm run sources -- genshin-builds [--only=...] [--refresh]
 *   npm run sources -- genshin-gg [--only=...] [--refresh]
 *   npm run sources -- exceptions   kit-based candidates for UNUSED_STATS
 *   npm run sources -- teams        test only: genshin-builds' teams against
 *                                   the curated team archetypes
 *
 * A character whose page can't be read keeps what the file had. Every run
 * writes a report to `var/reports/` and prints what changed; review it and
 * the git diff before committing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { UNUSED_STATS } from '@genshin-build-lab/engine/roster/artifactQuality';
import { COMP_ARCHETYPES } from '@genshin-build-lab/engine/teams/comps';
import { parseKqmGuide } from '@genshin-build-lab/engine/sources/kqm';
import { parseGenshinBuildsPage } from '@genshin-build-lab/engine/sources/genshinBuilds';
import {
  genshinGgSlugFor,
  genshinGgSlugs,
  parseGenshinGgPage,
} from '@genshin-build-lab/engine/sources/genshinGg';
import { readStats } from '@genshin-build-lab/engine/sources/labels';
import type {
  SourceBuild,
  SourceCharacter,
  SourceFile,
  SourceName,
} from '@genshin-build-lab/engine/sources/types';
import type { BuildRole } from '@genshin-build-lab/engine/meta/guideBuilds';
import { getPage } from '../sources/fetch';
import { diffBuilds, keepFromPrevious } from '../sources/compare';
import { fromRoot } from '../paths';

const FILES: Record<SourceName, { file: string; site: string }> = {
  kqm: { file: 'kqm.json', site: 'https://keqingmains.com' },
  genshinBuilds: {
    file: 'genshin-builds.json',
    site: 'https://genshin-builds.com',
  },
  genshinGg: { file: 'genshin-gg.json', site: 'https://genshin.gg' },
};

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) ?? '';
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = option('only')
  ?.split(',')
  .map((s) => s.trim());
const refresh = flag('refresh');
const today = new Date().toISOString().slice(0, 10);

function load(source: SourceName): SourceFile {
  const f = fromRoot(`data/sources/${FILES[source].file}`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  return { source, site: FILES[source].site, readBy: 'script', characters: {} };
}

function save(file: SourceFile) {
  const sorted = Object.fromEntries(
    Object.entries(file.characters).sort(([a], [b]) => a.localeCompare(b)),
  );
  fs.writeFileSync(
    fromRoot(`data/sources/${FILES[file.source].file}`),
    `${JSON.stringify({ ...file, characters: sorted }, null, 1)}\n`,
    'utf8',
  );
}

function report(name: string, lines: string[]) {
  const dir = fromRoot('var/reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${today}-${name}.md`);
  fs.writeFileSync(
    file,
    `# ${name} (${today})\n\n${lines.join('\n')}\n`,
    'utf8',
  );
  console.log(`report: ${file}`);
}

const characters = () =>
  genshinAdapter
    .characters()
    .filter((c) => !only || only.includes(c.key))
    .map((c) => ({ key: c.key, name: c.name }));

/** Read one source's pages into its file. */
async function readSource(
  source: SourceName,
  urlFor: (
    key: string,
    name: string,
    prev?: SourceCharacter,
  ) => string | undefined,
  parse: (
    html: string,
    key: string,
  ) =>
    | Promise<Omit<SourceCharacter, 'url' | 'fetched'>>
    | Omit<SourceCharacter, 'url' | 'fetched'>,
) {
  const file = load(source);
  const lines: string[] = [];
  let read = 0;
  let kept = 0;
  for (const { key, name } of characters()) {
    const prev = file.characters[key];
    const url = urlFor(key, name, prev);
    if (!url) {
      lines.push(`- **${key}**: no page on ${FILES[source].site}`);
      continue;
    }
    const page = await getPage(url, { refresh });
    if (!page) {
      lines.push(
        `- **${key}**: ${url} couldn't be read; kept what the file had`,
      );
      kept++;
      continue;
    }
    const parsed = await parse(page.html, key);
    if (!parsed.builds.length) {
      lines.push(
        `- **${key}**: no builds read (${(parsed.issues ?? []).join('; ') || 'unknown layout'}); kept what the file had`,
      );
      kept++;
      continue;
    }
    const next: SourceCharacter = {
      url: page.url,
      fetched: page.fetched,
      ...parsed,
    };
    if (!next.issues?.length) delete next.issues;
    keepFromPrevious(prev, next);
    const changes = diffBuilds(prev, next);
    const flags = next.builds.flatMap((b) =>
      (b.flags ?? []).map((f) => `${b.name}: ${f}`),
    );
    if (changes.length || flags.length)
      lines.push(
        `- **${key}**${changes.length ? `: ${changes.join('; ')}` : ''}${
          flags.length ? `\n  - check: ${flags.join('\n  - check: ')}` : ''
        }`,
      );
    file.characters[key] = next;
    read++;
  }
  file.readBy = 'script';
  save(file);
  console.log(`${source}: ${read} read, ${kept} kept as they were.`);
  report(`sources-${source}`, lines.length ? lines : ['No change.']);
}

// --- The language-model step (--llm): settle what the KQM reader flagged.

const ROLES: BuildRole[] = [
  'on_field_dps',
  'off_field_dps',
  'support',
  'healer',
  'shield',
  'reaction_dps',
];

async function settleWithModel(
  character: string,
  build: SourceBuild,
  text: string,
): Promise<void> {
  const { createLlmClient } = await import('../llm/client');
  const { loadLlmConfig } = await import('../llm/config');
  const client = createLlmClient(loadLlmConfig());
  const res = await client.chat({
    system:
      'You read Genshin Impact build guides. Answer with one JSON object and nothing else.',
    messages: [
      {
        role: 'user',
        content:
          `Character: ${character}. Build: "${build.name}".\n` +
          `The guide's artifact stats section:\n${text.slice(0, 3000)}\n\n` +
          `Reply as {"role": one of ${ROLES.join(', ')}, "substats": [the substat priority, best first, as written]}.`,
      },
    ],
    maxOutputTokens: 300,
  });
  const json = res.text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return;
  const answer = JSON.parse(json) as { role?: string; substats?: string[] };
  const note = `settled by the language model (${client.model}); check it`;
  if (build.roleFrom === 'review' && ROLES.includes(answer.role as BuildRole)) {
    build.role = answer.role as BuildRole;
    build.flags = (build.flags ?? []).filter(
      (f) => !f.startsWith('role not clear'),
    );
    build.flags.push(`role ${note}`);
  }
  if (!build.substats.length && answer.substats?.length) {
    const { stats } = readStats(answer.substats.join(' > '), 'sub', false);
    if (stats.length) {
      build.substats = stats;
      build.flags = (build.flags ?? []).filter(
        (f) => f !== 'no stat priority line',
      );
      build.flags.push(`substats ${note}`);
    }
  }
}

// --- Commands

async function kqm() {
  const llm = flag('llm');
  await readSource(
    'kqm',
    (key, name, prev) => {
      if (prev?.url) return prev.url;
      const src = META_TARGETS[key]?.source;
      if (src?.includes('/q/')) return src;
      const slug = name.split(' ').slice(-1)[0].toLowerCase();
      return `https://keqingmains.com/q/${slug}-quickguide/`;
    },
    async (html, key) => {
      const page = parseKqmGuide(html);
      if (llm)
        for (const b of page.builds)
          if (b.roleFrom === 'review' || !b.substats.length)
            try {
              await settleWithModel(
                genshinAdapter.character(key)?.name ?? key,
                b,
                page.texts[b.name] ?? '',
              );
            } catch (e) {
              (b.flags ??= []).push(
                `language model failed: ${(e as Error).message}`,
              );
            }
      return {
        ...(page.updatedFor && { updatedFor: page.updatedFor }),
        builds: page.builds,
        ...(page.issues.length && { issues: page.issues }),
      };
    },
  );
}

async function genshinBuilds() {
  await readSource(
    'genshinBuilds',
    (key, _name, prev) =>
      prev?.url ?? `https://genshin-builds.com/en/character/${key}`,
    (html) => {
      const page = parseGenshinBuildsPage(html);
      return {
        builds: page.builds,
        ...(page.teams.length && { teams: page.teams }),
        ...(page.issues.length && { issues: page.issues }),
      };
    },
  );
}

async function genshinGg() {
  const index = await getPage('https://genshin.gg/builds/', { refresh });
  const slugs = new Set(index ? genshinGgSlugs(index.html) : []);
  await readSource(
    'genshinGg',
    (key, name, prev) => {
      const slug = genshinGgSlugFor(key, name, slugs);
      return slug ? `https://genshin.gg/characters/${slug}/` : prev?.url;
    },
    (html) => {
      const page = parseGenshinGgPage(html);
      return {
        builds: page.build ? [page.build] : [],
        ...(page.issues.length && { issues: page.issues }),
      };
    },
  );
}

/** Kit-based candidates for UNUSED_STATS: a burst with no energy cost
 *  (Energy Recharge does nothing), or a passive that takes away CRIT Rate.
 *  Read from genshin-db; the owner confirms each one by hand. */
function exceptions() {
  const require = createRequire(import.meta.url);
  const genshindb = require('genshin-db');
  const lines: string[] = [];
  for (const { key, name } of characters()) {
    const t = genshindb.talents(name);
    if (!t) {
      lines.push(`- **${key}**: genshin-db has no talents`);
      continue;
    }
    const burst = t.combat3;
    const labels: string[] = burst?.attributes?.labels ?? [];
    const costLabel = labels.find((l) => /energy cost/i.test(l));
    const param = costLabel?.match(/\{(param\d+)/)?.[1];
    const cost = param ? burst.attributes.parameters?.[param]?.[0] : undefined;
    const passives = [t.passive1, t.passive2, t.passive3, t.passive4]
      .filter(Boolean)
      .map((p: { name: string; description: string }) => p.description ?? '')
      .join(' ');
    const has = UNUSED_STATS[key]?.stats ?? [];
    const found: string[] = [];
    if (!costLabel || cost === 0)
      found.push(
        `burst energy cost ${costLabel ? 0 : 'not listed'}: Energy Recharge may do nothing${has.includes('er_pct') ? ' (already an exception)' : ''}`,
      );
    if (
      /CRIT Rate[^.]{0,60}(decreased|reduced) by 100%|100% (decrease|reduction) in CRIT Rate/i.test(
        passives,
      )
    )
      found.push(
        `a passive takes away CRIT Rate${has.includes('crit_rate') ? ' (already an exception)' : ''}`,
      );
    if (found.length) lines.push(`- **${key}**: ${found.join('; ')}`);
  }
  for (const key of Object.keys(UNUSED_STATS))
    if (!lines.some((l) => l.includes(`**${key}**`)))
      lines.push(
        `- **${key}**: an exception the kit check didn't find; check it by hand`,
      );
  console.log(lines.join('\n') || 'No candidates.');
  report('sources-exceptions', [
    'Candidates for `UNUSED_STATS` (packages/engine/src/roster/artifactQuality.ts). Nothing is added automatically: confirm each against the kit.',
    '',
    ...lines,
  ]);
}

/** Test only (owner, 2026-10-07): genshin-builds' teams against the curated
 *  team archetypes, to see what a teams source would add. */
function teams() {
  const gb = load('genshinBuilds');
  const seen = new Map<
    string,
    { name: string; tier?: string; members: string[]; from: string[] }
  >();
  for (const [key, c] of Object.entries(gb.characters))
    for (const t of c.teams ?? []) {
      const members = t.members.map((m) => m.characterKey).sort();
      const id = members.join('+');
      const e = seen.get(id) ?? {
        name: t.name,
        tier: t.tier,
        members,
        from: [],
      };
      e.from.push(key);
      seen.set(id, e);
    }
  const comps = COMP_ARCHETYPES.map((a) => ({
    id: a.id,
    members: new Set(
      a.slots.flatMap((s) => s.options.map((o) => o.characterKey)),
    ),
  }));
  const lines: string[] = [];
  let matched = 0;
  for (const t of seen.values()) {
    const best = comps
      .map((c) => ({
        id: c.id,
        n: t.members.filter((m) => c.members.has(m)).length,
      }))
      .sort((a, b) => b.n - a.n)[0];
    const hit = best && best.n >= 3;
    if (hit) matched++;
    lines.push(
      `- ${t.tier ?? '–'} **${t.name}**: ${t.members.join(', ')}${hit ? ` → like archetype \`${best.id}\` (${best.n} of 4)` : ' → no archetype like it'}`,
    );
  }
  const covered = new Set([...seen.values()].flatMap((t) => t.members));
  const uncovered = genshinAdapter
    .characters()
    .filter(
      (c) => !comps.some((a) => a.members.has(c.key)) && covered.has(c.key),
    )
    .map((c) => c.key);
  const head = [
    "**Test only, not development** (owner, 2026-10-07): what genshin-builds' teams would add to the curated archetypes.",
    '',
    `${seen.size} distinct teams on genshin-builds; ${matched} share 3 or more members with a curated archetype.`,
    `Characters in its teams but in no curated archetype (${uncovered.length}): ${uncovered.join(', ') || 'none'}.`,
    '',
  ];
  console.log(head.join('\n'));
  report('sources-teams-test', [...head, ...lines]);
}

const commands: Record<string, () => unknown> = {
  kqm,
  'genshin-builds': genshinBuilds,
  'genshin-gg': genshinGg,
  exceptions,
  teams,
};
const run = commands[command];
if (!run) {
  console.error(
    `npm run sources -- <${Object.keys(commands).join('|')}> [--only=a,b] [--refresh] [--llm]`,
  );
  process.exit(1);
}
await run();
