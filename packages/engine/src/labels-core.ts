/**
 * The adapter-free half of the label/format vocabulary.
 *
 * IMPORTANT: this module must not import `game/genshin/adapter` (nor anything
 * that reaches it, directly or transitively). `api/explain.ts` bundles
 * `ai/explainShared.ts`, which imports this file — pulling the adapter in here
 * dragged the whole 328 KB `data.generated.json` snapshot into the serverless
 * function (measured: 6.6 KB → 321 KB). `src/labels-core.test.ts` is the
 * tripwire that keeps it that way.
 *
 * `packages/web/src/labels.ts` re-exports everything here, so UI code keeps importing
 * `../labels` and never needs to know this split exists.
 * @packageDocumentation
 */

import type { Objective, SetRequirement, Slot, StatKey } from './game/types';

/** Human-friendly display names for stat keys. */
export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  hp_pct: 'HP%',
  atk: 'ATK',
  atk_pct: 'ATK%',
  def: 'DEF',
  def_pct: 'DEF%',
  em: 'Elemental Mastery',
  er_pct: 'Energy Recharge',
  crit_rate: 'CRIT Rate',
  crit_dmg: 'CRIT DMG',
  elemental_dmg: 'Elemental DMG',
  physical_dmg: 'Physical DMG',
  healing: 'Healing Bonus',
};

/** Display names for optimization objectives (stat keys plus the derived ones). */
export const OBJECTIVE_LABELS: Record<Objective, string> = {
  crit_value: 'Crit Value',
  avg_damage: 'Average damage (est.)',
  ...STAT_LABELS,
};

export const SLOT_LABELS: Record<Slot, string> = {
  flower: 'Flower',
  plume: 'Plume',
  sands: 'Sands',
  goblet: 'Goblet',
  circlet: 'Circlet',
};

// The per-slot mark used by compact build lists is not here: it is drawn, not
// written. See packages/web/src/components/SlotGlyph.tsx for why five Unicode characters
// could not carry it.

/** Elements are lowercase dataset keys ("hydro"), never display copy. Colour is
 *  deliberately not part of this — the app has no element-hue system. */
export function elementLabel(el: string): string {
  return el ? el[0].toUpperCase() + el.slice(1) : '';
}

export function statLabel(key: StatKey): string {
  return STAT_LABELS[key] ?? key;
}

// Stats whose values are conventionally displayed as a percentage.
const PCT_STATS = new Set<StatKey>([
  'hp_pct',
  'atk_pct',
  'def_pct',
  'er_pct',
  'crit_rate',
  'crit_dmg',
  'elemental_dmg',
  'physical_dmg',
  'healing',
]);

export function isPctStat(key: StatKey): boolean {
  return PCT_STATS.has(key);
}

export function objectiveLabel(obj: Objective): string {
  return OBJECTIVE_LABELS[obj] ?? obj;
}

/** One-sentence explanation of why a build is ranked by this metric — shown
 *  under the headline number so the metric changing per character reads as
 *  intentional, not a bug. */
export function objectiveHint(o: Objective): string {
  switch (o) {
    case 'avg_damage':
      return 'Estimated damage from this character’s curated rotation — for comparing builds, not matching in-game numbers.';
    case 'crit_value':
      return 'Crit Value = 2×Crit Rate + Crit DMG — a gear-quality proxy for crit-scaling damage dealers.';
    case 'hp_pct':
      return 'This character’s kit scales off HP, so builds are ranked by it instead of damage.';
    case 'em':
      return 'This character’s kit scales off Elemental Mastery, so builds are ranked by it instead of damage.';
    default:
      return `Builds are ranked by ${objectiveLabel(o)} — the stat this character’s role values most.`;
  }
}

/**
 * `Number.toFixed()` hardcodes en-US-style digit shapes; `Intl.NumberFormat`
 * is the i18n-correct way to render a fixed-precision number even when the
 * app is English/US-only today. One formatter per precision, module-level so
 * `formatScore`'s hot path doesn't construct one per call.
 */
const scoreFormatters = new Map<number, Intl.NumberFormat>();
function scoreFormatter(digits: number): Intl.NumberFormat {
  let f = scoreFormatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    });
    scoreFormatters.set(digits, f);
  }
  return f;
}

/**
 * Every number the results UI shows goes through here. The damage formula is
 * pure arithmetic over user-supplied stats, so a pathological build can hand
 * the UI a NaN or an Infinity — guarding at the display seam keeps the maths
 * honest and still never renders the literal word "NaN".
 */
export function formatScore(n: number, digits = 1): string {
  return Number.isFinite(n) ? scoreFormatter(digits).format(n) : '—';
}

/**
 * One stat *value* with its unit. Percent stats are stored as plain numbers
 * (46.6 means 46.6%), so every site that printed a bare `formatScore` dropped
 * the "%" and made a CRIT DMG roll look like a flat stat. Flat stats (EM, ATK,
 * HP) are whole numbers in-game, so a trailing ".0" on them reads as false
 * precision — hence the digit count follows the stat, not the caller.
 */
export function formatStat(key: StatKey, value: number): string {
  const pct = isPctStat(key);
  return `${formatScore(value, pct ? 1 : 0)}${pct ? '%' : ''}`;
}

/**
 * The adapter-free half of `labels.ts`'s `formatSetName`: given a lookup
 * table (dataset set key -> display name) instead of reaching for the
 * adapter directly, prefers the real display name and falls back to spacing
 * out the PascalCase key for one the table doesn't carry. Split out so a
 * caller that cannot statically import the adapter — the optimize worker,
 * which would otherwise drag the 321 KB `data.generated.json` snapshot into
 * its own bundle alongside the main thread's copy (see `OptimizeContext`'s
 * `setNames`, populated once on the main thread and structured-cloned in) —
 * can still render real set names instead of a raw key.
 */
export function formatSetNameFrom(
  setKey: string,
  names: Record<string, string> | undefined,
): string {
  const key = String(setKey ?? '');
  return (
    names?.[key] ??
    key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .trim()
  );
}

/** The adapter-free half of `labels.ts`'s `setRequirementLabel` — see
 *  {@link formatSetNameFrom} for why this takes a names table instead of
 *  reaching for the adapter. */
export function setRequirementLabelFrom(
  r: SetRequirement,
  names: Record<string, string> | undefined,
): string {
  if (r.kind === '2+2')
    return `2-piece ${formatSetNameFrom(r.setKeys[0], names)} + 2-piece ${formatSetNameFrom(r.setKeys[1], names)}`;
  return `${r.kind === '4pc' ? '4-piece' : '2-piece'} ${formatSetNameFrom(r.setKey, names)}`;
}

/** Crit-ratio targets are stored as CRIT Rate's share of CR+CD; players read
 *  them as "1:N". Callers must exclude a zero target — 1:∞ is theirs to word. */
export function formatCritRatio(target: number): string {
  return scoreFormatter(1).format((1 - target) / target);
}

/** Pinned to en-US like `scoreFormatter`: a bare `toLocaleString()` follows the
 *  host locale, so `12345` read `12.345` on an es-CO machine. */
const countFormatter = new Intl.NumberFormat('en-US');

/** A count of things the search touched, grouped for reading. One helper so
 *  every counter in the UI is grouped the same way. */
export function formatCount(n: number): string {
  return countFormatter.format(n);
}
