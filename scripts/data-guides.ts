/**
 * `npm run data:guides`: write the app's guide data from `data/sources/`
 * (ADR-0061). KQM's and genshin-builds' files merge into
 * `packages/engine/src/meta/guideBuilds.ts` (ADR-0059's rules), genshin.gg's
 * into `meta/genshinGg.generated.json` (the cross-check, ADR-0060). Then
 * says what changed, for review before committing.
 *
 *   npm run data:guides            write the files
 *   npm run data:guides -- --check fail if they don't match the sources
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as prettier from 'prettier';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  genshinGgData,
  mergeGuideBuilds,
} from '@genshin-build-lab/engine/sources/merge';
import type { SourceFile } from '@genshin-build-lab/engine/sources/types';
import type { CharacterGuides } from '@genshin-build-lab/engine/meta/guideBuilds';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = path.join(ROOT, 'data/sources');
const BUILDS_TS = path.join(ROOT, 'packages/engine/src/meta/guideBuilds.ts');
const GG_JSON = path.join(
  ROOT,
  'packages/engine/src/meta/genshinGg.generated.json',
);

const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(SOURCES, name), 'utf8')) as SourceFile;

const HEAD = `/**
 * Guide builds (ADR-0059): every artifact build the guides list for each
 * character, for the artifact score. Written by \`npm run data:guides\` from
 * \`data/sources/\` (ADR-0061): edit the sources or re-read them
 * (\`npm run sources\`), never this file. Not optimizer defaults:
 * \`META_TARGETS\` stays the only source of those.
 *
 * - Builds from the two guides with the same role (and constellation) are
 *   one build: the main stats either names, the sets either names, KQM's
 *   substats and Energy Recharge minimum. Other builds stay separate.
 * - Energy Recharge, two figures per build (ADR-0062): \`erMin\` to burst
 *   every rotation, \`erEveryOther\` to burst every other rotation (100%
 *   when the guide says it isn't worth building), each the lower bound of
 *   the first case the guide gives; \`erWeapons\` are its weapon-specific
 *   figures. Shown beside the character's Energy Recharge, never limits
 *   on the score.
 * - \`unscored\` lists builds the guide leaves a main stat or the substats
 *   out of, and why, so the window can say so.
 * - Builds their own guide marks not recommended or out of date are left
 *   out (owner, 2026-10-07).
 * - Varka's KQM goblet is a Pyro, Hydro, Electro or Cryo DMG one over his
 *   own Anemo; only an Anemo one is accepted until a goblet can name an
 *   element.
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';

export type BuildRole =
  | 'on_field_dps'
  | 'off_field_dps'
  | 'support'
  | 'healer'
  | 'shield'
  | 'reaction_dps';

export type GuideSource = 'kqm' | 'genshinBuilds';

export interface GuideBuild {
  /** As the guide names it (a generic name becomes the role). */
  name: string;
  role: BuildRole;
  /** The constellation the build needs, such as "C6". */
  constellation?: string;
  sources: GuideSource[];
  accepts: Record<'sands' | 'goblet' | 'circlet', StatKey[]>;
  /** In the guide's order; flat stats count at 0.4 in the score. */
  substats: StatKey[];
  /** Ranked; a 2+2 names both sets. */
  sets: string[];
  /** Including the base 100%: to burst every rotation. */
  erMin?: number;
  /** To burst every other rotation. */
  erEveryOther?: number;
  erWeapons?: { weapon: string; min: number }[];
}

export interface CharacterGuides {
  kqm?: string;
  genshinBuilds?: string;
  builds: GuideBuild[];
  unscored?: { name: string; source: GuideSource; reason: string }[];
}

export const GUIDE_BUILDS: Record<string, CharacterGuides> = `;

/** What changed between the app's data and the merge, by character. */
function changes(
  before: Record<string, CharacterGuides>,
  after: Record<string, CharacterGuides>,
): string[] {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    const names = (c?: CharacterGuides) => (c?.builds ?? []).map((x) => x.name);
    const added = names(a).filter((n) => !names(b).includes(n));
    const removed = names(b).filter((n) => !names(a).includes(n));
    const changed = (a?.builds ?? [])
      .filter((x) => {
        const old = b?.builds.find((y) => y.name === x.name);
        return old && JSON.stringify(old) !== JSON.stringify(x);
      })
      .map((x) => x.name);
    out.push(
      `${key}: ${[
        added.length && `+ ${added.join(', ')}`,
        removed.length && `- ${removed.join(', ')}`,
        changed.length && `changed ${changed.join(', ')}`,
        !added.length &&
          !removed.length &&
          !changed.length &&
          'links or unscored list',
      ]
        .filter(Boolean)
        .join('; ')}`,
    );
  }
  return out;
}

async function main() {
  const check = process.argv.includes('--check');
  const merged = mergeGuideBuilds(
    read('kqm.json'),
    read('genshin-builds.json'),
    (k) => genshinAdapter.character(k)?.name ?? k,
  );
  const options = await prettier.resolveConfig(BUILDS_TS);
  const ts = await prettier.format(
    `${HEAD}${JSON.stringify(merged, null, 2)};\n`,
    { ...options, filepath: BUILDS_TS },
  );
  const gg = `${JSON.stringify(genshinGgData(read('genshin-gg.json')), null, 1)}\n`;

  const oldTs = fs.existsSync(BUILDS_TS)
    ? fs.readFileSync(BUILDS_TS, 'utf8')
    : '';
  const oldGg = fs.existsSync(GG_JSON) ? fs.readFileSync(GG_JSON, 'utf8') : '';
  if (check) {
    const stale = [ts !== oldTs && BUILDS_TS, gg !== oldGg && GG_JSON].filter(
      Boolean,
    );
    if (stale.length) {
      console.error(
        `data:guides --check failed: ${stale.join(', ')} don't match data/sources/. Run \`npm run data:guides\`.`,
      );
      process.exit(1);
    }
    console.log('data:guides --check — ok.');
    return;
  }

  const { GUIDE_BUILDS: before } =
    await import('@genshin-build-lab/engine/meta/guideBuilds');
  fs.writeFileSync(BUILDS_TS, ts, 'utf8');
  fs.writeFileSync(GG_JSON, gg, 'utf8');
  const all = Object.values(merged);
  const builds = all.reduce((s, c) => s + c.builds.length, 0);
  console.log(
    `guide builds: ${builds} for ${all.length} characters (${all.filter((c) => c.builds.length > 1).length} with several), ` +
      `${all.reduce((s, c) => s + (c.unscored?.length ?? 0), 0)} not scored.`,
  );
  const diff = changes(before, merged);
  console.log(
    diff.length
      ? `Changed against the app's data (${diff.length}):\n  ${diff.join('\n  ')}`
      : 'No change against the app’s data.',
  );
  console.log('Review the diff (git diff) before committing.');
}

await main();
