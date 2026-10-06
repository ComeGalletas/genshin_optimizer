/**
 * Reading untrusted JSON (third-party payloads, model replies, share links,
 * the local server's answers): the guards every reader uses.
 * @packageDocumentation
 */

/** A JSON object: not null, not an array. */
export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** A finite number (not NaN, not ±Infinity). */
export const isFiniteNumber = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x);

/** A non-empty string of at most `max` characters: bounds what an untrusted
 *  value can make reach a regex or the DOM. */
export const isBoundedText = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
