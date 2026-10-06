/**
 * Reading untrusted JSON (third-party payloads, model replies, share links,
 * the local server's answers): the one object guard every reader uses.
 * @packageDocumentation
 */

/** A JSON object: not null, not an array. */
export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
