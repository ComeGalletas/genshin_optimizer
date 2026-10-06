/**
 * Request schemas for the HTTP API (ADR-0022: parse once, at the boundary).
 * The server runs under Node, so it uses zod's full API (ADR-0022 §3).
 * Vocabulary (stat, slot, set, character and weapon keys) is checked here
 * too, so a bad key is a 400 naming it, not an empty result.
 * @packageDocumentation
 */

import * as z from 'zod';
import {
  BUILD_LEVELS,
  SLOTS,
  STAT_KEYS,
  isObjective,
} from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';

const MAX_KEY = 64;
const setKeys = new Set(genshinAdapter.sets().map((s) => s.key));

const StatKey = z.enum(STAT_KEYS);
const SetKey = z
  .string()
  .max(MAX_KEY)
  .refine((k) => setKeys.has(k), { message: 'unknown artifact set' });

export const SetRequirement = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('4pc'), setKey: SetKey }),
  z.object({ kind: z.literal('2pc'), setKey: SetKey }),
  z.object({
    kind: z.literal('2+2'),
    setKeys: z.tuple([SetKey, SetKey]).refine(([a, b]) => a !== b, {
      message: 'a 2+2 needs two different sets',
    }),
  }),
]);

export const Constraints = z
  .object({
    setRequirement: SetRequirement.optional(),
    minStats: z.partialRecord(StatKey, z.number().finite()).optional(),
    mainStatLocks: z.partialRecord(z.enum(SLOTS), StatKey).optional(),
    critRatioTarget: z.number().positive().finite().optional(),
  })
  .strict();

export const OptimizeBody = z
  .object({
    characterKey: z
      .string()
      .max(MAX_KEY)
      .refine((k) => !!genshinAdapter.character(k), {
        message: 'unknown character',
      }),
    weaponKey: z
      .string()
      .max(MAX_KEY)
      .refine((k) => !!genshinAdapter.weapon(k), { message: 'unknown weapon' })
      .optional(),
    buildLevel: z
      .number()
      .refine((l) => (BUILD_LEVELS as number[]).includes(l), {
        message: `one of ${BUILD_LEVELS.join(', ')}`,
      })
      .optional(),
    /** The weapon's refinement (ADR-0042); the owner's copy's when unset. */
    refinement: z.number().int().min(1).max(5).optional(),
    objective: z
      .string()
      .refine(isObjective, { message: 'a stat key, crit_value or avg_damage' })
      .optional(),
    /** Replaces the default constraints entirely when given. */
    constraints: Constraints.optional(),
    topK: z.number().int().min(1).max(50).optional(),
    /** `all`: every piece in the account. `free`: unequipped pieces plus the
     *  character's own. */
    pool: z.enum(['all', 'free']).optional(),
  })
  .strict();
export type OptimizeBody = z.infer<typeof OptimizeBody>;

export const IdParam = z.object({ id: z.string().max(MAX_KEY) });
export const SnapshotParam = z.object({
  id: z.coerce.number().int().positive(),
});

const CharacterKey = z
  .string()
  .max(MAX_KEY)
  .refine((k) => !!genshinAdapter.character(k), {
    message: 'unknown character',
  });

export const ArtifactQuery = z
  .object({
    setKey: SetKey.optional(),
    slot: z.enum(SLOTS).optional(),
    mainStat: StatKey.optional(),
    /** Substat floors, e.g. `{ "crit_rate": 7, "crit_dmg": 14 }`. */
    minSubstats: z.partialRecord(StatKey, z.number().finite()).optional(),
    minLevel: z.number().int().min(0).max(20).optional(),
    maxLevel: z.number().int().min(0).max(20).optional(),
    /** A character key (worn by them), "" (unequipped) or "*" (worn by
     *  anyone). */
    location: z.string().max(MAX_KEY).optional(),
    locked: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();
export type ArtifactQuery = z.infer<typeof ArtifactQuery>;

const ArtifactIds = z.array(z.string().max(MAX_KEY)).min(1).max(5);

export const CompareBody = z
  .object({
    characterKey: CharacterKey,
    weaponKey: z
      .string()
      .max(MAX_KEY)
      .refine((k) => !!genshinAdapter.weapon(k), { message: 'unknown weapon' })
      .optional(),
    buildLevel: z
      .number()
      .refine((l) => (BUILD_LEVELS as number[]).includes(l), {
        message: `one of ${BUILD_LEVELS.join(', ')}`,
      })
      .optional(),
    /** The weapon's refinement (ADR-0042); the owner's copy's when unset. */
    refinement: z.number().int().min(1).max(5).optional(),
    objective: z
      .string()
      .refine(isObjective, { message: 'a stat key, crit_value or avg_damage' })
      .optional(),
    /** Artifact ids (from the account, e.g. `m3-17`), one per slot. */
    a: ArtifactIds,
    b: ArtifactIds,
  })
  .strict();
export type CompareBody = z.infer<typeof CompareBody>;

/** A chat request (TODO 3.6): the conversation so far, text only, ending
 *  with the owner's question. Bounded so one request can't flood a local
 *  model's context. */
export const ChatBody = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().min(1).max(4_000),
          })
          .strict(),
      )
      .min(1)
      .max(40)
      .refine((m) => m.at(-1)?.role === 'user', {
        message: 'the last message must be the owner’s question',
      }),
  })
  .strict();
export type ChatBody = z.infer<typeof ChatBody>;

/** A ConstraintSpec to check or run (TODO 4.3). The spec itself is checked
 *  by the engine's `parseConstraintSpec`, whose messages are written for a
 *  model; this only frames it. */
export const SpecBody = z
  .object({
    spec: z.unknown(),
    topK: z.number().int().min(1).max(20).optional(),
  })
  .strict();
export type SpecBody = z.infer<typeof SpecBody>;

/** An allocation (TODO 7.4): characters with their own specs, sharing one
 *  inventory. The specs are checked by the engine, as `SpecBody`'s. */
export const AllocateBody = z
  .object({
    members: z
      .array(
        z
          .object({
            spec: z.unknown(),
            /** Lower picks first in the greedy pass; their order otherwise. */
            priority: z.number().int().min(0).max(100).optional(),
            /** Their share of the plan's score; their role's otherwise. */
            weight: z.number().positive().max(10).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    mode: z.enum(['greedy', 'v1', 'exact']).optional(),
    topM: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export type AllocateBody = z.infer<typeof AllocateBody>;

/** A request in words for the translator (TODO 4.3). */
export const TranslateBody = z
  .object({ text: z.string().trim().min(1).max(1000) })
  .strict();
