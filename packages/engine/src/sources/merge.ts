/**
 * The sources merged into the app's guide data (ADR-0059, ADR-0061): the
 * rules `npm run data:guides` applies to `data/sources/`. Pure.
 *
 * - KQM's builds first, then each genshin-builds build joins the KQM build
 *   with the same role and constellation (main stats and sets either
 *   names, KQM's substats and Energy Recharge figure), or stands alone.
 * - Builds a source excludes (not recommended, out of date) are left out.
 * - Builds missing a main stat or the substats are listed as not scored,
 *   with why.
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';
import type {
  BuildRole,
  CharacterGuides,
  GuideBuild,
  GuideSource,
} from '../meta/guideBuilds';
import type { GenshinGgBuild } from '../meta/genshinGg';
import type { SourceBuild, SourceFile, Slot3 } from './types';

const SLOTS: Slot3[] = ['sands', 'goblet', 'circlet'];

export const ROLE_LABEL: Record<BuildRole, string> = {
  on_field_dps: 'On-field DPS',
  off_field_dps: 'Off-field DPS',
  support: 'Support',
  healer: 'Healer',
  shield: 'Shield',
  reaction_dps: 'Reaction DPS',
};

const uniq = <T>(xs: T[]) => [...new Set(xs)];

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bDps\b/g, 'DPS')
    .replace(/\bEr\b/g, 'ER')
    .replace(/\bEm\b/g, 'EM')
    .replace(/\bC(\d)\b/gi, 'C$1');
}

/** A build's name as shown: a shouting label in title case, and a generic
 *  one ("General", the character's own name) as its role. */
export function buildLabel(characterName: string, b: SourceBuild): string {
  let n = b.name.trim();
  if (n === n.toUpperCase()) n = titleCase(n);
  const who = characterName.toLowerCase();
  const words = [who, ...who.split(' ')].filter(Boolean);
  const paren = n.match(/^([^()]+)\(([^)]+)\)$/);
  if (paren && words.includes(paren[1].trim().toLowerCase()))
    n = paren[2].trim();
  if (/^general$/i.test(n) || words.includes(n.toLowerCase()))
    n = ROLE_LABEL[b.role];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Why a build can't be scored, or null. */
export function whyUnscored(b: SourceBuild): string | null {
  const missing = SLOTS.filter((s) => !b.mains[s]?.length);
  if (missing.length)
    return `the guide gives no ${missing.join(' or ')} main stat`;
  if (!b.substats.length) return 'the guide gives no substat priority';
  return null;
}

const flatSets = (b: SourceBuild) => uniq(b.sets.flat());

function asGuideBuild(
  name: string,
  b: SourceBuild,
  source: GuideSource,
): GuideBuild {
  return {
    name,
    role: b.role,
    ...(b.constellation && { constellation: b.constellation }),
    sources: [source],
    accepts: Object.fromEntries(
      SLOTS.map((s) => [s, uniq(b.mains[s])]),
    ) as Record<Slot3, StatKey[]>,
    substats: uniq(b.substats),
    sets: flatSets(b),
    ...(b.erMin !== undefined && { erMin: b.erMin }),
    ...(b.erWeapons?.length && { erWeapons: [...b.erWeapons] }),
  };
}

/** Every character's guide builds, from KQM's and genshin-builds' files. */
export function mergeGuideBuilds(
  kqm: SourceFile,
  genshinBuilds: SourceFile,
  nameOf: (characterKey: string) => string,
): Record<string, CharacterGuides> {
  const keys = uniq([
    ...Object.keys(kqm.characters),
    ...Object.keys(genshinBuilds.characters),
  ]).sort((a, b) => a.localeCompare(b));
  const out: Record<string, CharacterGuides> = {};
  for (const key of keys) {
    const k = kqm.characters[key];
    const g = genshinBuilds.characters[key];
    const builds: GuideBuild[] = [];
    const unscored: CharacterGuides['unscored'] = [];
    const take = (b: SourceBuild, source: GuideSource) => {
      if (b.excluded) return null;
      const why = whyUnscored(b);
      if (why) {
        unscored.push({
          name: buildLabel(nameOf(key), b),
          source,
          reason: why,
        });
        return null;
      }
      return b;
    };
    for (const b of k?.builds ?? []) {
      if (take(b, 'kqm'))
        builds.push(asGuideBuild(buildLabel(nameOf(key), b), b, 'kqm'));
    }
    for (const b of g?.builds ?? []) {
      if (!take(b, 'genshinBuilds')) continue;
      const m = builds.find(
        (x) =>
          x.sources.length === 1 &&
          x.sources[0] === 'kqm' &&
          x.role === b.role &&
          (x.constellation ?? null) === (b.constellation ?? null),
      );
      if (m) {
        for (const s of SLOTS)
          m.accepts[s] = uniq([...m.accepts[s], ...b.mains[s]]);
        m.sets = uniq([...m.sets, ...flatSets(b)]);
        m.sources.push('genshinBuilds');
        if (m.erMin === undefined && b.erMin !== undefined) m.erMin = b.erMin;
        if (b.erWeapons?.length)
          m.erWeapons = [...(m.erWeapons ?? []), ...b.erWeapons];
      } else
        builds.push(
          asGuideBuild(buildLabel(nameOf(key), b), b, 'genshinBuilds'),
        );
    }
    out[key] = {
      ...(k?.url && { kqm: k.url }),
      ...(g?.url && { genshinBuilds: g.url }),
      builds,
      ...(unscored.length && { unscored }),
    };
  }
  return out;
}

/** genshin.gg's file as the cross-check's data. */
export function genshinGgData(gg: SourceFile) {
  const builds: Record<string, GenshinGgBuild> = {};
  let fetched = '';
  for (const [key, c] of Object.entries(gg.characters).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const b = c.builds[0];
    if (!b) continue;
    if (c.fetched > fetched) fetched = c.fetched;
    builds[key] = {
      url: c.url,
      role: b.name,
      sets: b.sets,
      mains: {
        sands: b.mains.sands,
        goblet: b.mains.goblet,
        circlet: b.mains.circlet,
      },
      substats: b.substats,
    };
  }
  return { source: gg.site, fetched, builds };
}
