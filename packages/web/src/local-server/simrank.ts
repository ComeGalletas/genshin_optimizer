/**
 * The local server's simulated re-ranking (TODO 5.8, 8.2): `POST /spec/run`
 * with `objective: "sim"` runs the exact search, then simulates its top
 * builds in a library rotation with the owner's teammates, ranked by team
 * DPS. Types mirror the server's answer; only what the ranking view reads
 * is named.
 * @packageDocumentation
 */

import type {
  Artifact,
  BuildResult,
  OptimizeRequest,
  Slot,
} from '@genshin-build-lab/engine/game/types';
import type { ConstraintSpec } from '@genshin-build-lab/engine/constraints/spec';
import { isRecord, serverJson } from './client';

type Pieces = { artifacts: Record<Slot, Artifact> };

export interface SimBuild extends BuildResult, Pieces {
  rank: number;
  /** Its place in the stat search's order. */
  statRank: number;
  teamDps: { mean: number; sd: number; ci95: [number, number] };
  /** Behind the best, in percent. */
  behindPct: number;
  /** The noise can't separate it from the best. */
  tiedWithBest: boolean;
  characterDps?: { mean: number; share: number };
  fightSec: number;
  warnings: string[];
}

export type SimRun = {
  understood: string;
  /** What the server searched (the spec mapped onto its account). */
  request?: OptimizeRequest;
  /** Why a run that was asked to simulate gives the stat search's order. */
  notSimulated?: string[];
  why?: string[];
} & (
  | {
      status: 'ok';
      sim: {
        rotation: { id: string; name: string; status: string };
        teammates: { key: string; weapon: string; artifacts: number }[];
        iterations: number;
        cachedRuns: number;
        ms: number;
      };
      skipped?: { statRank: number; reasons: string[] }[];
      builds: SimBuild[];
    }
  | {
      /** Not simulated: the stat search's builds, in its order. */
      status: 'ok';
      sim?: undefined;
      builds: (BuildResult & Pieces)[];
    }
  | { status: 'infeasible' | 'timeout' }
);

/** A search plus up to 50 simulations: tens of seconds. */
export function runSimSpec(spec: ConstraintSpec): Promise<SimRun> {
  return serverJson('/spec/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ spec }),
    timeoutMs: 600_000,
    // An `ok` run always lists its builds.
    expect: (x) =>
      isRecord(x) &&
      typeof x.status === 'string' &&
      (x.status !== 'ok' || Array.isArray(x.builds)),
  });
}
