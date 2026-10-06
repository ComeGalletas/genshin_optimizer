/**
 * An optimize request as a ConstraintSpec (TODO 8.2): what the web's
 * Optimise panel has set, said so the local server can run it, here to
 * re-rank its top builds by simulated team DPS (`objective: "sim"`).
 *
 * The spec replaces the curated defaults (`defaults: "replace"`), so it
 * says exactly what the panel says: its set rule (`any` without one), its
 * sands, goblet and circlet locks, its floors and ceilings, and the
 * request's objective as the one that picks the candidates (`sim.by`). The
 * crit-ratio tiebreak, which a spec can't state, is left out. Pure.
 * @packageDocumentation
 */

import type { OptimizeRequest } from '../game/types';
import type { ConstraintSpec, SetRule } from './spec';
import { SPEC_VERSION } from './spec';

export interface SimOptions {
  rotation?: string;
  topK?: number;
  iterations?: number;
}

export function simSpecFromRequest(
  req: OptimizeRequest,
  sim: SimOptions = {},
): ConstraintSpec {
  const c = req.constraints;
  const s = c.setRequirement;
  const set: SetRule = !s
    ? { kind: 'any' }
    : s.kind === '2+2'
      ? { kind: '2+2', setKeys: [s.setKeys[0], s.setKeys[1]] }
      : { kind: s.kind, setKey: s.setKey };
  const locks = c.mainStatLocks ?? {};
  const mainStats = Object.fromEntries(
    (['sands', 'goblet', 'circlet'] as const)
      .filter((slot) => locks[slot])
      .map((slot) => [slot, locks[slot]!]),
  );
  return {
    version: SPEC_VERSION,
    character: req.characterKey,
    weapon: req.weaponKey,
    buildLevel: req.buildLevel,
    defaults: 'replace',
    set,
    ...(Object.keys(mainStats).length && { mainStats }),
    ...(c.minStats &&
      Object.keys(c.minStats).length && { minStats: c.minStats }),
    ...(c.maxStats &&
      Object.keys(c.maxStats).length && { maxStats: c.maxStats }),
    objective: 'sim',
    sim: {
      ...(sim.rotation && { rotation: sim.rotation }),
      ...(req.objective !== 'weighted' && { by: req.objective }),
      ...(sim.topK !== undefined && { topK: sim.topK }),
      ...(sim.iterations !== undefined && { iterations: sim.iterations }),
    },
  };
}
