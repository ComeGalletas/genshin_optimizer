/**
 * Team comparisons (TODO 6.1): a team in a library rotation, as the owner
 * has it, and up to five variants of it, each changing any of who fills a
 * slot, a weapon, a build, the rotation or the enemy. Each variant's team
 * DPS is compared with the base's: the relative difference, its 95%
 * interval, and whether it is inside the noise. The text form ("+7.4% ±
 * 1.2%") is what an explanation cites (6.3). Pure.
 * @packageDocumentation
 */

import * as z from 'zod/mini';
import { MAX_KEY_LEN } from '../game/artifactValidation';
import {
  MainStat,
  SetRule,
  StatAmounts,
  StatObjective,
} from '../constraints/spec';
import type { DpsSample } from './rank';

const Key = z.string().check(z.minLength(1), z.maxLength(MAX_KEY_LEN));

const Enemy = z.strictObject({
  level: z.optional(z.number().check(z.int(), z.minimum(1), z.maximum(200))),
  /** percent */
  res: z.optional(z.number().check(z.minimum(-200), z.maximum(100))),
  /** How many targets. */
  count: z.optional(z.number().check(z.int(), z.minimum(1), z.maximum(5))),
});

/** A build for one character: explicit artifact ids, or conditions the
 *  optimizer fills from the account (extending their curated defaults). */
const BuildChange = z.union([
  z.strictObject({
    artifacts: z.array(Key).check(z.minLength(1), z.maxLength(5)),
  }),
  z.strictObject({
    set: z.optional(SetRule),
    mainStats: z.optional(
      z.strictObject({
        sands: z.optional(MainStat),
        goblet: z.optional(MainStat),
        circlet: z.optional(MainStat),
      }),
    ),
    minStats: z.optional(StatAmounts),
    objective: z.optional(StatObjective),
  }),
]);

export const TeamVariant = z.strictObject({
  /** How the variant is named in results and explanations. */
  label: z.string().check(z.minLength(1), z.maxLength(60)),
  /** Another rotation from the library. */
  rotation: z.optional(Key),
  /** Who replaces whom: `{ "kaedehara_kazuha": "sucrose" }`. The newcomer
   *  must be one the rotation's slot takes. */
  swap: z.optional(z.record(Key, Key)),
  /** Another weapon for a character: `{ "raiden_shogun": { "weapon":
   *  "the_catch", "refinement": 5 } }`. */
  weapons: z.optional(
    z.record(
      Key,
      z.strictObject({
        weapon: Key,
        refinement: z.optional(
          z.number().check(z.int(), z.minimum(1), z.maximum(5)),
        ),
      }),
    ),
  ),
  /** Another build for a character. */
  builds: z.optional(z.record(Key, BuildChange)),
  enemy: z.optional(Enemy),
});
export type TeamVariant = z.infer<typeof TeamVariant>;

export const TEAM_ITERATIONS = 1000;
export const MAX_VARIANTS = 5;

export const TeamSimSpec = z.strictObject({
  /** The base team's rotation (a library id); its slots are filled from the
   *  account as equipped. */
  rotation: Key,
  iterations: z.optional(
    z.number().check(z.int(), z.minimum(100), z.maximum(5000)),
  ),
  /** The enemy for the base and every variant (a variant can change it). */
  enemy: z.optional(Enemy),
  /** Burst waits: filled with attacks (default, as for the owner's builds
   *  in 5.8) or idle. */
  energyWait: z.optional(z.enum(['idle', 'attack'])),
  variants: z.optional(z.array(TeamVariant).check(z.maxLength(MAX_VARIANTS))),
});
export type TeamSimSpec = z.infer<typeof TeamSimSpec>;

export interface VsBase {
  /** (variant − base) / base, percent. */
  pct: number;
  /** Half-width of the 95% interval of that difference, percent. */
  ci95Pct: number;
  /** The interval contains 0: the runs can't tell them apart. */
  withinNoise: boolean;
  /** As an explanation cites it: "+7.4% ± 1.2%". */
  text: string;
}

const Z95 = 1.96;
const se = (d: DpsSample) => d.sd / Math.sqrt(Math.max(1, d.iterations));

/** How a variant's team DPS compares with the base's. */
export function compareToBase(base: DpsSample, variant: DpsSample): VsBase {
  const pct = (100 * (variant.mean - base.mean)) / base.mean;
  const ci95Pct = (100 * Z95 * Math.hypot(se(base), se(variant))) / base.mean;
  const r1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '±';
  return {
    pct,
    ci95Pct,
    withinNoise: Math.abs(pct) <= ci95Pct,
    text: `${sign}${r1(Math.abs(pct))}% ± ${r1(ci95Pct)}%`,
  };
}
