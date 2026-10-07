/**
 * Reading the guides' words into dataset keys (ADR-0061): stat labels, set
 * names and build roles. A word it can't read comes back undefined, to be
 * flagged, never guessed. Pure.
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import type { BuildRole } from '../meta/guideBuilds';

/** A name compared loosely: lower case, letters and digits only. */
export const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]/g, '');

const ELEMENTS = 'pyro|hydro|electro|cryo|anemo|geo|dendro|elemental|phec|ele';

const MAIN: Record<string, StatKey> = {
  hp: 'hp_pct',
  hppct: 'hp_pct',
  atk: 'atk_pct',
  atkpct: 'atk_pct',
  def: 'def_pct',
  defpct: 'def_pct',
  er: 'er_pct',
  erpct: 'er_pct',
  energyrecharge: 'er_pct',
  energyrechage: 'er_pct',
  em: 'em',
  elementalmastery: 'em',
  elementalmaster: 'em',
  critrate: 'crit_rate',
  critdmg: 'crit_dmg',
  healing: 'healing',
  healingbonus: 'healing',
  hb: 'healing',
  physical: 'physical_dmg',
  physicaldmg: 'physical_dmg',
  physicaldmgbonus: 'physical_dmg',
};

const SUB: Record<string, StatKey> = {
  ...MAIN,
  hp: 'hp',
  atk: 'atk',
  def: 'def',
  flathp: 'hp',
  flatatk: 'atk',
  flatdef: 'def',
};

/**
 * The stats one label names: "Hydro DMG Bonus" is the elemental goblet,
 * "CRIT" both crit stats, "HP%" HP% (as a main stat, "HP" too), "Flat HP"
 * flat HP. Parentheses ("ER (until requirement)") are dropped. Empty for a
 * label it can't read.
 */
export function statsOf(
  label: string,
  kind: 'main' | 'sub',
  bareIsFlat = true,
): StatKey[] {
  const raw = label.replace(/\([^)]*\)/g, '').trim();
  const k = squash(raw.replace(/%/g, 'pct'));
  if (!k) return [];
  if (new RegExp(`^(${ELEMENTS})dmg(bonus)?(pct)?$`).test(k))
    return ['elemental_dmg'];
  if (k === 'crit' || k === 'critratecritdmg' || k === 'critratedmg')
    return ['crit_rate', 'crit_dmg'];
  // A source that writes "Flat HP" for flat HP means HP% by a bare "HP".
  const table = kind === 'main' || !bareIsFlat ? MAIN : SUB;
  if (kind === 'sub' && /^flat(hp|atk|def)$/.test(k)) return [SUB[k]];
  // "HP%" squashes to "hppct"; a bare "HP" substat is flat HP. A "%" on any
  // other stat ("CRIT DMG%", "EM%") means nothing more.
  const v = table[k] ?? table[k.replace(/pct$/, '')];
  return v ? [v] : [];
}

/** A list of labels split on the guides' separators: "A / B", "A or B",
 *  "A > B", "A = B", "A >= B", "A, B". */
export function splitLabels(text: string): string[] {
  return (
    text
      .replace(/\([^)]*\)/g, ' ')
      // Footnote marks, "until requirement(s)", a leading "Nilou Bloom:",
      // and figures ("200–300 EM") are not stats.
      .replace(/[*¹²³†]/g, '')
      .replace(/\buntil requirements?\b/gi, '')
      .replace(/^[^:>]{1,40}:\s*/, '')
      .replace(/\b\d+\s*[–-]\s*\d+\s*/g, '')
      .split(/\s*(?:>=|≥|≈|>|=|\/|,|\bor\b|\band\b|\|)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Every stat a run of labels names, in order, once each; and the labels
 *  it couldn't read. */
export function readStats(
  text: string,
  kind: 'main' | 'sub',
  bareIsFlat = true,
): { stats: StatKey[]; unread: string[] } {
  const stats: StatKey[] = [];
  const unread: string[] = [];
  // "CRIT Rate/DMG" is both crit stats.
  const expanded = text.replace(
    /crit rate\s*\/\s*dmg/gi,
    'CRIT Rate / CRIT DMG',
  );
  for (const label of splitLabels(expanded)) {
    const s = statsOf(label, kind, bareIsFlat);
    if (s.length) {
      for (const x of s) if (!stats.includes(x)) stats.push(x);
    } else if (!/^(any|dmg)$/i.test(label)) {
      unread.push(label);
    }
  }
  return { stats, unread };
}

let setByName: Map<string, string> | undefined;

/** Edit distance, for a guide's misspelt set name. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = cur;
    }
  }
  return row[b.length];
}

/** A set's dataset key from its name or slug ("Ocean-Hued Clam",
 *  "oceanhued_clam", "4pc Ocean-Hued Clam (OHC)"); undefined if unknown.
 *  With `loose`, a guide's shorthand matches too: a name one or two letters
 *  off ("Emblem of Severe Fate"), the initials ("TotM", "EoSF") or the
 *  first word ("Husk", "Tenacity"), when only one set fits. The caller
 *  flags it. */
export function setKeyOf(name: string, loose = false): string | undefined {
  setByName ??= new Map(
    genshinAdapter.sets().flatMap((s) => [
      [squash(s.name), s.key],
      [squash(s.key), s.key],
    ]),
  );
  const k = squash(
    name
      .replace(/\([^)]*\)?/g, '')
      .replace(/^\s*[24]\s*pc\s*/i, '')
      .replace(/\bset\b/gi, ''),
  );
  const exact = setByName.get(k);
  if (exact || !loose || k.length < 3) return exact;
  const one = (keys: string[]) => {
    const u = [...new Set(keys)];
    return u.length === 1 ? u[0] : undefined;
  };
  const sets = genshinAdapter.sets();
  const words = (n: string) =>
    n.split(/[\s-]+/).filter((w) => !/^(of|the|in|and|a)$/i.test(w));
  // Initials of the name's words, "of" and "the" included ("totm").
  const initials = one(
    sets
      .filter(
        (s) =>
          k.length >= 3 &&
          s.name
            .split(/[\s-]+/)
            .map((w) => w[0])
            .join('')
            .toLowerCase() === k,
      )
      .map((s) => s.key),
  );
  if (initials) return initials;
  // The first word, or near it ("husk", "voroukasha").
  const first = one(
    sets
      .filter((s) => {
        const w = squash(words(s.name)[0] ?? '');
        return (
          k.length >= 4 &&
          w.length >= 4 &&
          distance(w, k) <= (w.length >= 8 ? 3 : 2)
        );
      })
      .map((s) => s.key),
  );
  if (first) return first;
  if (k.length < 10) return undefined;
  return one(
    [...setByName].filter(([n]) => distance(n, k) <= 2).map(([, v]) => v),
  );
}

/** Whether a set cell's text is a generic bonus ("2pc ATK%", "Any
 *  combination of", "Physical DMG%"), not a set's name. */
export const isGenericSetText = (s: string) =>
  /combination|combo|\bany\b|dmg|bonus|%|^\s*[24]\s*pc\s*(hp|atk|def|em|er|healing)\b|elemental|physical/i.test(
    s,
  );

/** A build's role from its label or name ("HEAL SUPPORT", "Bloom DPS",
 *  "Off-Field Support"), or undefined when nothing in it says. */
export function roleOf(label: string): BuildRole | undefined {
  const s = label.toLowerCase().replace(/\s+/g, ' ');
  // A transformative reaction is the build's role when it drives the
  // damage ("Bloom DPS", "Burgeon", "Hyperbloom / Overloaded Trigger"); in
  // "Reaction Support" it only says what the support does.
  const reaction =
    /bloom|burgeon|transformative|reaction|swirl|overloaded|driver/.test(s) &&
    (/dps|damage|driver|trigger/.test(s) ||
      !/support|buff|enabler|battery|heal|shield/.test(s));
  // Otherwise the role named first wins: labels lead with the main one
  // ("DPS & Buff Support", "Off-Field DPS & Buff and Heal Support").
  const roles: [BuildRole, RegExp][] = [
    ['off_field_dps', /off[- ]?field (dps|damage)|sub[- ]?dps|quickswap/],
    ['healer', /heal/],
    ['shield', /shield/],
    ['support', /support|buff|enabler|battery|utility/],
    ['on_field_dps', /dps|damage|nuke|carry|driver/],
  ];
  const first = roles
    .map(([role, re]) => ({ role, at: s.search(re) }))
    .filter((r) => r.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  if (reaction && (!first || /dps|damage|driver|trigger/.test(s)))
    return 'reaction_dps';
  if (first) return first.role;
  // "On-Field" alone describes where a build plays, not what it does.
  if (/on[- ]?field/.test(s)) return 'on_field_dps';
  // A team archetype alone ("Freeze / Mono Cryo", "Reverse Melt") is a
  // damage build.
  if (
    /freeze|melt|vaporize|mono|aggravate|spread|electro-?charged|overload/.test(
      s,
    )
  )
    return 'on_field_dps';
  return undefined;
}

/** The constellation a build's name says it needs ("C6", "C6 or Burst
 *  Talent Level 10+"), but not "Pre-C6" or "C0–C5". */
export function constellationOf(name: string): string | undefined {
  if (/pre-?\s*c\d|c0/i.test(name)) return undefined;
  const m = name.match(/(?:^|[^\w-])C([1-6])\b/);
  return m ? `C${m[1]}` : undefined;
}
