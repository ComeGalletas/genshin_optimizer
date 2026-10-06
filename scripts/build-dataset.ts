/**
 * Build script: generate packages/engine/src/game/genshin/data.generated.json from genshin-db.
 *
 * ADR-0002: frozen snapshot – app imports the JSON, not genshin-db.
 * ADR-0003: stat-only set bonuses; elemental 2pc → elemental_dmg.
 * ADR-0006: character/weapon base stats at ascension breakpoints only (1,20,40,50,60,70,80,90).
 *
 * One of three `tsx`-run repo tools, none of them shipped in the app bundle:
 * this one bakes the frozen reference dataset, `check-docs.ts` gates ADR and
 * knowledge-bundle consistency, and `benchmark.ts` times the optimiser.
 *
 * Main-stat value tables are hardcoded constants (the artifact scaling tables are
 * fixed game constants; genshin-db does not expose a per-level/rarity main-stat table).
 * Linear fill between the known base (level 0) and max (level 20) values is used:
 * endpoints are exact, mid-level values may be slightly off. Known approximation
 * as of 2026-08, re-checked per patch via docs/runbooks/patch-refresh.md.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  BUILD_LEVELS,
  ELEMENTS,
  isFlatStat,
  WEAPON_TYPES,
} from '@genshin-build-lab/engine/game/types';
import {
  characterStatsAt,
  weaponStatsAt,
  type CharacterDetails,
  type CharacterTexts,
  type Details,
  type TalentKind,
  type TalentText,
  type WeaponDetails,
} from '@genshin-build-lab/engine/game/genshin/details';

const require = createRequire(import.meta.url);
// genshin-db uses CommonJS; we use createRequire to load it in an ESM script.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const genshindb: any = require('genshin-db');

// The genshin-db release this snapshot is built from. `released` becomes the
// snapshot's `generatedAt`: a fixed date rather than the wall clock, so two
// builds are byte-identical and CI's drift check stays meaningful. When you
// bump genshin-db, update both fields from `npm view genshin-db time`; the
// build refuses to run while they disagree with the installed package.
const GENSHIN_DB_RELEASE = { version: '5.2.14', released: '2026-09-21' };

function checkGenshinDbRelease(): string {
  const installed: string = require('genshin-db/package.json').version;
  if (installed !== GENSHIN_DB_RELEASE.version) {
    throw new Error(
      `genshin-db ${installed} is installed but GENSHIN_DB_RELEASE pins ` +
        `${GENSHIN_DB_RELEASE.version}. Update GENSHIN_DB_RELEASE in ` +
        `scripts/build-dataset.ts (version and release date from ` +
        `\`npm view genshin-db time\`).`,
    );
  }
  return installed;
}

/** Compare two "major.minor" game versions numerically ("7.10" > "7.9"). */
function compareVersions(a: string, b: string): number {
  const [aMaj, aMin] = a.split('.').map(Number);
  const [bMaj, bMin] = b.split('.').map(Number);
  return aMaj - bMaj || aMin - bMin;
}

/**
 * The game version the snapshot covers: the newest `version` genshin-db gives
 * any included character, weapon or set. Derived rather than typed in, so it
 * can't go stale the way a hand-kept patch string did (the snapshot held 7.0
 * content while still labelled 6.7).
 */
function newestGameVersion(
  characters: { name: string }[],
  weapons: { name: string }[],
  sets: { name: string }[],
): string {
  const versions: string[] = [
    ...characters.map((c) => genshindb.characters(c.name)?.version),
    ...weapons.map((w) => genshindb.weapons(w.name)?.version),
    ...sets.map((s) => genshindb.artifacts(s.name)?.version),
  ].filter((v): v is string => typeof v === 'string' && /^\d+\.\d+$/.test(v));
  if (versions.length === 0) {
    throw new Error('genshin-db returned no game versions for the snapshot.');
  }
  return versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
}

// ---------------------------------------------------------------------------
// Stat key mapping: genshin-db substat name → our StatKey
// ---------------------------------------------------------------------------

const SUBSTAT_TO_KEY: Record<string, string> = {
  // Weapon secondary stats: genshin-db always returns 'ATK', 'HP', 'DEF' as
  // fractional values (0..1), meaning these are always PERCENTAGE secondaries
  // (e.g. ATK secondary = ATK%, not flat ATK). Map accordingly so base ATK
  // is never overwritten and pctToPercent() is applied correctly.
  HP: 'hp_pct',
  ATK: 'atk_pct',
  DEF: 'def_pct',
  'HP%': 'hp_pct',
  'ATK%': 'atk_pct',
  'DEF%': 'def_pct',
  'CRIT Rate': 'crit_rate',
  'CRIT DMG': 'crit_dmg',
  'Energy Recharge': 'er_pct',
  'Elemental Mastery': 'em',
  'Healing Bonus': 'healing',
  'Physical DMG Bonus': 'physical_dmg',
  // All elemental DMG bonuses map to elemental_dmg (ADR-0003)
  'Pyro DMG Bonus': 'elemental_dmg',
  'Hydro DMG Bonus': 'elemental_dmg',
  'Electro DMG Bonus': 'elemental_dmg',
  'Cryo DMG Bonus': 'elemental_dmg',
  'Anemo DMG Bonus': 'elemental_dmg',
  'Geo DMG Bonus': 'elemental_dmg',
  'Dendro DMG Bonus': 'elemental_dmg',
};

// Allowlists: lowercase the genshindb value, then skip anything non-standard.
// `ELEMENTS`, `WEAPON_TYPES` and `BUILD_LEVELS` come from the app's own domain
// types so the snapshot can never be built against a list the app doesn't
// recognise.
const ELEMENT_NAMES: readonly string[] = ELEMENTS;
const WEAPON_TYPE_NAMES: readonly string[] = WEAPON_TYPES;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a percentage value from genshin-db (0..1 range) to a 0..100 range. */
function pctToPercent(v: number): number {
  return Math.round(v * 10000) / 100; // e.g. 0.466 → 46.6
}

/** Round to 2 decimal places. */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Canonical "GOOD"-format key from an English name (the de-facto community
 * standard used by GOOD inventory exports, e.g. "Emblem of Severed Fate" ->
 * "EmblemOfSeveredFate", "Gladiator's Finale" -> "GladiatorsFinale").
 * Artifact set keys MUST use this format so imported (GOOD) artifacts match the
 * adapter's set-bonus keys and set-requirement constraints (ADR-0006 import path).
 */
function goodKey(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// ---------------------------------------------------------------------------
// Parse 2pc bonus text → StatKey + value (ADR-0003)
// ---------------------------------------------------------------------------

/**
 * Parse a 2pc set bonus description string into a {statKey: value} pair.
 * Only recognises flat-stat and elemental DMG bonuses.
 * Returns null for unrecognisable bonuses (e.g. shield strength, resistances).
 */
function parse2pc(text: string): Record<string, number> | null {
  if (!text) return null;

  // Elemental DMG +15% — value AFTER the element (e.g. "Pyro DMG Bonus +15%")
  const eleDmgMatch = text.match(
    /(?:Pyro|Hydro|Electro|Cryo|Anemo|Geo|Dendro)\s+DMG\s+Bonus\s+\+(\d+(?:\.\d+)?)%/i,
  );
  if (eleDmgMatch) return { elemental_dmg: parseFloat(eleDmgMatch[1]) };

  // Elemental DMG — value BEFORE the element (e.g. Archaic Petra: "Gain a 15% Geo DMG Bonus.")
  const eleDmgMatchValueFirst = text.match(
    /(\d+(?:\.\d+)?)%\s+(?:Pyro|Hydro|Electro|Cryo|Anemo|Geo|Dendro)\s+DMG\s+Bonus/i,
  );
  if (eleDmgMatchValueFirst)
    return { elemental_dmg: parseFloat(eleDmgMatchValueFirst[1]) };

  // Physical DMG — handles "Physical DMG +25%", "Physical DMG Bonus +25%",
  // and "Physical DMG is increased by 25%" (Pale Flame).
  const physMatch = text.match(
    /Physical\s+DMG\s+(?:(?:Bonus\s+)?\+|is\s+increased\s+by\s+)(\d+(?:\.\d+)?)%/i,
  );
  if (physMatch) return { physical_dmg: parseFloat(physMatch[1]) };

  // ATK +18% (percentage)
  const atkPctMatch = text.match(/^ATK\s+\+(\d+(?:\.\d+)?)%/i);
  if (atkPctMatch) return { atk_pct: parseFloat(atkPctMatch[1]) };

  // HP +20% (percentage)
  const hpPctMatch = text.match(/^HP\s+\+(\d+(?:\.\d+)?)%/i);
  if (hpPctMatch) return { hp_pct: parseFloat(hpPctMatch[1]) };

  // DEF +30% (percentage)
  const defPctMatch = text.match(/^DEF\s+\+(\d+(?:\.\d+)?)%/i);
  if (defPctMatch) return { def_pct: parseFloat(defPctMatch[1]) };

  // Energy Recharge +20%
  const erMatch = text.match(/Energy\s+Recharge\s+\+(\d+(?:\.\d+)?)%/i);
  if (erMatch) return { er_pct: parseFloat(erMatch[1]) };

  // CRIT Rate +12%
  const critRateMatch = text.match(/CRIT\s+Rate\s+\+(\d+(?:\.\d+)?)%/i);
  if (critRateMatch) return { crit_rate: parseFloat(critRateMatch[1]) };

  // CRIT DMG
  const critDmgMatch = text.match(/CRIT\s+DMG\s+\+(\d+(?:\.\d+)?)%/i);
  if (critDmgMatch) return { crit_dmg: parseFloat(critDmgMatch[1]) };

  // Elemental Mastery by 80
  const emMatch = text.match(/Elemental\s+Mastery\s+by\s+(\d+(?:\.\d+)?)\b/i);
  if (emMatch) return { em: parseFloat(emMatch[1]) };

  // Elemental Mastery +80
  const emMatch2 = text.match(/Elemental\s+Mastery\s+\+(\d+(?:\.\d+)?)\b/i);
  if (emMatch2) return { em: parseFloat(emMatch2[1]) };

  // Healing Bonus +15% / Healing Effectiveness +15%
  const healMatch = text.match(
    /Heal(?:ing)?\s+(?:Bonus|Effectiveness)\s+\+(\d+(?:\.\d+)?)%/i,
  );
  if (healMatch) return { healing: parseFloat(healMatch[1]) };

  // Flat HP: "Max HP increased by 1000" or "HP increased by..."
  const hpFlatMatch = text.match(
    /(?:Max\s+)?HP\s+(?:increased\s+by|by)\s+(\d+(?:\.\d+)?)\b/i,
  );
  if (hpFlatMatch) return { hp: parseFloat(hpFlatMatch[1]) };

  // DEF flat: "DEF +100" (no %)
  const defFlatMatch = text.match(
    /^DEF\s+(?:increased\s+by\s+|\+)(\d+(?:\.\d+)?)(?!\s*%)/i,
  );
  if (defFlatMatch) return { def: parseFloat(defFlatMatch[1]) };

  return null;
}

// ---------------------------------------------------------------------------
// Main-stat value tables (hardcoded game constants, ADR-0002)
// ---------------------------------------------------------------------------
//
// These are fixed constants from the game. genshin-db does not expose per-level
// main stat tables, so we hardcode them here with verified endpoints.
//
// 5★ artifact main stat values at +0 and +20 (level 0..20, linear interpolation).
// Known endpoints (5★ +20):
//   hp=4780, atk=311, hp_pct=46.6, atk_pct=46.6, def_pct=58.3(n/a as main sands),
//   em=187, er_pct=51.8, crit_rate=31.1, crit_dmg=62.2,
//   elemental_dmg=46.6, physical_dmg=58.3, healing=35.9
//
// 5★ +0 (base) values sourced from the Genshin wiki:
//   hp=717, atk=47, hp_pct=7.0, atk_pct=7.0, def_pct=8.7,
//   em=28, er_pct=7.8, crit_rate=4.7, crit_dmg=9.3,
//   elemental_dmg=7.0, physical_dmg=8.7, healing=5.4
//
// Known approximation as of 2026-08 (re-checked per patch via
// docs/runbooks/patch-refresh.md): real scaling uses a non-linear lookup table
// per rarity. Linear fill produces correct values at +0 and +20; mid-level
// (e.g. +10) may deviate by ~1-3% from in-game values. Acceptable while
// final-level (+20) artifacts are the primary optimisation target.

/** Build a linear 21-element array from base to max (indices 0..20). */
function linearFill(base: number, max: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i <= 20; i++) {
    arr.push(r2(base + ((max - base) * i) / 20));
  }
  return arr;
}

// 4★ artifact main stat values (endpoints from wiki):
// hp=3571→+20=2506(?), atk=23→+20=232...
// Actually the 4-star values at +20:
//   hp=3571, atk=232, hp_pct=34.8, atk_pct=34.8, def_pct=43.7,
//   em=140, er_pct=38.7, crit_rate=23.2, crit_dmg=46.6
//   elemental_dmg=34.8, physical_dmg=43.7, healing=26.8
// 4★ +0 base values (from wiki):
//   hp=430, atk=28, hp_pct=5.2, atk_pct=5.2, def_pct=6.6,
//   em=21, er_pct=5.8, crit_rate=3.5, crit_dmg=7.0
//   elemental_dmg=5.2, physical_dmg=6.6, healing=4.1

const MAIN_STAT_VALUES: Record<string, Record<string, number[]>> = {
  '5': {
    hp: linearFill(717, 4780),
    atk: linearFill(47, 311),
    hp_pct: linearFill(7.0, 46.6),
    atk_pct: linearFill(7.0, 46.6),
    def_pct: linearFill(8.7, 58.3),
    em: linearFill(28, 187),
    er_pct: linearFill(7.8, 51.8),
    crit_rate: linearFill(4.7, 31.1),
    crit_dmg: linearFill(9.3, 62.2),
    elemental_dmg: linearFill(7.0, 46.6),
    physical_dmg: linearFill(8.7, 58.3),
    healing: linearFill(5.4, 35.9),
  },
  '4': {
    hp: linearFill(430, 3571),
    atk: linearFill(28, 232),
    hp_pct: linearFill(5.2, 34.8),
    atk_pct: linearFill(5.2, 34.8),
    def_pct: linearFill(6.6, 43.7),
    em: linearFill(21, 140),
    er_pct: linearFill(5.8, 38.7),
    crit_rate: linearFill(3.5, 23.2),
    crit_dmg: linearFill(7.0, 46.6),
    elemental_dmg: linearFill(5.2, 34.8),
    physical_dmg: linearFill(6.6, 43.7),
    healing: linearFill(4.1, 26.8),
  },
};

// ---------------------------------------------------------------------------
// Image names (ADR-0052)
// ---------------------------------------------------------------------------

/** The game's asset names for each character, weapon and artifact piece,
 *  by dataset key. Only names: the app builds HoYoverse's and Enka's URLs
 *  from them, and no image is ever stored here. Written to
 *  `images.generated.json`, apart from the dataset, so the page can load it
 *  after it starts. */
const IMAGES: {
  characters: Record<string, { icon: string; side?: string }>;
  weapons: Record<string, string>;
  sets: Record<string, Record<string, string>>;
} = { characters: {}, weapons: {}, sets: {} };
const SLOT_NAMES = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const;

/** The game numbers a set's pieces flower 4, plume 2, sands 5, goblet 1,
 *  circlet 3 (`UI_RelicIcon_<set>_<n>`). */
const PIECE_NUMBER = { flower: 4, plume: 2, sands: 5, goblet: 1, circlet: 3 };

/** The names as stored: only the part that varies (`Furina` for
 *  `UI_AvatarIcon_Furina` and `UI_AvatarIcon_Side_Furina`, `Sword_Regalis`
 *  for `UI_EquipIcon_Sword_Regalis`, a set's number for its five
 *  `UI_RelicIcon_<n>_<piece>`), which `game/genshin/images.ts` expands. A
 *  name that breaks the pattern stops the build rather than being guessed:
 *  the pattern is the game's, and a change in it needs a look. */
function compactImages(all: typeof IMAGES) {
  const fail = (what: string) => {
    throw new Error(`image name outside the known pattern: ${what}`);
  };
  const characters = Object.fromEntries(
    Object.entries(all.characters).map(([k, v]) => {
      const m = /^UI_AvatarIcon_(.+)$/.exec(v.icon);
      if (!m || (v.side && v.side !== `UI_AvatarIcon_Side_${m[1]}`))
        fail(`character ${k} ${JSON.stringify(v)}`);
      return [k, m![1]];
    }),
  );
  const weapons = Object.fromEntries(
    Object.entries(all.weapons).map(([k, v]) => {
      const m = /^UI_EquipIcon_(.+)$/.exec(v);
      if (!m) fail(`weapon ${k} ${v}`);
      return [k, m![1]];
    }),
  );
  const sets = Object.fromEntries(
    Object.entries(all.sets).map(([k, v]) => {
      const ids = new Set(
        SLOT_NAMES.map((slot) => {
          const m = /^UI_RelicIcon_(\d+)_(\d)$/.exec(v[slot]);
          if (!m || Number(m[2]) !== PIECE_NUMBER[slot])
            fail(`set ${k} ${slot} ${v[slot]}`);
          return m![1];
        }),
      );
      if (ids.size !== 1) fail(`set ${k} ${JSON.stringify(v)}`);
      return [k, Number([...ids][0])];
    }),
  );
  return { characters, weapons, sets };
}

// ---------------------------------------------------------------------------
// Build characters
// ---------------------------------------------------------------------------

function buildCharacters() {
  const names: string[] = genshindb.characters('names', {
    matchCategories: true,
  });
  const result = [];

  for (const name of names) {
    const c = genshindb.characters(name);
    if (!c) continue;

    const element = String(c.elementText).toLowerCase();
    if (!ELEMENT_NAMES.includes(element)) continue; // skip non-standard elements

    // Same `weaponText` field the weapon builder below reads, so the two sides
    // of the "can this character hold this weapon?" comparison are normalised
    // identically. A character whose weapon class isn't one of the five is not
    // a playable build target, so drop them rather than emit an unmatchable type.
    const weaponType = String(c.weaponText).toLowerCase();
    if (!WEAPON_TYPE_NAMES.includes(weaponType)) continue;

    const substattKey = SUBSTAT_TO_KEY[c.substatText] ?? null;

    const baseByLevel: Record<string, Record<string, number>> = {};
    for (const level of BUILD_LEVELS) {
      const s = c.stats(level);
      const entry: Record<string, number> = {
        hp: r2(s.hp),
        atk: r2(s.attack),
        def: r2(s.defense),
      };
      // Add ascension stat (specialized) if it maps to a stat key
      if (
        substattKey &&
        s.specialized !== undefined &&
        s.specialized !== null
      ) {
        // specialized for flat stats (hp, atk, def, em) is an absolute value
        // for percentage stats it's 0..1 range → convert to %
        const flatStats = new Set(['hp', 'atk', 'def', 'em']);
        const value = flatStats.has(substattKey)
          ? r2(s.specialized)
          : pctToPercent(s.specialized);
        entry[substattKey] = value;
      }
      baseByLevel[String(level)] = entry;
    }

    // Generate a slug key from name
    const key = name
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_']/g, '')
      .toLowerCase();

    result.push({
      key,
      name,
      element,
      weaponType,
      baseByLevel,
    });
    // The game's own image names (ADR-0052): referenced, never copied.
    if (c.images?.filename_icon)
      IMAGES.characters[key] ??= {
        icon: c.images.filename_icon,
        ...(c.images.filename_sideIcon && { side: c.images.filename_sideIcon }),
      };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build weapons
// ---------------------------------------------------------------------------

function buildWeapons() {
  const names: string[] = genshindb.weapons('names', { matchCategories: true });
  const result = [];

  for (const name of names) {
    const w = genshindb.weapons(name);
    if (!w) continue;

    const type = String(w.weaponText).toLowerCase();
    if (!WEAPON_TYPE_NAMES.includes(type)) continue;

    const substatKey = SUBSTAT_TO_KEY[w.mainStatText] ?? null;

    const byLevel: Record<string, Record<string, number>> = {};
    for (const level of BUILD_LEVELS) {
      const s = w.stats(level);
      // Low-rarity starter weapons (1★/2★) can't ascend past 70; skip undefined levels
      if (!s || s.attack === undefined || s.attack === null) continue;
      const entry: Record<string, number> = {
        atk: r2(s.attack),
      };
      // Add secondary stat if available
      if (substatKey && s.specialized !== undefined && s.specialized !== null) {
        const flatStats = new Set(['hp', 'atk', 'def', 'em']);
        const value = flatStats.has(substatKey)
          ? r2(s.specialized)
          : pctToPercent(s.specialized);
        entry[substatKey] = value;
      }
      byLevel[String(level)] = entry;
    }

    // Skip weapons with no valid stats at any level (shouldn't happen, guard anyway)
    if (Object.keys(byLevel).length === 0) continue;

    const key = name
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_']/g, '')
      .toLowerCase();

    if (w.images?.filename_icon) IMAGES.weapons[key] ??= w.images.filename_icon;
    result.push({
      key,
      name,
      type,
      // Star rating, carried so a weapon picker can rank/annotate options
      // without a second data source. Non-numeric ratings never occur in the
      // five weapon classes above, but coerce anyway rather than emit a string.
      rarity: Number(w.rarity) || 0,
      byLevel,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build artifact sets
// ---------------------------------------------------------------------------

function buildSets() {
  const names: string[] = genshindb.artifacts('names', {
    matchCategories: true,
  });
  const result = [];

  for (const name of names) {
    const a = genshindb.artifacts(name);
    if (!a) continue;

    // Skip prayer sets (1pc only, no 2pc bonus)
    if (!a.effect2Pc) continue;

    // Retain every set. Flat-stat 2pc bonuses are scored; conditional/non-stat
    // 2pc bonuses (e.g. Golden Troupe, Marechaussee Hunter) are kept with an empty
    // bonus so the set is still requirable as a constraint (ADR-0003) — it just
    // contributes 0 to stat scoring.
    const twoPiece = parse2pc(a.effect2Pc) ?? {};
    // No `fourPiece`: no known Genshin 4pc bonus is a plain flat stat — every
    // one is conditional or reactive — so the snapshot never emits one. The
    // app-side model keeps the `four` field as headroom (ADR-0003).
    if (Object.keys(twoPiece).length === 0) {
      console.log(`  · retained set "${name}" with no scored 2pc bonus`);
    }

    const key = goodKey(name); // GOOD-standard set key so imported artifacts match

    const pieces = Object.fromEntries(
      SLOT_NAMES.map((slot) => [slot, a.images?.[`filename_${slot}`]]),
    );
    if (SLOT_NAMES.every((slot) => pieces[slot]))
      IMAGES.sets[key] ??= pieces as Record<string, string>;
    result.push({ key, name, twoPiece });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Details at the exact level (TODO 9.9, ADR-0055)
// ---------------------------------------------------------------------------

/** genshin-db's raw tables: base stats, growth curves and ascension bonuses
 *  by its own file names, which `index.English` maps from display names. */
const RAW = require('genshin-db/src/min/data.min.json');
const FILE = {
  characters: RAW.index.English.characters.names as Record<string, string>,
  weapons: RAW.index.English.weapons.names as Record<string, string>,
};
/** A stat value as the engine keeps it: percent, except flat stats. */
const unit = (key: string | null, v: number) =>
  key && !isFlatStat(key) ? v * 100 : v;
const strip = (t: string) =>
  String(t ?? '')
    .replace(/<\/?color[^>]*>/g, '')
    .replace(/\\n/g, '\n');

const KINDS: TalentKind[] = ['auto', 'skill', 'burst'];
const KIND_WORDS: [string, TalentKind][] = [
  ['Normal Attack', 'auto'],
  ['Elemental Skill', 'skill'],
  ['Elemental Burst', 'burst'],
];

/** Which talent a constellation raises by 3 levels, or null when it raises
 *  none. The wording varies ("Increases the Level of X by 3", "Increases
 *  Elemental Skill **X** Level by 3", "X increases by 3 Levels"), so the
 *  talent is found by its name in the text (the longest that appears),
 *  else by the kind's words. */
function boosted(text: string | undefined, talents: string[] | null) {
  const t = strip(text ?? '').replace(/\*\*/g, '');
  if (!/\bby 3\b/.test(t) || !/\bLevels?\b/.test(t)) return null;
  const named = (talents ?? [])
    .map((name, i) => ({ name, i }))
    .filter(({ name }) => name && t.includes(name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (named) return KINDS[named.i];
  return KIND_WORDS.find(([w]) => t.includes(w))?.[1] ?? null;
}

function buildDetails(
  genshinDbVersion: string,
  characters: { key: string; name: string }[],
  weapons: { key: string; name: string }[],
  sets: { key: string; name: string }[],
): Details {
  const usedCurves = {
    characters: new Set<string>(),
    weapons: new Set<string>(),
  };
  const chars: Record<string, CharacterDetails> = {};
  for (const { key, name } of characters) {
    const raw = RAW.stats.characters[FILE.characters[name]];
    const c = genshindb.characters(name);
    if (!raw || !c) continue;
    const ascStat = SUBSTAT_TO_KEY[c.substatText] ?? null;
    const t = genshindb.talents(name);
    const talents: [string, string, string] | null =
      t?.combat1 && t?.combat2 && t?.combat3
        ? [t.combat1.name, t.combat2.name, t.combat3.name]
        : null;
    const cons = genshindb.constellations(name);
    const curve: [string, string, string] = [
      raw.curve.hp,
      raw.curve.attack,
      raw.curve.defense,
    ];
    curve.forEach((x) => usedCurves.characters.add(x));
    chars[key] = {
      rarity: Number(c.rarity) || 0,
      curve,
      base: [raw.base.hp, raw.base.attack, raw.base.defense],
      ascStat: ascStat as CharacterDetails['ascStat'],
      promotion: raw.promotion.map(
        (p: {
          maxlevel: number;
          hp: number;
          attack: number;
          defense: number;
          specialized: number;
        }) => [
          p.maxlevel,
          p.hp,
          p.attack,
          p.defense,
          unit(ascStat, p.specialized),
        ],
      ),
      talents,
      c3: boosted(cons?.c3?.description, talents),
      c5: boosted(cons?.c5?.description, talents),
    };
  }
  const weaps: Record<string, WeaponDetails> = {};
  for (const { key, name } of weapons) {
    const raw = RAW.stats.weapons[FILE.weapons[name]];
    const w = genshindb.weapons(name);
    if (!raw || !w) continue;
    const subStat = SUBSTAT_TO_KEY[w.mainStatText] ?? null;
    const curve: [string, string | null] = [
      raw.curve.attack,
      subStat ? raw.curve.specialized : null,
    ];
    usedCurves.weapons.add(curve[0]);
    if (curve[1]) usedCurves.weapons.add(curve[1]);
    const values = [w.r1, w.r2, w.r3, w.r4, w.r5].map(
      (r: { values?: string[] } | undefined) => r?.values ?? [],
    );
    weaps[key] = {
      rarity: Number(w.rarity) || 0,
      curve,
      base: [raw.base.attack, unit(subStat, raw.base.specialized ?? 0)],
      subStat: subStat as WeaponDetails['subStat'],
      promotion: raw.promotion.map(
        (p: { maxlevel: number; attack: number }) => [p.maxlevel, p.attack],
      ),
      passive:
        w.effectName && w.effectTemplateRaw
          ? { name: w.effectName, text: strip(w.effectTemplateRaw), values }
          : null,
      description: strip(w.description),
    };
  }
  const pick = (
    all: Record<number, Record<string, number>>,
    used: Set<string>,
  ) =>
    Object.fromEntries(
      [...used].sort().map((name) => [
        name,
        // Levels 1 to 100 (weapons stop at 90: null past it).
        Array.from({ length: 100 }, (_, i) => all[i + 1]?.[name] ?? null),
      ]),
    );
  return {
    genshinDbVersion,
    curves: {
      characters: pick(RAW.curve.characters, usedCurves.characters),
      weapons: pick(RAW.curve.weapons, usedCurves.weapons),
    },
    characters: chars,
    weapons: weaps,
    // Each set's effects as the game words them (TODO 9.10).
    sets: Object.fromEntries(
      sets.map(({ key, name }) => {
        const a = genshindb.artifacts(name);
        return [
          key,
          {
            two: a?.effect2Pc ? strip(a.effect2Pc) : null,
            four: a?.effect4Pc ? strip(a.effect4Pc) : null,
          },
        ];
      }),
    ),
  };
}

/** A character's talent and constellation texts (TODO 9.10): each combat
 *  talent's description (no flavour text) and its value lines with every
 *  parameter at levels 1 to 15, and C1 to C6. */
function buildTexts(name: string): CharacterTexts | null {
  const t = genshindb.talents(name);
  if (!t) return null;
  const talent = (
    c:
      | {
          name: string;
          description: string;
          attributes?: {
            labels: string[];
            parameters: Record<string, number[]>;
          };
        }
      | undefined,
  ): TalentText | null =>
    c?.attributes
      ? {
          name: c.name,
          description: strip(c.description),
          labels: c.attributes.labels,
          params: Object.fromEntries(
            Object.entries(c.attributes.parameters)
              .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
              .map(([p, v]) => [p, v.slice(0, 15)]),
          ),
        }
      : null;
  const c = genshindb.constellations(name);
  return {
    talents: [talent(t.combat1), talent(t.combat2), talent(t.combat3)],
    constellations: c
      ? (['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const).map((k) => ({
          name: c[k]?.name ?? k.toUpperCase(),
          description: strip(c[k]?.description ?? ''),
        }))
      : null,
  };
}

/** Every character's and weapon's stats, at every level before and after
 *  each ascension, from the stored details by the engine's own formulas,
 *  against genshin-db's: a difference stops the build. */
function checkDetails(
  d: Details,
  characters: { key: string; name: string }[],
  weapons: { key: string; name: string }[],
) {
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  let checked = 0;
  for (const { key, name } of characters) {
    const c = d.characters[key];
    if (!c) continue;
    const g = genshindb.characters(name);
    const critBase =
      c.ascStat === 'crit_rate' ? 5 : c.ascStat === 'crit_dmg' ? 50 : 0;
    for (let level = 1; level <= 90; level++)
      for (const asc of [0, 6]) {
        const want = g.stats(level, asc === 6 ? '+' : '-');
        const got = characterStatsAt(d, c, level, asc === 6 ? 6 : 0);
        const wantAsc = unit(c.ascStat, want.specialized) - critBase;
        if (
          !close(got.hp, want.hp) ||
          !close(got.atk, want.attack) ||
          !close(got.def, want.defense) ||
          !close(got.asc, wantAsc)
        )
          throw new Error(
            `details: ${key} at level ${level} (${asc ? '+' : '-'}): ${JSON.stringify(got)} vs ${JSON.stringify(want)}`,
          );
        checked++;
      }
  }
  for (const { key, name } of weapons) {
    const w = d.weapons[key];
    if (!w) continue;
    const g = genshindb.weapons(name);
    const cap = w.promotion[w.promotion.length - 1][0];
    for (let level = 1; level <= cap; level++)
      for (const asc of [0, 6]) {
        const want = g.stats(level, asc === 6 ? '+' : '-');
        const got = weaponStatsAt(d, w, level, asc === 6 ? 6 : 0);
        if (
          !close(got.atk, want.attack) ||
          !close(got.sub, unit(w.subStat, want.specialized ?? 0))
        )
          throw new Error(
            `details: ${key} at level ${level} (${asc ? '+' : '-'}): ${JSON.stringify(got)} vs ${JSON.stringify(want)}`,
          );
        checked++;
      }
  }
  return checked;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Keep the first entry per key; warn on collisions (e.g. quest weapons that share a name). */
function dedupeByKey<T extends { key: string; name: string }>(
  items: T[],
  kind: string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.key)) {
      console.warn(
        `  ⚠ dropped duplicate ${kind} key "${item.key}" ("${item.name}")`,
      );
      continue;
    }
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

function main() {
  console.log('Building Genshin Impact dataset...');
  const genshinDbVersion = checkGenshinDbRelease();

  const characters = dedupeByKey(buildCharacters(), 'character');
  const weapons = dedupeByKey(buildWeapons(), 'weapon');
  const sets = dedupeByKey(buildSets(), 'set');

  const snapshot = {
    genshinDbVersion,
    gameVersion: newestGameVersion(characters, weapons, sets),
    generatedAt: GENSHIN_DB_RELEASE.released,
    characters,
    weapons,
    sets,
    mainStatValues: MAIN_STAT_VALUES,
  };

  const outPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../packages/engine/src/game/genshin/data.generated.json',
  );

  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  // Only for what the dataset kept (a dropped duplicate's images go too).
  const keep = <T>(rec: Record<string, T>, items: { key: string }[]) =>
    Object.fromEntries(
      items.filter((i) => rec[i.key]).map((i) => [i.key, rec[i.key]]),
    );
  const images = compactImages({
    characters: keep(IMAGES.characters, characters),
    weapons: keep(IMAGES.weapons, weapons),
    sets: keep(IMAGES.sets, sets),
  });
  const imagesPath = path.join(path.dirname(outPath), 'images.generated.json');
  fs.writeFileSync(
    imagesPath,
    JSON.stringify({ genshinDbVersion, ...images }),
    'utf-8',
  );

  const details = buildDetails(genshinDbVersion, characters, weapons, sets);
  const checked = checkDetails(details, characters, weapons);
  const detailsPath = path.join(
    path.dirname(outPath),
    'details.generated.json',
  );
  fs.writeFileSync(detailsPath, JSON.stringify(details), 'utf-8');

  // One small file per character, loaded with their window (TODO 9.10).
  // Rewritten whole, so a character the dataset dropped leaves no file.
  const textsDir = path.join(path.dirname(outPath), 'texts');
  fs.rmSync(textsDir, { recursive: true, force: true });
  fs.mkdirSync(textsDir);
  let textCount = 0;
  for (const { key, name } of characters) {
    const texts = buildTexts(name);
    if (!texts) continue;
    fs.writeFileSync(
      path.join(textsDir, `${key}.json`),
      JSON.stringify(texts),
      'utf-8',
    );
    textCount++;
  }
  console.log(`✓ Wrote ${textCount} character texts to ${textsDir}`);
  console.log(
    `✓ Wrote ${detailsPath} (${Object.keys(details.characters).length} characters, ${Object.keys(details.weapons).length} weapons; ${checked} level checks against genshin-db)`,
  );

  console.log(`✓ Wrote ${outPath}`);
  console.log(
    `✓ Wrote ${imagesPath} (${Object.keys(images.characters).length} characters, ${Object.keys(images.weapons).length} weapons, ${Object.keys(images.sets).length} sets)`,
  );
  console.log(
    `  genshin-db ${snapshot.genshinDbVersion} (released ${snapshot.generatedAt}), game version ${snapshot.gameVersion}`,
  );
  console.log(`  Characters: ${characters.length}`);
  console.log(`  Weapons:    ${weapons.length}`);
  console.log(`  Sets:       ${sets.length}`);
  console.log(
    `  Main stat rarities: ${Object.keys(snapshot.mainStatValues).join(', ')}`,
  );
}

main();
