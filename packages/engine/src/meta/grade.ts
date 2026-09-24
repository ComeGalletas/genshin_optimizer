import type { StatKey, StatVec } from '../game/types';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

// ponytail: mean-of-capped-ratios against a hardcoded KQM stat line is a
// heuristic, not a percentile against a simulated theoretical-max build.
// Upgrade path if users distrust it: a real roll-simulated ceiling (ADR-0007
// explicitly excludes this "Level 4" for v1).
const GRADE_THRESHOLDS: { grade: Grade; min: number }[] = [
  { grade: 'S', min: 0.98 },
  { grade: 'A', min: 0.9 },
  { grade: 'B', min: 0.75 },
  { grade: 'C', min: 0.5 },
];

export interface StatGrade {
  key: StatKey;
  have: number;
  target: number;
  /** have/target, uncapped — used to find the single weakest stat. */
  pct: number;
}

export interface BuildGrade {
  grade: Grade;
  perStat: StatGrade[];
}

/**
 * Grade a build's totals against a character's statTargets. Returns null when
 * there's nothing to grade against (no targets) — callers should omit the
 * badge entirely rather than show a fake grade.
 */
export function gradeBuild(
  totals: StatVec,
  targets: StatVec,
): BuildGrade | null {
  const keys = Object.keys(targets) as StatKey[];
  if (keys.length === 0) return null;

  const perStat: StatGrade[] = keys.map((key) => {
    const target = targets[key] ?? 0;
    const have = totals[key] ?? 0;
    return { key, have, target, pct: target > 0 ? have / target : 1 };
  });

  const score =
    perStat.reduce((sum, s) => sum + Math.min(s.pct, 1), 0) / perStat.length;
  const grade =
    GRADE_THRESHOLDS.find((t) => score >= t.min)?.grade ?? ('D' as const);

  return { grade, perStat };
}
