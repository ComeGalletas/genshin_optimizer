/**
 * Roster assessment: how far each owned character is levelled (combat
 * readiness, ADR-0057), the roster ranked by it, and the grade of what a
 * character wears. Artifact quality, the other score, is in
 * `artifactQuality.ts`.
 * @packageDocumentation
 */

/**
 * Combat readiness: how far a roster character is levelled, 0–100, with the
 * components spelled out so the number is explainable rather than an oracle.
 *
 * Every component is monotone in its input and clamped to its own maximum, so
 * a higher level / better talents / more artifacts can never lower the total.
 * A missing field scores 0 for that component (an unimported talent triple is
 * indistinguishable from an unlevelled one — both mean "no evidence of work").
 */
import type { Artifact, BuildLevel } from '../game/types';
import type { RosterEntry } from '../import/good';
import { sheetTotals } from '../optimizer/sheet';
import { gradeBuild, type Grade } from '../meta/grade';
import { META_TARGETS } from '../meta/metaTargets';

export interface BuildScoreComponent {
  label: string;
  points: number;
  max: number;
}

export interface Readiness {
  total: number;
  components: BuildScoreComponent[];
  /** Talents at level 10 (their own level, not a constellation's +3): each
   *  took a Crown of Insight. Shown beside the score, not counted in it. */
  crowns: number;
}

export type Band = 'built' | 'partial' | 'unbuilt';

/** The four parts' points: the old build score's level 25, talents 20, weapon
 *  15 and count 10, scaled evenly to 100 once artifact quality left
 *  (ADR-0057). */
export const READINESS_POINTS = {
  level: 36,
  talents: 29,
  weapon: 21,
  artifacts: 14,
} as const;

/** A talent level that took a Crown of Insight. */
const CROWN_LEVEL = 10;

function component(
  label: string,
  fraction: number,
  max: number,
): BuildScoreComponent {
  return { label, points: Math.min(Math.max(fraction, 0), 1) * max, max };
}

export function computeReadiness(
  entry: RosterEntry,
  equipped: readonly Artifact[],
): Readiness {
  const t = entry.talents;
  const P = READINESS_POINTS;
  const components = [
    component('Character level', (entry.buildLevel ?? 0) / 90, P.level),
    component('Talents', t ? (t.auto + t.skill + t.burst) / 27 : 0, P.talents),
    component('Weapon', (entry.weaponLevel ?? 0) / 90, P.weapon),
    component('Artifact count', equipped.length / 5, P.artifacts),
  ];
  return {
    total: components.reduce((sum, c) => sum + c.points, 0),
    components,
    crowns: t
      ? [t.auto, t.skill, t.burst].filter((l) => l >= CROWN_LEVEL).length
      : 0,
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
 * The most combat-ready character on a roster, with whatever they have
 * equipped.
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
  const scores = rosterReadiness(entries, artifacts);
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
  /** The held weapon's refinement, for its passive (ADR-0042); R1 if unset. */
  refinement?: number,
): Grade | null {
  const targets = META_TARGETS[characterKey]?.statTargets;
  if (!targets || equipped.length === 0) return null;
  // Objective doesn't affect base stats or set bonuses for non-damage
  // objectives, so any scalar objective is a safe stand-in here — grading
  // doesn't optimise anything.
  // A concrete build, so its sheet: ER-derived passives at its own ER.
  const { totals } = sheetTotals(
    {
      characterKey,
      weaponKey,
      buildLevel,
      ...(refinement !== undefined && { refinement }),
      constraints: {},
      objective: 'crit_value',
    },
    equipped,
  );
  return gradeBuild(totals, targets)?.grade ?? null;
}

/** Combat readiness for a whole roster — the shape `recommendAbyss` and the
 *  investment advice both take (ADR-0057: team picks read readiness). */
export function rosterReadiness(
  entries: Record<string, RosterEntry>,
  artifacts: Artifact[],
): Record<string, number> {
  const byLocation = groupByLocation(artifacts);
  const scores: Record<string, number> = {};
  for (const [key, entry] of Object.entries(entries))
    scores[key] = computeReadiness(entry, byLocation[key] ?? []).total;
  return scores;
}
