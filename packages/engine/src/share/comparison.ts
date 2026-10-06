/**
 * Shared team comparisons (TODO 8.3, ADR-0051): a comparison the sharer's
 * local server simulated (base and up to five variants), carried whole in a
 * link so anyone can read it, server or not. View only: nothing re-runs.
 *
 * Its shape is the server's comparison as the web shows it, less what only
 * mattered on the sharer's machine (cache flags). Decoding validates every
 * field and bounds every list and string, as a build link's does (ADR-0005):
 * all of it reaches the DOM.
 * @packageDocumentation
 */

import { packJson, unpackJson } from './url';
import { isRecord } from '../json';

export const SHARED_COMPARISON_VERSION = 1;

export interface SharedRun {
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
  vsBase?: { pct: number; ci95Pct: number; withinNoise: boolean; text: string };
}

export interface SharedComparison {
  v: typeof SHARED_COMPARISON_VERSION;
  iterations: number;
  burstWaits: string;
  ms: number;
  runs: SharedRun[];
}

/** Bounds: a base and five variants of a four-character team, with room. */
const MAX_RUNS = 6;
const MAX_MEMBERS = 8;
const MAX_LIST = 20;
const MAX_TEXT = 300;
const MAX_REACTIONS = 30;

const isNum = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x);
const isText = (x: unknown, max = MAX_TEXT): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
const isTexts = (x: unknown): x is string[] =>
  Array.isArray(x) && x.length <= MAX_LIST && x.every((t) => isText(t));
const optional = (x: unknown, ok: (x: unknown) => boolean) =>
  x === undefined || ok(x);

function isRun(x: unknown): x is SharedRun {
  if (!isRecord(x) || !isText(x.label, 120)) return false;
  return (
    optional(
      x.rotation,
      (r) =>
        isRecord(r) &&
        isText(r.id, 80) &&
        isText(r.name, 120) &&
        isText(r.status, 20),
    ) &&
    optional(
      x.team,
      (t) =>
        Array.isArray(t) &&
        t.length <= MAX_MEMBERS &&
        t.every(
          (m) =>
            isRecord(m) &&
            isText(m.slot, 80) &&
            isText(m.character, 80) &&
            isText(m.weapon, 80) &&
            Number.isInteger(m.refinement) &&
            (m.refinement as number) >= 1 &&
            (m.refinement as number) <= 5 &&
            Array.isArray(m.sets) &&
            m.sets.length <= 3 &&
            m.sets.every((s) => isText(s, 80)),
        ),
    ) &&
    optional(
      x.enemy,
      (e) =>
        isRecord(e) &&
        optional(e.level, isNum) &&
        optional(e.res, isNum) &&
        optional(e.count, isNum),
    ) &&
    optional(x.problems, isTexts) &&
    optional(x.notSimulated, isTexts) &&
    optional(
      x.dps,
      (d) =>
        isRecord(d) &&
        isNum(d.mean) &&
        isNum(d.sd) &&
        Array.isArray(d.ci95) &&
        d.ci95.length === 2 &&
        d.ci95.every(isNum) &&
        ['min', 'q1', 'median', 'q3', 'max'].every((k) =>
          optional(d[k], isNum),
        ),
    ) &&
    optional(x.fightSec, isNum) &&
    optional(
      x.characters,
      (cs) =>
        Array.isArray(cs) &&
        cs.length <= MAX_MEMBERS &&
        cs.every(
          (c) =>
            isRecord(c) &&
            isText(c.character, 80) &&
            ['dps', 'share', 'fieldSec', 'energyWaitSec'].every((k) =>
              isNum(c[k]),
            ),
        ),
    ) &&
    optional(
      x.reactions,
      (r) =>
        isRecord(r) &&
        Object.keys(r).length <= MAX_REACTIONS &&
        Object.entries(r).every(([k, v]) => isText(k, 40) && isNum(v)),
    ) &&
    optional(x.warnings, isTexts) &&
    optional(
      x.vsBase,
      (v) =>
        isRecord(v) &&
        isNum(v.pct) &&
        isNum(v.ci95Pct) &&
        typeof v.withinNoise === 'boolean' &&
        isText(v.text, 40),
    )
  );
}

/** Validate an untrusted decoded comparison: the typed value, or null. */
export function parseSharedComparison(x: unknown): SharedComparison | null {
  if (!isRecord(x) || x.v !== SHARED_COMPARISON_VERSION) return null;
  if (!Number.isInteger(x.iterations) || (x.iterations as number) < 1)
    return null;
  if (!isText(x.burstWaits, 40) || !isNum(x.ms)) return null;
  if (
    !Array.isArray(x.runs) ||
    x.runs.length === 0 ||
    x.runs.length > MAX_RUNS ||
    !x.runs.every(isRun)
  )
    return null;
  return x as unknown as SharedComparison;
}

/** Keep only what a reader needs (no cache flags, no unknown fields). */
function trim(c: Omit<SharedComparison, 'v'>): SharedComparison {
  return {
    v: SHARED_COMPARISON_VERSION,
    iterations: c.iterations,
    burstWaits: c.burstWaits,
    ms: Math.round(c.ms),
    runs: c.runs.map((r) => ({
      label: r.label,
      ...(r.rotation && {
        rotation: {
          id: r.rotation.id,
          name: r.rotation.name,
          status: r.rotation.status,
        },
      }),
      ...(r.team && { team: r.team }),
      ...(r.enemy && { enemy: r.enemy }),
      ...(r.problems && { problems: r.problems }),
      ...(r.notSimulated && { notSimulated: r.notSimulated }),
      ...(r.dps && { dps: r.dps }),
      ...(r.fightSec !== undefined && { fightSec: r.fightSec }),
      ...(r.characters && { characters: r.characters }),
      ...(r.reactions && { reactions: r.reactions }),
      ...(r.warnings && { warnings: r.warnings }),
      ...(r.vsBase && { vsBase: r.vsBase }),
    })),
  };
}

/** The longest comparison parameter a link may carry (ADR-0051). Real
 *  comparisons come to a few thousand characters; this leaves room and
 *  stays well under what browsers and chat apps keep of a URL. */
export const MAX_COMPARISON_PARAM = 16_000;

/** A comparison as a link parameter, or null when it would be too long
 *  (or isn't one a reader could open). */
export async function encodeComparison(
  c: Omit<SharedComparison, 'v'>,
): Promise<string | null> {
  const shared = trim(c);
  if (!parseSharedComparison(shared)) return null;
  const param = await packJson(shared);
  return param.length <= MAX_COMPARISON_PARAM ? param : null;
}

export async function decodeComparison(
  param: string,
): Promise<SharedComparison | { error: 'UNREADABLE' }> {
  try {
    if (!param || param.length > MAX_COMPARISON_PARAM)
      return { error: 'UNREADABLE' };
    return (
      parseSharedComparison(await unpackJson(param)) ?? { error: 'UNREADABLE' }
    );
  } catch {
    return { error: 'UNREADABLE' };
  }
}
