/**
 * When two specs say the same thing (TODO 4.4, ADR-0039): the golden-set
 * evaluation compares a model's spec with the expected one in two ways.
 *
 * - **Exact**: equal after `canonicalSpec`, which removes what can't change
 *   the meaning of a spec (writing the default `defaults: "extend"`, an
 *   empty list, a zero weight, the order of a 2+2 or of a character list).
 * - **Equivalent**: both map to the same run on the same account
 *   (`runKey`): the same request, extras and pool. A spec that spells out a
 *   character's curated set is not exactly the expected spec, but it runs
 *   the same search, so it is not a mistranslation.
 * Pure.
 * @packageDocumentation
 */

import type { StatVec } from '../game/types';
import type { ConstraintSpec } from './spec';
import type { SpecRun } from './toRequest';

/** A spec with everything that can't change its meaning taken out. */
export function canonicalSpec(spec: ConstraintSpec): ConstraintSpec {
  const s = JSON.parse(JSON.stringify(spec)) as ConstraintSpec;
  if (s.defaults === 'extend') delete s.defaults;
  if (s.set?.kind === '2+2') s.set.setKeys.sort();
  if (Array.isArray(s.keepEquippedOn)) {
    if (s.keepEquippedOn.length === 0) delete s.keepEquippedOn;
    else s.keepEquippedOn = [...new Set(s.keepEquippedOn)].sort();
  }
  if (s.excludeArtifacts) {
    if (s.excludeArtifacts.length === 0) delete s.excludeArtifacts;
    else s.excludeArtifacts = [...new Set(s.excludeArtifacts)].sort();
  }
  for (const key of ['minStats', 'maxStats', 'teamBuffs'] as const) {
    const v = s[key];
    if (v && Object.keys(v).length === 0) delete s[key];
  }
  if (s.mainStats && Object.keys(s.mainStats).length === 0) delete s.mainStats;
  if (s.enemy && Object.keys(s.enemy).length === 0) delete s.enemy;
  if (typeof s.objective === 'object') {
    const w = Object.fromEntries(
      Object.entries(s.objective.weights).filter(([, x]) => (x ?? 0) > 0),
    ) as StatVec;
    s.objective = { weights: w };
  }
  return s;
}

/** Key order doesn't matter in JSON objects; arrays keep theirs. */
function stable(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(stable);
  if (x && typeof x === 'object')
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, stable((x as Record<string, unknown>)[k])]),
    );
  return x;
}

export const sameSpec = (a: ConstraintSpec, b: ConstraintSpec) =>
  JSON.stringify(stable(canonicalSpec(a))) ===
  JSON.stringify(stable(canonicalSpec(b)));

/** What a run searches: the request (`topK` aside), the extras, and the
 *  pool by id. Two specs with the same key run the same search. */
export function runKey(run: SpecRun): string {
  const request = JSON.parse(JSON.stringify(run.request)) as SpecRun['request'];
  delete request.topK;
  // A 2+2 is the same requirement in either order.
  const set = request.constraints.setRequirement;
  if (set?.kind === '2+2') set.setKeys.sort();
  return JSON.stringify(
    stable({
      request,
      extras: run.extras,
      pool: run.pool.map((a) => a.id).sort(),
    }),
  );
}

/** Where two canonical specs differ, field by field (for the report). */
export function specDiff(
  expected: ConstraintSpec,
  actual: ConstraintSpec,
): string[] {
  const e = stable(canonicalSpec(expected)) as Record<string, unknown>;
  const a = stable(canonicalSpec(actual)) as Record<string, unknown>;
  const out: string[] = [];
  for (const k of [...new Set([...Object.keys(e), ...Object.keys(a)])].sort()) {
    const x = JSON.stringify(e[k]);
    const y = JSON.stringify(a[k]);
    if (x !== y)
      out.push(`${k}: expected ${x ?? '(none)'}, got ${y ?? '(none)'}`);
  }
  return out;
}
