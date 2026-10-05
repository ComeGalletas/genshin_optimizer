/**
 * What a gcsim result says (TODO 5.2, 5.3): team DPS with its spread,
 * per-character DPS and share, reactions, energy (what each character
 * generated, what was left at the end, time spent waiting on it), field
 * time, and whatever gcsim flagged. The JSON is gcsim's `SimulationResult`
 * (`protos/model/result.proto` at the pinned version), checked against a
 * real run of v2.48.8: durations, field time and energy waits are in
 * seconds (field times add up to the fight's length), reactions are counts
 * per run. Anything missing that a number depends on is an error, never a
 * zero.
 * @packageDocumentation
 */

import * as z from 'zod';

const Stats = z.object({
  mean: z.number().optional(),
  sd: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  q1: z.number().optional(),
  q2: z.number().optional(),
  q3: z.number().optional(),
});
const BySource = z.object({ sources: z.record(z.string(), Stats).optional() });

const Result = z.object({
  sim_version: z.string().optional(),
  /** 1: fight for a duration; 2: fight until the target's HP is gone. */
  mode: z.number().optional(),
  character_details: z.array(z.object({ name: z.string() }).loose()).optional(),
  incomplete_characters: z.array(z.string()).optional(),
  statistics: z.object({
    iterations: z.number().int().positive(),
    dps: Stats,
    duration: Stats.optional(),
    character_dps: z.array(Stats).optional(),
    field_time: z.array(Stats).optional(),
    source_reactions: z.array(BySource).optional(),
    total_source_energy: z.array(BySource).optional(),
    end_stats: z
      .array(z.object({ ending_energy: Stats.optional() }))
      .optional(),
    failed_actions: z
      .array(z.object({ insufficient_energy: Stats.optional() }).loose())
      .optional(),
    warnings: z.record(z.string(), z.boolean()).optional(),
  }),
});

const mean = (s: z.infer<typeof Stats> | undefined) => s?.mean ?? 0;
const means = (b: z.infer<typeof BySource> | undefined) =>
  Object.fromEntries(
    Object.entries(b?.sources ?? {}).map(([k, v]) => [k, mean(v)]),
  );

export interface CharacterResult {
  /** gcsim's key, e.g. `raidenshogun`. */
  name: string;
  dps: { mean: number; sd: number };
  /** Of the team's mean DPS, 0 to 1. */
  share: number;
  fieldTimeSec: number;
  /** Mean reactions this character triggered in a run, by reaction. */
  reactions: Record<string, number>;
  /** Mean energy this character received in a run, by source. */
  energyBySource: Record<string, number>;
  endingEnergy: number;
  /** Mean time a run spent with this character's actions waiting on energy. */
  energyWaitSec: number;
}

export interface SimResult {
  simVersion?: string;
  iterations: number;
  /** `damage` (fight to a target's death) is not comparable with `duration`. */
  mode: 'duration' | 'damage';
  durationSec: number;
  dps: {
    mean: number;
    sd: number;
    min?: number;
    max?: number;
    median?: number;
  };
  characters: CharacterResult[];
  /** Mean reactions in a run, whole team. */
  reactions: Record<string, number>;
  /** gcsim's warnings that came up (insufficient_energy, burst_cd…). */
  warnings: string[];
  /** Characters gcsim implements only partly: such a run isn't trusted. */
  incomplete: string[];
}

export class SimResultError extends Error {}

export function readResult(json: unknown): SimResult {
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
  const team = s.dps.mean;
  const names = (r.data.character_details ?? []).map((c) => c.name);
  const characters = (s.character_dps ?? []).map((d, i): CharacterResult => ({
    name: names[i] ?? `#${i + 1}`,
    dps: { mean: mean(d), sd: d.sd ?? 0 },
    share: team > 0 ? mean(d) / team : 0,
    fieldTimeSec: mean(s.field_time?.[i]),
    reactions: means(s.source_reactions?.[i]),
    energyBySource: means(s.total_source_energy?.[i]),
    endingEnergy: mean(s.end_stats?.[i]?.ending_energy),
    energyWaitSec: mean(s.failed_actions?.[i]?.insufficient_energy),
  }));
  const reactions: Record<string, number> = {};
  for (const c of characters)
    for (const [k, v] of Object.entries(c.reactions))
      reactions[k] = (reactions[k] ?? 0) + v;
  return {
    ...(r.data.sim_version && { simVersion: r.data.sim_version }),
    iterations: s.iterations,
    mode: r.data.mode === 2 ? 'damage' : 'duration',
    durationSec: mean(s.duration),
    dps: {
      mean: team,
      sd: s.dps.sd ?? 0,
      ...(s.dps.min !== undefined && { min: s.dps.min }),
      ...(s.dps.max !== undefined && { max: s.dps.max }),
      ...(s.dps.q2 !== undefined && { median: s.dps.q2 }),
    },
    characters,
    reactions,
    warnings: Object.entries(s.warnings ?? {})
      .filter(([, on]) => on)
      .map(([k]) => k),
    incomplete: r.data.incomplete_characters ?? [],
  };
}
