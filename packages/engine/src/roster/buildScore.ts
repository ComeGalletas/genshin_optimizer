/**
 * Roster assessment: how built each owned character is. Turns an imported
 * roster entry plus the artifacts equipped on it into an explainable 0-100
 * build score, and renders the roster ranked by it.
 * @packageDocumentation
 */

/**
 * Build score: how built a roster character is, 0–100, with the components
 * spelled out so the number is explainable rather than an oracle.
 *
 * Every component is monotone in its input and clamped to its own maximum, so
 * a higher level / better talents / more artifacts can never lower the total.
 * A missing field scores 0 for that component (an unimported talent triple is
 * indistinguishable from an unlevelled one — both mean "no evidence of work").
 */
import type { Artifact, BuildLevel } from '../game/types';
import type { RosterEntry } from '../import/good';
import {
  artifactContribution,
  objectiveValue,
  totals,
} from '../optimizer/score';
import { buildContext } from '../optimizer/context';
import { gradeBuild, type Grade } from '../meta/grade';
import { META_TARGETS } from '../meta/metaTargets';

export interface BuildScoreComponent {
  label: string;
  points: number;
  max: number;
}

export interface BuildScore {
  total: number;
  components: BuildScoreComponent[];
}

export type Band = 'built' | 'partial' | 'unbuilt';

/** 180 CV across five pieces is roughly a finished set — good enough as the
 *  "fully invested" mark, and the same order of magnitude the grade badge uses. */
const FULL_CV = 180;

function component(
  label: string,
  fraction: number,
  max: number,
): BuildScoreComponent {
  return { label, points: Math.min(Math.max(fraction, 0), 1) * max, max };
}

export function computeBuildScore(
  entry: RosterEntry,
  equipped: Artifact[],
): BuildScore {
  const t = entry.talents;
  // Crit value a piece contributes on its own (main stat plus sub-stats),
  // via optimizer/score.ts's own objectiveValue — the one place the formula
  // lives, so a roster score and a search score can't diverge.
  const equippedCV = equipped.reduce(
    (sum, a) => sum + objectiveValue(artifactContribution(a), 'crit_value'),
    0,
  );
  const components = [
    component('Character level', (entry.buildLevel ?? 0) / 90, 25),
    component('Talents', t ? (t.auto + t.skill + t.burst) / 27 : 0, 20),
    component('Weapon', (entry.weaponLevel ?? 0) / 90, 15),
    component('Artifact count', equipped.length / 5, 10),
    component('Artifact quality', equippedCV / FULL_CV, 30),
  ];
  return {
    total: components.reduce((sum, c) => sum + c.points, 0),
    components,
  };
}

export function band(total: number): Band {
  if (total >= 70) return 'built';
  if (total >= 40) return 'partial';
  return 'unbuilt';
}

/** An inventory bucketed by the character each piece is equipped on. Loose
 *  pieces (no `location`) belong to nobody and are dropped. */
export function groupByLocation(
  artifacts: Artifact[],
): Record<string, Artifact[]> {
  const byLocation: Record<string, Artifact[]> = {};
  for (const a of artifacts)
    if (a.location) (byLocation[a.location] ??= []).push(a);
  return byLocation;
}

/**
 * The best-built character on a roster, with whatever they have equipped.
 *
 * The one pick an imported account justifies making on the reader's behalf: it
 * is the character the rest of the page already ranks first, so opening the
 * optimiser on anyone else means the reader's first action is to correct us.
 * `undefined` for an empty roster — there is nothing to prefer over the app's
 * own default.
 *
 * Ties resolve by roster insertion order (i.e. GOOD file order). Two characters
 * scoring identically to the last decimal is not a distinction worth a rule.
 */
export function bestBuiltCharacter(
  entries: Record<string, RosterEntry>,
  artifacts: Artifact[],
): { characterKey: string; weaponKey?: string } | undefined {
  const scores = rosterBuildScores(entries, artifacts);
  let bestKey: string | undefined;
  let bestScore = -Infinity;
  for (const [key, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  if (bestKey === undefined) return undefined;
  return { characterKey: bestKey, weaponKey: entries[bestKey]?.weaponKey };
}

/**
 * Grades what's *currently equipped* on a character against the same
 * `statTargets` the optimizer's best build is graded on (issue #32) — lets
 * the UI show "your current build: C, optimizer's best: S" side by side.
 * `null` when there's no curated recipe to grade against or nothing is
 * equipped, same contract as `gradeBuild` itself.
 */
export function equippedGrade(
  characterKey: string,
  weaponKey: string,
  buildLevel: BuildLevel,
  equipped: Artifact[],
): Grade | null {
  const targets = META_TARGETS[characterKey]?.statTargets;
  if (!targets || equipped.length === 0) return null;
  // Objective doesn't affect base stats or set bonuses for non-damage
  // objectives, so any scalar objective is a safe stand-in here — grading
  // doesn't optimise anything.
  const ctx = buildContext({
    characterKey,
    weaponKey,
    buildLevel,
    constraints: {},
    objective: 'crit_value',
  });
  return gradeBuild(totals(ctx, equipped), targets)?.grade ?? null;
}

/** Build-score totals for a whole roster — the shape `recommendAbyss` and the
 *  investment advice both take. */
export function rosterBuildScores(
  entries: Record<string, RosterEntry>,
  artifacts: Artifact[],
): Record<string, number> {
  const byLocation = groupByLocation(artifacts);
  const scores: Record<string, number> = {};
  for (const [key, entry] of Object.entries(entries))
    scores[key] = computeBuildScore(entry, byLocation[key] ?? []).total;
  return scores;
}
