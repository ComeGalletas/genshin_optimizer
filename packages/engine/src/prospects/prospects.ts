/**
 * Levelling prospects (ADR-0024): which artifacts are worth upgrading, judged
 * by what they are expected to be at +20.
 *
 * The optimizer only ever sees current stats. This is a separate ranking: an
 * artifact below +20 is projected to its expected +20 substats (its known
 * lines, plus each remaining roll spread evenly over the 4 lines at the mean
 * roll value), then ranked alongside the +20 pieces, which are scored as
 * they are. Expected value regresses to the mean, so an upgraded piece that
 * rolled well stays above most prospects. On an equal score (at the
 * precision stats are shown), the upgraded piece ranks first: its rolls are
 * proven, a prospect's are not.
 *
 * Nothing is guessed (CLAUDE.md). An artifact whose lines aren't all known
 * (a 3-line piece below +4 without its unactivated fourth line, as OCR
 * sources export it) is listed as not projected, with the reason.
 * @packageDocumentation
 */

import type {
  Artifact,
  ScalarObjective,
  StatVec,
  SubStat,
} from '../game/types';
import { objectiveValue } from '../optimizer/score';
import {
  isSubStatKey,
  MAX_LEVEL_5,
  meanRoll5,
  UPGRADE_EVERY,
} from '../game/genshin/substatRolls';

/** An artifact plus its unactivated fourth line, when the source reports one
 *  (a `GoodArtifactEntry` fits). */
export interface ProspectInput {
  artifact: Artifact;
  unactivated?: SubStat;
}

export interface Projection {
  /** Expected substats at +20, known lines first, in the artifact's order. */
  subStats: SubStat[];
  /** Upgrades still to come (0 at +20). */
  upgradesLeft: number;
  /** Of those, the random rolls (one fewer when the next upgrade only
   *  activates the fourth line). */
  randomRolls: number;
}

export type NotProjected =
  'not-5-star' | 'fourth-line-unknown' | 'inconsistent-lines';

/**
 * Expected +20 substats of a 5★ artifact, or why it can't be projected.
 * `inconsistent-lines` is a substat count the game can't produce (a 5★ piece
 * with fewer than 3 lines, 3 lines at +4 or above, or an unactivated line
 * next to 4 active ones).
 */
export function projectTo20(
  input: ProspectInput,
): Projection | { notProjected: NotProjected } {
  const { artifact: a, unactivated } = input;
  if (a.rarity !== 5) return { notProjected: 'not-5-star' };
  const lines = unactivated ? [...a.subStats, unactivated] : a.subStats;
  const upgradesLeft =
    Math.floor(MAX_LEVEL_5 / UPGRADE_EVERY) -
    Math.floor(Math.min(a.level, MAX_LEVEL_5) / UPGRADE_EVERY);
  const threeLine = a.subStats.length === 3;
  if (
    lines.length !== 4 ||
    lines.some((s) => !isSubStatKey(s.key)) ||
    (threeLine && a.level >= UPGRADE_EVERY)
  )
    return {
      notProjected:
        threeLine && !unactivated && a.level < UPGRADE_EVERY
          ? 'fourth-line-unknown'
          : 'inconsistent-lines',
    };
  const randomRolls = threeLine ? upgradesLeft - 1 : upgradesLeft;
  return {
    subStats: lines.map((s) => ({
      key: s.key,
      value:
        s.value +
        (isSubStatKey(s.key) ? (randomRolls / 4) * meanRoll5(s.key) : 0),
    })),
    upgradesLeft,
    randomRolls,
  };
}

const vecOf = (subs: SubStat[]): StatVec => {
  const v: StatVec = {};
  for (const s of subs) v[s.key] = (v[s.key] ?? 0) + s.value;
  return v;
};

/** Score of a set of substats under an objective. Substats only: pieces are
 *  compared within one slot and main stat, where the main stat is equal. */
export function substatScore(
  subs: SubStat[],
  objective: ScalarObjective,
): number {
  return objectiveValue(vecOf(subs), objective);
}

export interface ProspectRow {
  /** Position in the input list. */
  index: number;
  artifact: Artifact;
  /** Pieces are ranked against others of the same slot and main stat
   *  (element included, for an elemental DMG goblet): "sands/atk_pct". */
  group: string;
  /** 1-based rank within the group. */
  rank: number;
  status: 'upgraded' | 'prospect';
  /** Substat score now. */
  current: number;
  /** Substat score at +20: exact for an upgraded piece, expected for a
   *  prospect. The ranking key. */
  atPlus20: number;
  projection: Projection;
}

export interface ProspectRanking {
  rows: ProspectRow[];
  notProjected: { index: number; reason: NotProjected }[];
}

export const groupOf = (a: Artifact) =>
  [a.slot, a.mainStat, a.element].filter(Boolean).join('/');

/** Scores are compared at the precision the app shows them (one decimal), so
 *  a floating-point hair doesn't beat a proven roll. */
const shown = (x: number) => Math.round(x * 10);

/**
 * Rank every artifact by its substat score at +20 under `objective`, within
 * its slot and main-stat group. Rows come out grouped (groups in first-seen
 * order), best first.
 */
export function rankProspects(
  inputs: ProspectInput[],
  objective: ScalarObjective,
): ProspectRanking {
  const byGroup = new Map<string, Omit<ProspectRow, 'rank'>[]>();
  const notProjected: ProspectRanking['notProjected'] = [];
  inputs.forEach((input, index) => {
    const p = projectTo20(input);
    if ('notProjected' in p) {
      notProjected.push({ index, reason: p.notProjected });
      return;
    }
    const a = input.artifact;
    const group = groupOf(a);
    const row = {
      index,
      artifact: a,
      group,
      status:
        p.upgradesLeft === 0 ? ('upgraded' as const) : ('prospect' as const),
      current: substatScore(a.subStats, objective),
      atPlus20: substatScore(p.subStats, objective),
      projection: p,
    };
    const list = byGroup.get(group);
    if (list) list.push(row);
    else byGroup.set(group, [row]);
  });
  const rows: ProspectRow[] = [];
  for (const list of byGroup.values()) {
    list.sort(
      (x, y) =>
        shown(y.atPlus20) - shown(x.atPlus20) ||
        // Proven rolls first, then the piece with fewer rolls left to chance.
        x.projection.randomRolls - y.projection.randomRolls ||
        x.index - y.index,
    );
    list.forEach((r, i) => rows.push({ ...r, rank: i + 1 }));
  }
  return { rows, notProjected };
}
