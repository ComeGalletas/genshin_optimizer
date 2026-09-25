/**
 * `npm run data:coverage`: print what the app has for every character and
 * weapon (genshin-db stats, meta recipe, damage profile, team archetypes,
 * weapon obtainability, gcsim support). The report itself is built by the
 * engine's pure `buildDataCoverage`; this script only formats it.
 *
 *   npm run data:coverage            summary plus Markdown tables
 *   npm run data:coverage -- --json  the raw report, for tools
 */
import { buildDataCoverage } from '@genshin-build-lab/engine/data-coverage/dataCoverage';
import {
  GAME_VERSION,
  GENSHIN_DB_VERSION,
} from '@genshin-build-lab/engine/game/genshin/adapter';
import { CURATION_PATCH } from '@genshin-build-lab/engine/curation';

const report = buildDataCoverage();

// No process.exit() after writing: on a pipe, stdout is flushed
// asynchronously and exiting early truncated the JSON at 64 KiB.
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printMarkdown();
}

function printMarkdown(): void {
  const yes = (b: boolean) => (b ? 'yes' : '—');
  const list = (keys: string[]) => (keys.length ? keys.join(', ') : 'none');
  const table = (head: string[], rows: string[][]) =>
    [
      `| ${head.join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');

  const s = report.summary;
  console.log(`# Data coverage

genshin-db ${GENSHIN_DB_VERSION}, game version ${GAME_VERSION}; curated tables as of patch ${CURATION_PATCH}. gcsim support is unknown until Phase 5.

## Summary

- Characters: ${s.characters}. Meta target ${s.charactersWithMetaTarget}, damage profile ${s.charactersWithDamageProfile}, in a team archetype ${s.charactersInArchetypes}.
- Curated but missing from genshin-db: ${list(s.charactersMissingFromGenshinDb)}.
- In genshin-db with no curated data (${s.charactersUncurated.length}): ${list(s.charactersUncurated)}.
- Weapons: ${s.weapons}. Obtainability entry ${s.weaponsWithObtainability}, a meta pick ${s.weaponsAsMetaPick}.
- Curated but missing from genshin-db: ${list(s.weaponsMissingFromGenshinDb)}.
- Meta picks with no obtainability entry (${s.metaPicksWithoutObtainability.length}): ${list(s.metaPicksWithoutObtainability)}.

## Characters

${table(
  [
    'Character',
    'Element',
    'Weapon',
    'genshin-db',
    'Meta target',
    'Damage profile',
    'Archetypes',
    'gcsim',
  ],
  report.characters.map((c) => [
    c.name,
    c.element ?? '—',
    c.weaponType ?? '—',
    yes(c.inGenshinDb),
    yes(c.metaTarget),
    yes(c.damageProfile),
    String(c.archetypes.length),
    c.gcsim,
  ]),
)}

## Weapons

${table(
  [
    'Weapon',
    'Type',
    'Rarity',
    'genshin-db',
    'Meta pick for',
    'Obtainability',
    'gcsim',
  ],
  report.weapons.map((w) => [
    w.name,
    w.type ?? '—',
    w.rarity ? `${w.rarity}★` : '—',
    yes(w.inGenshinDb),
    w.metaPickFor.length ? w.metaPickFor.join(', ') : '—',
    yes(w.obtainability),
    w.gcsim,
  ]),
)}`);
}
