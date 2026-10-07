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
  /** The page's overview of the character's playstyles or roles, when it
   *  has one: context for the language-model step. */
  overview?: string;
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
    // An abbreviation on its own line ("(Scroll)") names nothing new.
    const label = (b.cells[0] ?? '').replace(/\([^)]*\)/g, ' ').trim();
    if (!/\b[24]\s*pc\b/i.test(label)) continue;
    if (/\bsets\b/i.test(label)) continue; // "4pc Support Sets": a heading
    // "2pc A + 2pc B" is one pair; anything else in the cell is sets tied
    // at the same rank, split on "/", "," or a new "4pc".
    const pieces = label
      .split(/\s*[,/]\s*|\s+(?=[24]\s*pc)/i)
      .map((p) => p.trim())
      .filter(Boolean);
    // A name wrapped onto a second line ("4pc Scroll of the / Hero of
    // Cinder City") is one name again.
    const joined: string[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const both = `${pieces[i]} ${pieces[i + 1] ?? ''}`;
      if (pieces[i + 1] && !setKeyOf(pieces[i]) && setKeyOf(both)) {
        joined.push(both);
        i++;
      } else joined.push(pieces[i]);
    }
    const entries: string[][] =
      /2\s*pc[^+]*\+\s*2\s*pc/i.test(label) && !/[,/]/.test(label)
        ? [label.split(/\s*\+\s*(?=2\s*pc)/i)]
        : joined.filter((p) => !p.includes('+')).map((p) => [p]);
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
  if (!head || /teammate/i.test(head)) return false;
  if (/\bsig(nature)?\b/i.test(head)) return true;
  if (
    /\bR[1-5]\b|favonius|\bfav\b|sacrificial|\bsac\b|kitain|amber/i.test(head)
  )
    return true;
  weaponNames ??= genshinAdapter.weapons().map((w) => squash(w.name));
  const h = squash(head);
  return weaponNames.some((w) => w.length > 5 && h.includes(w));
}

/** How often a heading's figures assume the burst is used: "Burst Every
 *  Rot", "Every Rotation"; "Burst Every Other", "Baseline (Every Other
 *  Rotation)", "every 2 rotations". */
function cadenceOf(text: string): 'rotation' | 'other' | undefined {
  if (/every\s*other|every\s*(2|two)\b|alternate|when available/i.test(text))
    return 'other';
  if (/every\s*rot|each\s*rot/i.test(text)) return 'rotation';
  return undefined;
}

/** A column for one constellation ("Every Rotation (C4+)", "C4+"): not the
 *  general figure. */
const forConstellation = (head: string) =>
  // "Pre-C4" and "C0–C5" are the general case.
  !/pre-?\s*c\d|c0\s*[–-]/i.test(head) && /\bC[1-6]\b/.test(head);

/** The general column: "Base", "Baseline", "Other Weapons", "Any". */
const isBaseColumn = (head: string) =>
  /^$|\b(base(line)?|other weapons?|general|any weapon)\b/i.test(head);

interface ErFigures {
  /** To burst every rotation. */
  erMin?: number;
  /** To burst every other rotation. */
  erEveryOther?: number;
  erWeapons: { weapon: string; min: number }[];
}

/** One Energy Recharge table: from the first row, the figure to burst
 *  every rotation (a column saying so, else the general column, else the
 *  first), the one to burst every other rotation (a column saying so), and
 *  the weapon columns' figures. A table under a heading that names a
 *  cadence gives that cadence's figure. */
function readErTable(
  rows: { cells: string[] }[],
  tableCadence?: 'rotation' | 'other',
): ErFigures | undefined {
  const data = rows.filter((r) => r.cells.some((c) => lowerBound(c)));
  const header = rows.find((r) => !r.cells.some((c) => lowerBound(c)));
  if (!data.length) return undefined;
  // Align the header with the data from the right: a row's first cell is
  // often its own label ("Solo Hydro") with an empty header cell above it.
  const h = header?.cells ?? [];
  const columnsOf = (
    row: { cells: string[] },
    rowCadence?: 'rotation' | 'other',
  ) => {
    const shift = row.cells.length - h.length;
    return row.cells
      .map((cell, i) => {
        const head = (h[i - shift] ?? '').trim();
        return {
          head,
          value: lowerBound(cell),
          cadence: cadenceOf(head) ?? rowCadence ?? tableCadence,
        };
      })
      .filter((c) => c.value !== undefined && !forConstellation(c.head));
  };
  type Column = ReturnType<typeof columnsOf>[number];
  const pick = (cs: Column[]) =>
    cs.find((c) => cadenceOf(c.head)) ??
    cs.find((c) => isBaseColumn(c.head)) ??
    cs[0];
  // Rows labelled by cadence: the first row of each.
  const labelled = data.map((r) => ({ r, c: cadenceOf(r.cells[0] ?? '') }));
  const byRows = labelled.some((x) => x.c);
  // Rows labelled by weapon ("Favonius Lance", ..., "Other"): the "Other"
  // row is the general figure, the named ones the weapon figures.
  const rowLabel = (r: { cells: string[] }) => (r.cells[0] ?? '').trim();
  const otherWeaponsRow = data.find((r) =>
    /^(other|other weapons?|any other weapon)$/i.test(rowLabel(r)),
  );
  const weaponRows = otherWeaponsRow
    ? data.filter((r) => r !== otherWeaponsRow && isWeaponColumn(rowLabel(r)))
    : [];
  const rotationRow = byRows
    ? labelled.find((x) => x.c !== 'other')?.r
    : (otherWeaponsRow ?? data[0]);
  const otherRow = byRows ? labelled.find((x) => x.c === 'other')?.r : data[0];
  const rotationColumns = rotationRow
    ? columnsOf(rotationRow, byRows ? 'rotation' : undefined)
    : [];
  const otherColumns = otherRow
    ? columnsOf(otherRow, byRows ? 'other' : undefined)
    : [];
  const rotation = pick(rotationColumns.filter((c) => c.cadence !== 'other'));
  const other = pick(otherColumns.filter((c) => c.cadence === 'other'));
  return {
    ...(rotation && { erMin: rotation.value }),
    ...(other && { erEveryOther: other.value }),
    erWeapons: [
      ...rotationColumns
        .filter(
          (c) =>
            c !== rotation && c.cadence !== 'other' && isWeaponColumn(c.head),
        )
        .map((c) => ({ weapon: c.head, min: c.value! })),
      ...weaponRows.flatMap((r) => {
        const v = pick(
          columnsOf(r).filter((c) => c.cadence !== 'other'),
        )?.value;
        return v === undefined ? [] : [{ weapon: rowLabel(r), min: v }];
      }),
    ],
  };
}

/** The guide saying Energy Recharge isn't worth building when the burst
 *  waits ("use it when available", "can forgo building ER", "cast it when
 *  it's available"): every other rotation then needs none beyond the base. */
const SKIP_ER =
  /when (it[’']?s |it is )?(available|convenient)|forgo (building )?er|not worth investing in er|(don[’']?t|do not|no need to) build er|not (generally )?(recommended|optimal|worth it) to burst|burst is (generally )?not (optimal|recommended|worth)|reserved for emergenc/i;

/** The Energy Recharge section's figures, by sub-heading ("" when there is
 *  none). A sub-heading that only names a cadence ("Burst Every Other
 *  Rotation") adds to the playstyle above it. */
function readErSection(blocks: Block[]) {
  const out = new Map<string, ErFigures>();
  const at = blocks.findIndex((b) =>
    isHeading(b, /^(er|energy recharge) requirements?/i),
  );
  if (at < 0) return { tables: out, skipEr: false };
  const section = sectionAfter(blocks, at);
  let name = '';
  let cadence: 'rotation' | 'other' | undefined;
  let rows: { cells: string[] }[] = [];
  const flush = () => {
    const t = readErTable(rows, cadence);
    rows = [];
    if (!t) return;
    const prev = out.get(name);
    out.set(name, {
      erMin: prev?.erMin ?? t.erMin,
      erEveryOther: prev?.erEveryOther ?? t.erEveryOther,
      erWeapons: prev?.erWeapons.length ? prev.erWeapons : t.erWeapons,
    });
  };
  for (const b of section) {
    if (b.kind === 'h') {
      flush();
      const c = cadenceOf(b.text);
      const rest = b.text
        .replace(/burst|every\s*(other|rot\w*|2|two)|rotations?|[()]/gi, '')
        .trim();
      if (c && !rest) cadence = c;
      else {
        name = b.text;
        cadence = c;
      }
    } else if (b.kind === 'row') rows.push(b);
  }
  flush();
  const skipEr = section.some((b) => b.kind === 'text' && SKIP_ER.test(b.text));
  return { tables: out, skipEr };
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
  const tables = [...er.tables.entries()];
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
    // One build, several tables (by team or weapon): the first case, as
    // the Energy Recharge rule takes everywhere.
    const fallback = !match && builds.length === 1 ? tables[0] : undefined;
    const t = (match ?? fallback)?.[1];
    if (t) {
      const tableName = (match ?? fallback)![0];
      if (t.erMin !== undefined) b.erMin = t.erMin;
      if (t.erEveryOther !== undefined) b.erEveryOther = t.erEveryOther;
      if (t.erWeapons.length) b.erWeapons = t.erWeapons;
      if (fallback)
        (b.flags ??= []).push(
          `Energy Recharge from the page's first table${tableName ? ` ("${tableName}")` : ''}`,
        );
      if (tables.length === 1 && builds.length > 1)
        (b.flags ??= []).push(
          `one Energy Recharge table${tableName ? ` ("${tableName}")` : ''} for every build`,
        );
    } else if (tables.length)
      (b.flags ??= []).push('no Energy Recharge table matched by name');
    // "Use it when available": every other rotation needs none beyond the
    // base (the owner's rule, 2026-10-07).
    if (er.skipEr && b.erEveryOther === undefined) b.erEveryOther = 100;
  }
  const ovAt = blocks.findIndex((b) =>
    isHeading(b, /^(playstyles?|roles?|character overview)\b/i),
  );
  const overview =
    ovAt >= 0
      ? sectionAfter(blocks, ovAt)
          .map((x) => (x.kind === 'row' ? x.cells.join(' | ') : x.text))
          .join('\n')
      : undefined;
  return {
    ...(updatedFor && { updatedFor }),
    builds,
    texts,
    ...(overview && { overview }),
    issues,
  };
}
