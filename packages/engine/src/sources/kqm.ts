/**
 * A KQM quick guide read into builds (ADR-0061). Each build is a top-level
 * section holding "Artifact Stats" (a Sands / Goblet / Circlet table and a
 * "Stat Priority:" line) and "Artifact Sets" (one row per set); the Energy
 * Recharge tables sit in one "ER Requirements" section, one sub-heading per
 * playstyle. What can't be read surely is flagged for review (or for the
 * optional language-model step), never guessed. Pure.
 * @packageDocumentation
 */
import { blocksOf, sectionAfter, type Block } from './html';
import { genshinAdapter } from '../game/genshin/adapter';
import {
  constellationOf,
  isGenericSetText,
  readStats,
  roleOf,
  setKeyOf,
  squash,
} from './labels';
import type { SourceBuild, Slot3 } from './types';

const SLOTS: Slot3[] = ['sands', 'goblet', 'circlet'];

/** What one guide page holds. */
export interface KqmPage {
  updatedFor?: string;
  builds: SourceBuild[];
  /** Each build's Artifact Stats text, by build name: what a person (or the
   *  language-model step) reads to settle a flag. */
  texts: Record<string, string>;
  issues: string[];
}

const isHeading = (b: Block, re: RegExp) => b.kind === 'h' && re.test(b.text);

/** The main stats from the Sands / Goblet / Circlet table. */
function readMains(section: Block[], flags: string[]) {
  const mains: Record<Slot3, SourceBuild['mains'][Slot3]> = {
    sands: [],
    goblet: [],
    circlet: [],
  };
  const rows = section.filter((b) => b.kind === 'row') as Extract<
    Block,
    { kind: 'row' }
  >[];
  const head = rows.findIndex((r) =>
    r.cells.some((c) => /^\s*sands\s*$/i.test(c)),
  );
  if (head < 0 || !rows[head + 1]) {
    flags.push('no main-stat table');
    return mains;
  }
  const cols = rows[head].cells.map((c) => c.trim().toLowerCase());
  const values = rows[head + 1].cells;
  for (const slot of SLOTS) {
    const i = cols.indexOf(slot);
    const text = i >= 0 ? (values[i] ?? '') : '';
    const { stats, unread } = readStats(text, 'main');
    mains[slot] = stats;
    if (!stats.length) flags.push(`no ${slot} main stat read from "${text}"`);
    if (unread.length)
      flags.push(`${slot}: couldn't read ${unread.join(', ')}`);
  }
  return mains;
}

/** The substat lines: "Stat Priority: A > B", "Substats:" with the list
 *  on the next line, or one line per variant ("Stat Priority (EM Build):
 *  ..."), each with its variant's name. */
function substatLines(section: Block[]): { variant?: string; text: string }[] {
  const out: { variant?: string; text: string }[] = [];
  section.forEach((b, i) => {
    if (b.kind !== 'text') return;
    const m = b.text.match(
      /^(?:sub\s*stats?|stat priority)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/i,
    );
    if (!m) return;
    const next = section[i + 1];
    const text = m[2] || (next?.kind === 'text' ? next.text : '');
    out.push({ ...(m[1] && { variant: m[1].trim() }), text });
  });
  return out;
}

function readSubstats(text: string, flags: string[]) {
  // KQM writes "Flat HP" for flat HP: a bare "ATK" or "HP" is the percent.
  const { stats, unread } = readStats(text, 'sub', false);
  if (unread.length) flags.push(`substats: couldn't read ${unread.join(', ')}`);
  return stats;
}

/** The ranked sets, one row each: "4pc Ocean-Hued Clam (OHC)" or
 *  "2pc Gilded Dreams + 2pc Wanderer's Troupe". */
function readSets(section: Block[], flags: string[]) {
  const sets: string[][] = [];
  for (const b of section) {
    if (b.kind !== 'row') continue;
    const label = b.cells[0]?.trim() ?? '';
    if (!/\b[24]\s*pc\b/i.test(label)) continue;
    if (/\bsets\b/i.test(label)) continue; // "4pc Support Sets": a heading
    // "2pc A + 2pc B" is one pair; anything else in the cell is sets tied
    // at the same rank, split on "/", "," or a new "4pc".
    const entries: string[][] =
      /2\s*pc[^+]*\+\s*2\s*pc/i.test(label) && !/[,/]/.test(label)
        ? [label.split(/\s*\+\s*(?=2\s*pc)/i)]
        : label
            .split(/\s*[,/]\s*|\s+(?=[24]\s*pc)/i)
            .map((p) => p.trim())
            .filter((p) => p && !p.includes('+'))
            .map((p) => [p]);
    // In a 2-piece row only a named pair counts; a lone fragment of a
    // generic mix ("2pc combinations of CW / MH / TF") is left out quietly.
    const twoPiece = /^\s*2\s*pc/i.test(label);
    for (const parts of entries) {
      if (twoPiece && parts.length === 1) continue;
      const keys = parts.map((p) => setKeyOf(p.trim()));
      if (keys.every(Boolean)) {
        sets.push(keys as string[]);
        continue;
      }
      // A guide's misspelling ("Emblem of Severe Fate"): read, and flagged.
      const loose = parts.map((p) => setKeyOf(p.trim(), true));
      if (loose.every(Boolean)) {
        sets.push(loose as string[]);
        flags.push(
          `set name read loosely: "${parts.join(' + ')}" as ${loose.join(' + ')}`,
        );
      } else if (!isGenericSetText(parts.join(' + ')))
        flags.push(`set not in the dataset: "${parts.join(' + ')}"`);
      // A generic 2-piece bonus ("2pc EM", "2pc + 2pc EM / ER") names no
      // set: left out quietly.
    }
  }
  if (!sets.length) flags.push('no artifact sets read');
  return sets;
}

/** "195–245%" → 195; "100%" → 100. */
const lowerBound = (cell: string) => {
  const m = cell.match(/(\d{2,3})(?:\s*%)?\s*(?:[–-]\s*\d{2,3}\s*)?%/);
  return m ? Number(m[1]) : undefined;
};

let weaponNames: string[] | undefined;
/** Whether a column heading names a weapon ("P. Amber R5", "Favonius
 *  Lance"), not a team ("Double Pyro"). */
function isWeaponColumn(head: string): boolean {
  if (!head) return false;
  if (
    /\bR[1-5]\b|favonius|\bfav\b|sacrificial|\bsac\b|kitain|amber/i.test(head)
  )
    return true;
  weaponNames ??= genshinAdapter.weapons().map((w) => squash(w.name));
  const h = squash(head);
  return weaponNames.some((w) => w.length > 5 && h.includes(w));
}

/** One Energy Recharge table: the first row's figure in the base column,
 *  and the weapon columns' figures. */
function readErTable(rows: { cells: string[] }[]) {
  const data = rows.filter((r) => r.cells.some((c) => lowerBound(c)));
  const header = rows.find((r) => !r.cells.some((c) => lowerBound(c)));
  const first = data[0];
  if (!first) return undefined;
  // Align the header with the data from the right: a row's first cell is
  // often its own label ("Solo Hydro") with an empty header cell above it.
  const h = header?.cells ?? [];
  const shift = first.cells.length - h.length;
  const columns = first.cells.map((cell, i) => ({
    head: (h[i - shift] ?? '').trim(),
    value: lowerBound(cell),
  }));
  const numeric = columns.filter((c) => c.value !== undefined);
  const base =
    numeric.find((c) => /base|other|any|all|general|^$/i.test(c.head)) ??
    numeric[0];
  return {
    erMin: base?.value,
    erWeapons: numeric
      .filter((c) => c !== base && isWeaponColumn(c.head))
      .map((c) => ({ weapon: c.head, min: c.value! })),
    firstRow: first.cells[0]?.trim(),
  };
}

/** The Energy Recharge section's tables, by sub-heading ("" when there is
 *  none). */
function readErSection(blocks: Block[]) {
  const at = blocks.findIndex((b) =>
    isHeading(b, /^(er|energy recharge) requirements?/i),
  );
  if (at < 0) return new Map<string, ReturnType<typeof readErTable>>();
  const out = new Map<string, ReturnType<typeof readErTable>>();
  let name = '';
  let rows: { cells: string[] }[] = [];
  const flush = () => {
    const t = readErTable(rows);
    if (t) out.set(name, t);
    rows = [];
  };
  for (const b of sectionAfter(blocks, at)) {
    if (b.kind === 'h') {
      flush();
      name = b.text;
    } else if (b.kind === 'row') rows.push(b);
  }
  flush();
  return out;
}

/** A KQM guide's builds. */
export function parseKqmGuide(html: string): KqmPage {
  const blocks = blocksOf(html);
  const issues: string[] = [];
  const updated = blocks.find(
    (b) => b.kind !== 'row' && /^updated for version/i.test(b.text),
  );
  const updatedFor =
    updated && updated.kind !== 'row'
      ? updated.text
          .replace(/^updated for version\s*/i, '')
          .replace(/["\u201c\u201d]/g, '')
          .trim()
      : undefined;

  const er = readErSection(blocks);
  const holds = (i: number) => {
    const section = sectionAfter(blocks, i);
    const count = (re: RegExp) =>
      section.filter((x) => isHeading(x, re)).length;
    return count(/^artifact stats/i) === 1 && count(/^artifact sets/i) === 1;
  };
  const qualifying = blocks.flatMap((b, i) =>
    b.kind === 'h' && holds(i) ? [i] : [],
  );
  // Innermost only: a build's own heading over an "Artifacts" heading holds
  // the same stats; the inner one is read, named after the outer.
  const inner = qualifying.filter(
    (i) =>
      !qualifying.some(
        (j) => j > i && sectionAfter(blocks, i).includes(blocks[j]),
      ),
  );
  const generic = /^(artifacts?|builds?|artifact stats and sets)$/i;
  const nameOf = (i: number) => {
    let level = (blocks[i] as Extract<Block, { kind: 'h' }>).level;
    let text = (blocks[i] as Extract<Block, { kind: 'h' }>).text;
    for (let k = i - 1; k >= 0 && generic.test(text); k--) {
      const b = blocks[k];
      if (b.kind === 'h' && b.level < level) {
        if (/quick guide|^updated for/i.test(b.text)) break;
        level = b.level;
        text = b.text;
      }
    }
    return generic.test(text) ? 'General' : text.trim();
  };
  const builds: SourceBuild[] = [];
  const texts: Record<string, string> = {};
  for (const i of inner) {
    const section = sectionAfter(blocks, i);
    const statsAt = section.findIndex((x) => isHeading(x, /^artifact stats/i));
    const setsAt = section.findIndex((x) => isHeading(x, /^artifact sets/i));
    const statsBlocks = sectionAfter(section, statsAt);
    const setsBlocks = sectionAfter(section, setsAt);
    const name = nameOf(i);
    const sets = readSets(setsBlocks, []);
    // Several builds can share one Artifact Stats section, each under its
    // own sub-heading with its own table ("Healing Support", "C6 or Burst
    // Talent Level 10+"); otherwise the section is one build.
    const variants = statsBlocks.flatMap((b, k) =>
      b.kind === 'h' &&
      sectionAfter(statsBlocks, k).some(
        (r) =>
          r.kind === 'row' && r.cells.some((c) => /^\s*sands\s*$/i.test(c)),
      )
        ? [{ variant: b.text.trim(), blocks: sectionAfter(statsBlocks, k) }]
        : [],
    );
    const parts = variants.length
      ? variants
      : [{ variant: undefined as string | undefined, blocks: statsBlocks }];
    for (const part of parts) {
      const shared: string[] = [];
      const mains = readMains(part.blocks, shared);
      readSets(setsBlocks, shared);
      let lines = substatLines(part.blocks);
      if (!lines.length) {
        shared.push('no stat priority line');
        lines = [{ text: '' }];
      }
      // One build per stat-priority line ("EM Build", "CRIT Build").
      for (const line of lines) {
        const flags = [...shared];
        const label = [part.variant, line.variant].filter(Boolean).join(', ');
        const full = !label
          ? name
          : name === 'General'
            ? label
            : `${name} (${label})`;
        const role = roleOf(full) ?? roleOf(name);
        const build: SourceBuild = {
          name: full,
          role: role ?? 'on_field_dps',
          roleFrom: role ? 'name' : 'review',
          mains,
          substats: line.text ? readSubstats(line.text, flags) : [],
          sets,
        };
        if (!role) flags.push(`role not clear from "${full}"`);
        const c = constellationOf(full);
        if (c) build.constellation = c;
        if (/not recommended/i.test(full))
          build.excluded = 'the guide marks it not recommended';
        if (flags.length) build.flags = flags;
        builds.push(build);
        texts[full] = part.blocks
          .map((x) => (x.kind === 'row' ? x.cells.join(' | ') : x.text))
          .join('\n');
      }
    }
  }
  if (!builds.length)
    issues.push('no build sections (Artifact Stats + Artifact Sets) found');

  // Energy Recharge: a table per playstyle, matched to the builds by name.
  const tables = [...er.entries()];
  for (const b of builds) {
    const match =
      tables.length === 1
        ? tables[0]
        : tables.find(([name]) => {
            const n = squash(name);
            const bn = squash(b.name);
            return (
              n && (bn.startsWith(n) || n.startsWith(bn) || bn.includes(n))
            );
          });
    if (!match) {
      if (tables.length)
        (b.flags ??= []).push('no Energy Recharge table matched by name');
      continue;
    }
    const [tableName, t] = match;
    if (!t) continue;
    if (t.erMin !== undefined) b.erMin = t.erMin;
    if (t.erWeapons.length) b.erWeapons = t.erWeapons;
    if (tables.length === 1 && builds.length > 1)
      (b.flags ??= []).push(
        `one Energy Recharge table${tableName ? ` ("${tableName}")` : ''} for every build`,
      );
  }
  return { ...(updatedFor && { updatedFor }), builds, texts, issues };
}
