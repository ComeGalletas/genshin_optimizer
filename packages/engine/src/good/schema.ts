/**
 * GOOD (Genshin Open Object Description), the inventory format every data
 * source produces (CLAUDE.md principle 1): zod schemas for its structure.
 *
 * These check shape and type only. Vocabulary (which slot, stat and character
 * keys this app knows) and support rules (which rarities it scores) are
 * normalization, in `normalize.ts`, so a file that is valid GOOD but uses
 * something this app doesn't support is reported as "unsupported", not
 * "invalid".
 *
 * Each list element is parsed on its own. One malformed artifact is skipped and
 * reported without rejecting the file, the contract the importer has always
 * kept. Objects are loose: fields this app doesn't read (a scanner's extras,
 * newer GOOD versions) survive parsing, for the sidecar (TODO 2.3).
 * Engine code uses `zod/mini` only (ADR-0022).
 * @packageDocumentation
 */

import * as z from 'zod/mini';
import { MAX_KEY_LEN } from '../game/artifactValidation';

/** Largest artifact list accepted. A maxed account runs into the low
 *  thousands; the cap stops a corrupt or hostile file from wedging the main
 *  thread. Over it, the artifact list is rejected as a whole. */
export const MAX_ARTIFACTS = 4000;

/** Largest character or weapon list read; real accounts hold ~100 characters
 *  and a few hundred weapons. Longer lists are truncated (and reported). */
export const MAX_ROSTER = 1000;

/** The top level. Only `format` is required: each list is checked where it is
 *  read, so a malformed `weapons` doesn't cost the artifacts. */
export const GoodFile = z.looseObject({
  format: z.literal('GOOD'),
  version: z.optional(z.unknown()),
  source: z.optional(z.unknown()),
  artifacts: z.optional(z.unknown()),
  characters: z.optional(z.unknown()),
  weapons: z.optional(z.unknown()),
});

/** GOOD's own version number, when present and sane. */
export const GoodVersion = z.number().check(z.int(), z.minimum(1));

/** Free-text name of the exporting tool ("Irminsul", "Inventory_Kamera", …). */
export const GoodSource = z.string().check(z.minLength(1), z.maxLength(200));

/** A list of anything: elements are parsed one by one. */
export const GoodList = z.array(z.unknown());

/**
 * One artifact. `level` and `rarity` are only typed here: the app's range and
 * support rules (level 0..20, 4★/5★ only) are applied in normalization, with
 * the same checks manual entry uses. `substats` is parsed element by element,
 * because a bad substat drops that substat, not the artifact.
 */
export const GoodArtifact = z.looseObject({
  setKey: z.string().check(z.minLength(1), z.maxLength(MAX_KEY_LEN)),
  slotKey: z.string(),
  rarity: z.number(),
  level: z.number(),
  mainStatKey: z.string(),
  substats: z.optional(z.unknown()),
  location: z.optional(z.unknown()),
  lock: z.optional(z.unknown()),
});

/** One artifact substat. zod v4 numbers reject NaN and ±Infinity. */
export const GoodSubstat = z.looseObject({
  key: z.string(),
  value: z.number(),
});

/** A character. Only `key` is required; each other field is read on its own
 *  (below) and dropped alone when malformed. */
export const GoodCharacter = z.looseObject({
  key: z.string(),
  level: z.optional(z.unknown()),
  ascension: z.optional(z.unknown()),
  constellation: z.optional(z.unknown()),
  talent: z.optional(z.unknown()),
});

/** A weapon. Same field-by-field treatment as characters. */
export const GoodWeapon = z.looseObject({
  key: z.string(),
  level: z.optional(z.unknown()),
  ascension: z.optional(z.unknown()),
  refinement: z.optional(z.unknown()),
  location: z.optional(z.unknown()),
  lock: z.optional(z.unknown()),
});

const intIn = (min: number, max: number) =>
  z.number().check(z.int(), z.minimum(min), z.maximum(max));

/** Field schemas for the values read one by one. */
export const GoodFields = {
  characterLevel: intIn(1, 90),
  ascension: intIn(0, 6),
  constellation: intIn(0, 6),
  talentLevel: intIn(1, 15),
  weaponLevel: intIn(1, 90),
  refinement: intIn(1, 5),
  lock: z.boolean(),
  /** A `location` naming who has the item equipped; '' means nobody. */
  location: z.string(),
  talent: z.looseObject({
    auto: z.unknown(),
    skill: z.unknown(),
    burst: z.unknown(),
  }),
};
