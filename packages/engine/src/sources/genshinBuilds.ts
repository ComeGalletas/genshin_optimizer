/**
 * A genshin-builds.com character page read into builds and teams
 * (ADR-0061). The page carries its data as serialized component props
 * (`CharacterBuildTabs`, `CharacterTeamsSection`), so nothing is read from
 * prose: each build's role, "recommended" flag, ranked sets (slugs), main
 * stats per slot and stat priority; each team's tier and members. Pure.
 * @packageDocumentation
 */
import { genshinAdapter } from '../game/genshin/adapter';
import { decodeEntities } from './html';
import { constellationOf, readStats, roleOf, setKeyOf } from './labels';
import type { SourceBuild, SourceTeam, Slot3 } from './types';

/** Astro's serialized props: `[0, value]` for a value, `[1, [...]]` for an
 *  array, other tags for types the page doesn't use here (kept as given). */
export function decodeAstroProps(v: unknown): unknown {
  if (Array.isArray(v) && typeof v[0] === 'number' && v.length <= 2) {
    const [tag, x] = v as [number, unknown];
    if (tag === 0) return decodeAstroProps(x);
    if (tag === 1) return (x as unknown[]).map(decodeAstroProps);
    return x;
  }
  if (v && typeof v === 'object' && !Array.isArray(v))
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, decodeAstroProps(x)]),
    );
  return v;
}

/** The props of the page's first island for a component, or undefined. */
export function islandProps(html: string, component: string) {
  const re = new RegExp(
    `<astro-island[^>]*component-url="[^"]*/${component}\\.[^"]*"[^>]*props="([^"]*)"`,
  );
  const m = html.match(re);
  if (!m) return undefined;
  return decodeAstroProps(JSON.parse(decodeEntities(m[1]))) as Record<
    string,
    unknown
  >;
}

interface RawBuild {
  name?: string;
  role?: string;
  recommended?: boolean;
  sets?: string[][];
  stats?: Partial<Record<Slot3 | 'flower' | 'plume', string[]>>;
  stats_priority?: string[];
}

interface RawTeam {
  name?: string;
  tier?: string;
  characters?: { id?: string; role?: string; c_min?: number }[];
}

export interface GenshinBuildsPage {
  builds: SourceBuild[];
  teams: SourceTeam[];
  issues: string[];
}

export function parseGenshinBuildsPage(html: string): GenshinBuildsPage {
  const issues: string[] = [];
  const tabs = islandProps(html, 'CharacterBuildTabs');
  if (!tabs) issues.push('no CharacterBuildTabs data on the page');
  const builds: SourceBuild[] = [];
  for (const raw of (tabs?.builds as RawBuild[]) ?? []) {
    const flags: string[] = [];
    const name = (raw.name ?? '').replace(/\s+/g, ' ').trim() || 'Build';
    const label = (raw.role ?? name).replace(/\s+/g, ' ').trim();
    const role = roleOf(label) ?? roleOf(name);
    if (!role) flags.push(`role not clear from "${label}"`);
    const mains = {} as SourceBuild['mains'];
    for (const slot of ['sands', 'goblet', 'circlet'] as const) {
      const { stats, unread } = readStats(
        (raw.stats?.[slot] ?? []).join(' / '),
        'main',
      );
      mains[slot] = stats;
      if (!stats.length) flags.push(`no ${slot} main stat`);
      if (unread.length)
        flags.push(`${slot}: couldn't read ${unread.join(', ')}`);
    }
    // Its stat priority writes "HP" for flat HP and "HP%" for the percent.
    const subs = readStats((raw.stats_priority ?? []).join(' > '), 'sub', true);
    if (subs.unread.length)
      flags.push(`substats: couldn't read ${subs.unread.join(', ')}`);
    if (!subs.stats.length) flags.push('no stat priority');
    // A set slug the dataset doesn't know is a generic bonus ("20hp_set"):
    // an entry holding one is a generic mix, and is left out.
    const sets = (raw.sets ?? []).flatMap((entry) => {
      const keys = entry.map((s) => setKeyOf(s));
      return keys.every(Boolean) ? [keys as string[]] : [];
    });
    const build: SourceBuild = {
      name,
      role: role ?? 'on_field_dps',
      roleFrom: role ? 'label' : 'review',
      mains,
      substats: subs.stats,
      sets,
    };
    const c = constellationOf(`${name} ${label}`);
    if (c) build.constellation = c;
    if (raw.recommended === false)
      build.excluded = 'the page marks it not recommended';
    if (/out of date/i.test(name))
      build.excluded = 'the page marks it out of date';
    if (flags.length) build.flags = flags;
    builds.push(build);
  }

  const section = islandProps(html, 'CharacterTeamsSection');
  const teams: SourceTeam[] = [];
  for (const raw of (section?.teams as RawTeam[]) ?? []) {
    const members = (raw.characters ?? []).map((c) => ({
      characterKey: c.id ?? '',
      role: c.role ?? '',
      ...(c.c_min ? { minConstellation: c.c_min } : {}),
    }));
    const unknown = members.filter(
      (m) => !genshinAdapter.character(m.characterKey),
    );
    if (unknown.length)
      issues.push(
        `team "${raw.name}": ${unknown.map((m) => m.characterKey).join(', ')} not in the dataset`,
      );
    teams.push({
      name: (raw.name ?? '').trim(),
      ...(raw.tier && { tier: raw.tier }),
      members,
    });
  }
  return { builds, teams, issues };
}
