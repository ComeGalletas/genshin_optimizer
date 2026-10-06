/**
 * Each substat line's rolls (TODO 9.10): which of the four tiers (about 70,
 * 80, 90 and 100% of the maximum) made up its value, as far as the numbers
 * prove it. Never a guess:
 *
 * - The first roll is exact where the source exported it (Irminsul's
 *   `initialValue`, checked on import).
 * - The rest come from the value: every way of reaching it with the tiers,
 *   as the game rounds it, then only the counts that add up, over the four
 *   lines, to the rolls the piece has had (its `totalRolls`, or 3 or 4
 *   first lines plus one per upgrade).
 * - When one split is left, it is shown; when several share a roll count
 *   (70% + 100% is 80% + 90%), only the count and what those rolls added;
 *   when the count itself is open, nothing.
 *
 * 5★ pieces only: those are the tiers the engine has (ADR-0024). Pure.
 * @packageDocumentation
 */

import type { Artifact, StatKey, SubStat } from '../types';
import { displaySteps } from '../../import/fingerprint';
import {
  isSubStatKey,
  MAX_LEVEL_5,
  SUBSTAT_TIERS_5,
  UPGRADE_EVERY,
} from './substatRolls';

/** One roll: its value and tier, 0 (about 70%) to 3 (100%). */
export interface Roll {
  value: number;
  tier: number;
}

export type LineRolls =
  /** The rolls, the first one first when the export says which it was;
   *  otherwise largest first (the order isn't known). */
  | { kind: 'exact'; rolls: Roll[]; firstKnown: boolean }
  /** How many rolls, the first one when known, and what the others added. */
  | { kind: 'count'; count: number; first?: Roll; rest: number }
  | { kind: 'unknown' };

/** A line has its first roll and at most the 5 upgrades. */
const MAX_PER_LINE = 6;

/** Every multiset of `n` tiers (0–3), as ascending index lists. */
function multisets(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  const go = (from: number, acc: number[]) => {
    if (acc.length === n) {
      out.push(acc);
      return;
    }
    for (let t = from; t < 4; t++) go(t, [...acc, t]);
  };
  go(0, []);
  return out;
}
const MULTISETS = Array.from({ length: MAX_PER_LINE + 1 }, (_, n) =>
  multisets(n),
);

/** The tier a first roll is on, as the game shows it, or -1. */
function tierOf(key: StatKey, v: number): number {
  if (!isSubStatKey(key)) return -1;
  const want = displaySteps({ key, value: v });
  return SUBSTAT_TIERS_5[key].findIndex(
    (t) => displaySteps({ key, value: t }) === want,
  );
}

/** Every split of one line that reaches its value: the tiers of the rolls
 *  after the first (the first is `first` when known, else among them). */
function candidates(
  line: SubStat,
  first: number,
): { n: number; rest: number[] }[] {
  if (!isSubStatKey(line.key)) return [];
  const tiers = SUBSTAT_TIERS_5[line.key];
  const want = displaySteps(line);
  const out: { n: number; rest: number[] }[] = [];
  for (let n = 1; n <= MAX_PER_LINE; n++) {
    const free = first >= 0 ? n - 1 : n;
    for (const m of MULTISETS[free]) {
      const sum =
        (first >= 0 ? tiers[first] : 0) + m.reduce((s, t) => s + tiers[t], 0);
      if (displaySteps({ key: line.key, value: sum }) === want)
        out.push({ n, rest: m });
    }
  }
  return out;
}

/** Each substat line's rolls, in the piece's line order. */
export function splitRolls(a: Artifact): LineRolls[] {
  const unknown = a.subStats.map((): LineRolls => ({ kind: 'unknown' }));
  if (a.rarity !== 5 || a.subStats.length === 0) return unknown;
  const firsts = a.subStats.map((s) => {
    const v = a.rolls?.first?.[s.key];
    return v === undefined ? -1 : tierOf(s.key, v);
  });
  const lines = a.subStats.map((s, i) => candidates(s, firsts[i]));
  if (lines.some((c) => c.length === 0)) return unknown;

  // The roll counts that add up to what the piece has had.
  const upgrades = Math.floor(Math.min(a.level, MAX_LEVEL_5) / UPGRADE_EVERY);
  const totals = new Set(
    a.rolls?.total !== undefined
      ? [a.rolls.total]
      : a.level < UPGRADE_EVERY
        ? [a.subStats.length]
        : [3 + upgrades, 4 + upgrades],
  );
  const counts = lines.map((c) => [...new Set(c.map((x) => x.n))]);
  const possible = counts.map(() => new Set<number>());
  const walk = (i: number, picked: number[], sum: number) => {
    if (i === counts.length) {
      if (totals.has(sum)) picked.forEach((n, j) => possible[j].add(n));
      return;
    }
    for (const n of counts[i]) walk(i + 1, [...picked, n], sum + n);
  };
  walk(0, [], 0);

  return a.subStats.map((s, i): LineRolls => {
    if (possible[i].size !== 1 || !isSubStatKey(s.key)) return unknown[i];
    const tiers = SUBSTAT_TIERS_5[s.key];
    const [n] = possible[i];
    const splits = lines[i].filter((c) => c.n === n);
    const first =
      firsts[i] >= 0 ? { value: tiers[firsts[i]], tier: firsts[i] } : undefined;
    if (splits.length === 1) {
      const rest = [...splits[0].rest]
        .sort((x, y) => y - x)
        .map((t) => ({ value: tiers[t], tier: t }));
      return {
        kind: 'exact',
        rolls: first ? [first, ...rest] : rest,
        firstKnown: !!first,
      };
    }
    return {
      kind: 'count',
      count: n,
      ...(first && { first }),
      rest: s.value - (first ? first.value : 0),
    };
  });
}
