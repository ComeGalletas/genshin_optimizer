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
