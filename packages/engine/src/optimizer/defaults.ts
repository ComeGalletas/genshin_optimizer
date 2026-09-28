/**
 * What to optimise a character for when the caller doesn't say: the one
 * definition the Plan page (`composePlan`) and the local server's
 * `/optimize` (TODO 3.1) share.
 *
 * - Objective: `avg_damage` when a curated damage profile exists, else the
 *   meta recipe's objective, else crit value.
 * - Constraints: the meta recipe's (set, main stats, ER target), plus the
 *   damage profile's ER requirement when the recipe sets none.
 * @packageDocumentation
 */

import type { Objective, OptimizeConstraints } from '../game/types';
import { getDamageProfile } from '../damage/profiles';
import { META_TARGETS, metaToConstraints } from '../meta/metaTargets';

export function defaultObjective(characterKey: string): Objective {
  if (getDamageProfile(characterKey)) return 'avg_damage';
  return META_TARGETS[characterKey]?.objective ?? 'crit_value';
}

export function defaultConstraints(characterKey: string): OptimizeConstraints {
  const meta = META_TARGETS[characterKey];
  const profile = getDamageProfile(characterKey);
  const constraints = meta ? metaToConstraints(meta) : {};
  if (profile?.erRequirement != null && constraints.minStats?.er_pct == null)
    constraints.minStats = {
      ...constraints.minStats,
      er_pct: profile.erRequirement,
    };
  return constraints;
}
