/**
 * The local server's team comparisons (TODO 6.2, ADR-0046): the rotation
 * library and `POST /sim/team`. Types mirror the server's answer; only what
 * the comparison view reads is named.
 * @packageDocumentation
 */

import { serverJson } from './client';

export interface RotationSummary {
  id: string;
  name?: string;
  status?: 'validated' | 'draft';
  characters?: string[];
  source?: string;
  dps?: number;
  /** Set when the rotation failed its checks: listed, not usable. */
  problems?: string[];
}

/** One change set, as the server takes it. */
export interface TeamVariantRequest {
  label: string;
  rotation?: string;
  swap?: Record<string, string>;
  weapons?: Record<string, { weapon: string; refinement?: number }>;
  builds?: Record<
    string,
    | { artifacts: string[] }
    | { set?: { kind: '4pc'; setKey: string } | { kind: 'any' } }
  >;
  enemy?: { level?: number; res?: number; count?: number };
}

export interface TeamSimRequest {
  rotation: string;
  iterations?: number;
  enemy?: { level?: number; res?: number; count?: number };
  variants?: TeamVariantRequest[];
}

export interface TeamRun {
  label: string;
  rotation?: { id: string; name: string; status: string };
  team?: {
    slot: string;
    character: string;
    weapon: string;
    refinement: number;
    sets: string[];
  }[];
  enemy?: { level?: number; res?: number; count?: number };
  problems?: string[];
  notSimulated?: string[];
  dps?: {
    mean: number;
    sd: number;
    ci95: [number, number];
    min?: number;
    q1?: number;
    median?: number;
    q3?: number;
    max?: number;
  };
  fightSec?: number;
  characters?: {
    character: string;
    dps: number;
    share: number;
    fieldSec: number;
    energyWaitSec: number;
  }[];
  reactions?: Record<string, number>;
  warnings?: string[];
  cached?: boolean;
  vsBase?: { pct: number; ci95Pct: number; withinNoise: boolean; text: string };
}

export interface TeamSimResult {
  iterations: number;
  burstWaits: string;
  ms: number;
  runs: TeamRun[];
}

export async function fetchRotations(): Promise<RotationSummary[]> {
  const r = await serverJson<{ rotations: RotationSummary[] }>('/rotations', {
    timeoutMs: 10_000,
  });
  return r.rotations;
}

/** A comparison: seconds for a few variants, more with optimizer builds. */
export function postTeamSim(req: TeamSimRequest): Promise<TeamSimResult> {
  return serverJson<TeamSimResult>('/sim/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    timeoutMs: 300_000,
  });
}
