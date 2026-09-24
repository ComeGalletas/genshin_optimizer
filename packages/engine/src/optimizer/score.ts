import type {
  Artifact,
  OptimizeContext,
  OptimizeConstraints,
  Objective,
  ScalarObjective,
  StatVec,
  StatKey,
} from '../game/types';
import { targetFunctionScore } from '../damage/formula';

export function addInto(acc: StatVec, v: StatVec): void {
  for (const k of Object.keys(v) as StatKey[])
    acc[k] = (acc[k] ?? 0) + (v[k] ?? 0);
}

/** addInto's twin — used by the search to undo a push without reallocating. */
export function subFrom(acc: StatVec, v: StatVec): void {
  for (const k of Object.keys(v) as StatKey[])
    acc[k] = (acc[k] ?? 0) - (v[k] ?? 0);
}

export function countSets(build: Artifact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of build) counts[a.setKey] = (counts[a.setKey] ?? 0) + 1;
  return counts;
}

export function artifactContribution(a: Artifact): StatVec {
  const v: StatVec = {};
  v[a.mainStat] = (v[a.mainStat] ?? 0) + a.mainStatValue;
  for (const s of a.subStats) v[s.key] = (v[s.key] ?? 0) + s.value;
  return v;
}

export function totals(ctx: OptimizeContext, build: Artifact[]): StatVec {
  const t: StatVec = {};
  addInto(t, ctx.base);
  for (const a of build) addInto(t, artifactContribution(a));
  const counts = countSets(build);
  for (const setKey of Object.keys(counts)) {
    const n = counts[setKey];
    const b = ctx.setBonuses[setKey];
    if (!b) continue;
    if (n >= 2 && b.two) addInto(t, b.two);
    if (n >= 4 && b.four) addInto(t, b.four);
  }
  return t;
}

/** Crit value: CRIT Rate weighted 2:1 against CRIT DMG. The one place this
 *  formula lives — both the score and the search pruning bound call it. */
export function critValue(cr: number, cd: number): number {
  return cr * 2 + cd;
}

export function objectiveValue(t: StatVec, objective: ScalarObjective): number {
  if (objective === 'crit_value')
    return critValue(t.crit_rate ?? 0, t.crit_dmg ?? 0);
  return t[objective] ?? 0;
}

/** The single objective evaluator every scorer must call — search, diagnostics
 *  and gap grading alike. `avg_damage` needs the whole context (base stats +
 *  damage profile), the stat-only objectives need just the totals. */
export function evaluateObjective(
  ctx: OptimizeContext,
  objective: Objective,
  t: StatVec,
): number {
  if (objective === 'avg_damage') {
    if (!ctx.damage)
      throw new Error('avg_damage objective requires ctx.damage');
    return targetFunctionScore(ctx.base, t, ctx.damage);
  }
  return objectiveValue(t, objective);
}

function meetsSetRequirement(
  build: Artifact[],
  req: NonNullable<OptimizeConstraints['setRequirement']>,
): boolean {
  const c = countSets(build);
  // Exhaustive over SetRequirement: an unknown `kind` (only reachable from a
  // malformed persisted/shared payload that slipped the guards) must fail the
  // constraint rather than fall through to the 2+2 destructure.
  switch (req.kind) {
    case '4pc':
      return (c[req.setKey] ?? 0) >= 4;
    case '2pc':
      return (c[req.setKey] ?? 0) >= 2;
    case '2+2': {
      const [a, b] = req.setKeys;
      return (c[a] ?? 0) >= 2 && (c[b] ?? 0) >= 2;
    }
    default: {
      const _exhaustive: never = req;
      void _exhaustive;
      return false;
    }
  }
}

export function satisfies(
  constraints: OptimizeConstraints,
  build: Artifact[],
  t: StatVec,
): boolean {
  if (
    constraints.setRequirement &&
    !meetsSetRequirement(build, constraints.setRequirement)
  )
    return false;
  if (constraints.minStats) {
    for (const k of Object.keys(constraints.minStats) as StatKey[]) {
      // A NaN total passes `<`, so a floor would be silently satisfied by a
      // build whose stats are not even numbers — reject non-finite outright.
      const have = t[k] ?? 0;
      if (!Number.isFinite(have) || have < (constraints.minStats[k] ?? 0))
        return false;
    }
  }
  if (constraints.mainStatLocks) {
    for (const a of build) {
      const lock = constraints.mainStatLocks[a.slot];
      if (lock && a.mainStat !== lock) return false;
    }
  }
  return true;
}

/**
 * Soft tiebreak: penalise distance of crit_rate/(crit_rate+crit_dmg) from `target`.
 * The target is that ratio, NOT the CR:CD ratio: target 0.5 => CR==CD (1:1); the
 * conventional Genshin 1:2 CR:CD corresponds to target ≈ 0.333. Returns 0 when
 * target is undefined — it's set only via meta-target presets (see
 * metaTargets.ts), not a direct user-facing control.
 *
 * A target that is not a finite positive ratio (NaN from a malformed share
 * link, 0, negative) also scores 0: a NaN penalty would poison every build's
 * score and make the top-K ordering meaningless.
 */
export function critRatioPenalty(t: StatVec, target?: number): number {
  if (target === undefined) return 0;
  if (!Number.isFinite(target) || target <= 0) return 0;
  const cr = t.crit_rate ?? 0;
  const cd = t.crit_dmg ?? 0;
  if (cr + cd === 0) return 0;
  const ratio = cr / (cr + cd);
  return Math.abs(ratio - target) * (cr + cd);
}
