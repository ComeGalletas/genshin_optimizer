/**
 * The local server's team comparisons (TODO 6.2, ADR-0046): the rotation
 * library and `POST /sim/team`. Types mirror the server's answer; only what
 * the comparison view reads is named.
 * @packageDocumentation
 */

import { isRecord, serverJson, withArrays } from './client';

export interface RotationSummary {
  id: string;
  name?: string;
  status?: 'validated' | 'draft';
  archetype?: string;
  /** Per slot, "a or b" when it takes more than one. */
  characters?: string[];
  /** Where it came from: community, adapted, owner or llm. */
  source?: string;
  /** Its own gcsim run on the reference builds. */
  dps?: number;
  gcsim?: string;
  reviewed?: boolean;
  summary?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  publishedDps?: number;
  /** How far `dps` is from `publishedDps`, in percent. */
  offPct?: number;
  /** Slots the server's account can't fill. */
  missing?: string[];
  /** Set when the rotation failed its checks: listed, not usable. */
  problems?: string[];
}

/** A rotation's whole record (`GET /rotations/:id`), as far as the
 *  library browser reads it. */
export interface RotationDetail {
  meta: {
    id: string;
    name: string;
    status: 'validated' | 'draft';
    summary: string;
    slots: {
      id: string;
      characters: string[];
      role: string;
      filler?: string | false;
    }[];
    active: string;
    fight:
      | {
          mode: 'actions';
          enemy: { level: number; res: number; hp: number };
          energy?: string;
        }
      | {
          mode: 'duration';
          seconds: number;
          enemy: { level: number; res: number };
          energy?: string;
        };
    energyWait?: 'idle' | 'attack';
    rotationSec?: number;
    source: {
      kind: string;
      title: string;
      url?: string;
      retrieved: string;
      publishedDps?: number;
      changes?: string;
    };
    validation?: {
      gcsim: string;
      date: string;
      iterations: number;
      dps: number;
      sd: number;
      durationSec: number;
      warnings: string[];
      offPct?: number;
    };
    review?: { by: string; date: string; gcsim: string; note?: string };
  };
  template: string;
}

export function fetchRotation(id: string): Promise<RotationDetail> {
  return serverJson(`/rotations/${encodeURIComponent(id)}`, {
    timeoutMs: 10_000,
    expect: (x) =>
      isRecord(x) && isRecord(x.meta) && typeof x.template === 'string',
  });
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

let rotationsInFlight: Promise<RotationSummary[]> | null = null;

/** The rotation library. Callers that ask while a request is out share it:
 *  Simulate's two sections (Compare Teams, the Rotation Library) open
 *  together and used to fetch it twice. Nothing is kept once it settles,
 *  so the next view fetches fresh. */
export function fetchRotations(): Promise<RotationSummary[]> {
  rotationsInFlight ??= serverJson<{ rotations: RotationSummary[] }>(
    '/rotations',
    { timeoutMs: 10_000, expect: withArrays('rotations') },
  )
    .then((r) => r.rotations)
    .finally(() => {
      rotationsInFlight = null;
    });
  return rotationsInFlight;
}

/** A comparison: seconds for a few variants, more with optimizer builds. */
export function postTeamSim(req: TeamSimRequest): Promise<TeamSimResult> {
  return serverJson<TeamSimResult>('/sim/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    timeoutMs: 300_000,
    expect: withArrays('runs'),
  });
}
