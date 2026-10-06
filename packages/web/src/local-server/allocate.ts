/**
 * The local server's account-wide allocation (TODO 7.4, 8.2): `POST
 * /allocate` shares the server's artifacts out between several characters,
 * no piece twice. Types mirror the server's answer; only what the plan's
 * allocation view reads is named.
 * @packageDocumentation
 */

import type {
  Artifact,
  BuildResult,
  Objective,
  OptimizeRequest,
  Slot,
} from '@genshin-build-lab/engine/game/types';
import { serverJson } from './client';

export type AllocateMode = 'exact' | 'v1' | 'greedy';

export interface AllocateRequest {
  members: {
    spec: { character: string } & Record<string, unknown>;
    priority?: number;
    weight?: number;
  }[];
  mode?: AllocateMode;
  topM?: number;
}

export interface AllocatedMember {
  characterKey: string;
  understood: string;
  request: OptimizeRequest;
  priority: number;
  weight: number;
  objective: Objective;
  /** Their build as a fraction of their best alone (v1 and exact). */
  share?: number;
  status: 'ok' | 'no_build';
  build?: BuildResult & { artifacts: Record<Slot, Artifact> };
  conflicts?: string[];
}

export interface PlanMove {
  characterKey: string;
  slot: Slot;
  artifactId: string;
  from: string | null;
  displaced: string | null;
  text: string;
}

export interface AllocateResult {
  mode: AllocateMode;
  ms: number;
  score?: { greedy: number; improved: number; exact?: number };
  solver?: {
    exact: boolean;
    nodes: number;
    candidates: Record<string, number>;
  };
  members: AllocatedMember[];
  moves: { moves: PlanMove[]; inPlace: number };
  farming: string[];
}

/** An allocation: a search per member, more for the exact pass; a minute
 *  or two for eight on a large account. */
export function postAllocate(req: AllocateRequest): Promise<AllocateResult> {
  return serverJson('/allocate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    timeoutMs: 600_000,
  });
}
