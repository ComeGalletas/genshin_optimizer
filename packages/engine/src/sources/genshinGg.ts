/**
 * A genshin.gg character page read into its one build (ADR-0060,
 * ADR-0061): the role, ranked sets with piece counts, main stats per slot
 * and the substat order, from the page's one template. Pure.
 * @packageDocumentation
 */
import { blocksOf } from './html';
import { readStats, roleOf, setKeyOf, squash } from './labels';
import type { SourceBuild } from './types';

export interface GenshinGgPage {
  build?: SourceBuild;
  /** The site's own role label (Main DPS, Sub DPS, Support). */
  roleLabel?: string;
  issues: string[];
}

/** The character page slugs listed on genshin.gg's builds page. */
export function genshinGgSlugs(indexHtml: string): string[] {
  return [
    ...new Set(
      [...indexHtml.matchAll(/href="\/characters\/([^"/]+)\//g)].map(
        (m) => m[1],
      ),
    ),
  ];
}

/** Which slug is a character's, from their key and name ("childe" is
 *  Tartaglia's, set by hand). */
export function genshinGgSlugFor(
  key: string,
  name: string,
  slugs: ReadonlySet<string>,
  overrides: Record<string, string> = { tartaglia: 'childe' },
): string | undefined {
  if (overrides[key]) return overrides[key];
  return [key, name, ...name.split(' ')].map(squash).find((n) => slugs.has(n));
}

export function parseGenshinGgPage(html: string): GenshinGgPage {
  const issues: string[] = [];
  const lines = blocksOf(html).map((b) =>
    b.kind === 'row' ? b.cells.join(' ') : b.text,
  );
  const head = lines.findIndex((l) => /^Genshin Impact .* Build$/.test(l));
  const a = lines.findIndex((l) => / Best Artifacts$/.test(l));
  const b = lines.findIndex((l) => / Best Stats$/.test(l));
  if (head < 0 || a < 0 || b < 0) {
    issues.push('page not in the usual template');
    return { issues };
  }
  // "1 | Set | 4 | 2 | Set | 2 | Set | 2 | 3 | ...": a rank, then each set
  // with its piece count.
  const sets: string[][] = [];
  let cur: string[] = [];
  for (let i = a + 1; i < b; i++) {
    const l = lines[i];
    if (/^\d+$/.test(l)) {
      if (setKeyOf(lines[i - 1] ?? '')) continue;
      if (cur.length) sets.push(cur);
      cur = [];
      continue;
    }
    const set = setKeyOf(l);
    if (set) cur.push(set);
    else issues.push(`set "${l}" not in the dataset`);
  }
  if (cur.length) sets.push(cur);
  // "Sands: HP% / ER" on one line, or the label and its value on two.
  const after = (label: string) => {
    const i = lines.findIndex((l, j) => j > b && l.startsWith(label));
    if (i < 0) return '';
    const rest = lines[i].slice(label.length).trim();
    return rest || (lines[i + 1] ?? '');
  };
  const flags: string[] = [];
  const main = (label: string) => {
    const { stats, unread } = readStats(after(label), 'main');
    if (unread.length)
      flags.push(`${label} couldn't read ${unread.join(', ')}`);
    return stats;
  };
  const roleLabel = lines[head + 3] ?? '';
  const role = roleOf(roleLabel);
  if (!role) flags.push(`role not clear from "${roleLabel}"`);
  // Its substats write "ATK" for flat ATK and "ATK%" for the percent.
  const subs = readStats(after('Substats:'), 'sub', true);
  if (subs.unread.length)
    flags.push(`substats couldn't read ${subs.unread.join(', ')}`);
  const build: SourceBuild = {
    name: roleLabel || 'Build',
    role: role ?? 'on_field_dps',
    roleFrom: role ? 'label' : 'review',
    mains: {
      sands: main('Sands:'),
      goblet: main('Goblet:'),
      circlet: main('Circlet:'),
    },
    substats: subs.stats,
    sets,
  };
  if (flags.length) build.flags = flags;
  return { build, roleLabel, issues };
}
