/**
 * What a gcsim result says, in the few numbers this app uses (TODO 5.2;
 * 5.3 extends it): mean and spread of team DPS, per-character DPS, and
 * whatever gcsim flagged. The JSON shape is gcsim's `SimulationResult`
 * (`protos/model/result.proto` at the pinned version); fields are read
 * leniently and anything missing is an error, never a zero.
 * @packageDocumentation
 */

import * as z from 'zod';

const Stats = z.object({
  mean: z.number().optional(),
  sd: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

const Result = z.object({
  sim_version: z.string().optional(),
  character_details: z
    .array(z.object({ name: z.string() }).passthrough())
    .optional(),
  incomplete_characters: z.array(z.string()).optional(),
  statistics: z.object({
    iterations: z.number().int().positive(),
    dps: Stats,
    character_dps: z.array(Stats).optional(),
    warnings: z.record(z.string(), z.boolean()).optional(),
  }),
});

export interface SimSummary {
  simVersion?: string;
  iterations: number;
  dps: { mean: number; sd: number; min?: number; max?: number };
  characters: { name: string; dps: number }[];
  /** gcsim's warnings that came up (insufficient energy, swap cooldown…). */
  warnings: string[];
  /** Characters gcsim implements only partly: such a run isn't trusted. */
  incomplete: string[];
}

export class SimResultError extends Error {}

export function summarizeResult(json: unknown): SimSummary {
  const r = Result.safeParse(json);
  if (!r.success)
    throw new SimResultError(
      `not a gcsim result this app can read: ${r.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  const s = r.data.statistics;
  if (s.dps.mean === undefined)
    throw new SimResultError('the gcsim result has no mean DPS');
  const names = (r.data.character_details ?? []).map((c) => c.name);
  return {
    ...(r.data.sim_version && { simVersion: r.data.sim_version }),
    iterations: s.iterations,
    dps: {
      mean: s.dps.mean,
      sd: s.dps.sd ?? 0,
      ...(s.dps.min !== undefined && { min: s.dps.min }),
      ...(s.dps.max !== undefined && { max: s.dps.max }),
    },
    characters: (s.character_dps ?? []).map((c, i) => ({
      name: names[i] ?? `#${i + 1}`,
      dps: c.mean ?? 0,
    })),
    warnings: Object.entries(s.warnings ?? {})
      .filter(([, on]) => on)
      .map(([k]) => k),
    incomplete: r.data.incomplete_characters ?? [],
  };
}
