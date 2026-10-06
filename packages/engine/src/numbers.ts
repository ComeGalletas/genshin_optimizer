/**
 * Small numeric helpers shared across the engine and its callers: one seeded
 * random generator, so the benchmark, the demo data and every randomised
 * test reproduce exactly, and one-decimal rounding.
 * @packageDocumentation
 */

/** mulberry32: a small deterministic PRNG, uniform on [0, 1). The same seed
 *  gives the same sequence anywhere, so committed numbers reproduce. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounded to one decimal, as a number (2.345 → 2.3). */
export const round1 = (x: number): number => Math.round(x * 10) / 10;
