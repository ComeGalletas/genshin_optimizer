/**
 * "Every number in an answer must come from a tool result" (CLAUDE.md,
 * principle 3), checked mechanically (TODO 3.6, ADR-0035). A number in the
 * model's answer is grounded when a tool result or the owner's own words
 * hold it, as written or rounded to the precision the answer uses (71.2 is
 * grounded by 71.23, 71 by 71.2, 39,812 by 39812.4). Small counting words
 * (0–10: "4-piece", "top 3", a list's "2.") are exempt; anything else the
 * model made up, summed or estimated is not grounded.
 *
 * Pure; no model calls. The chat loop asks the model to revise once, then
 * masks what is still ungrounded.
 * @packageDocumentation
 */

/** A number as people write it: `39,812`, `71.2`, `180`. A sign is not
 *  part of it (differences are compared by size). */
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Counting words are exempt: set pieces, list items, "top 3". */
export const MAX_EXEMPT_INTEGER = 10;

/** What marks a masked number in the answer. */
export const MASK = '[?]';

interface Written {
  text: string;
  value: number;
  /** Digits after the decimal point, as written. */
  decimals: number;
  index: number;
}

function numbersIn(text: string): Written[] {
  return [...text.matchAll(NUMBER)].map((m) => {
    const plain = m[0].replace(/,/g, '');
    const dot = plain.indexOf('.');
    return {
      text: m[0],
      value: Number(plain),
      decimals: dot < 0 ? 0 : plain.length - dot - 1,
      index: m.index,
    };
  });
}

const EPS = 1e-9;
const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const truncTo = (x: number, d: number) => Math.trunc(x * 10 ** d) / 10 ** d;

/** The source values, for lookups; built once per answer. */
export function sourceValues(sources: readonly string[]): number[] {
  return [...new Set(sources.flatMap((s) => numbersIn(s).map((n) => n.value)))];
}

function grounded(n: Written, values: readonly number[]): boolean {
  if (n.decimals === 0 && n.value <= MAX_EXEMPT_INTEGER) return true;
  return values.some(
    (v) =>
      Math.abs(v - n.value) < EPS ||
      Math.abs(roundTo(v, n.decimals) - n.value) < EPS ||
      Math.abs(truncTo(v, n.decimals) - n.value) < EPS,
  );
}

/** The numbers in `answer` (as written) that no source holds. */
export function ungroundedNumbers(
  answer: string,
  sources: readonly string[],
): string[] {
  const values = sourceValues(sources);
  return [
    ...new Set(
      numbersIn(answer)
        .filter((n) => !grounded(n, values))
        .map((n) => n.text),
    ),
  ];
}

/** The answer with every ungrounded number replaced by `MASK`, and the
 *  numbers it replaced. */
export function maskUngrounded(
  answer: string,
  sources: readonly string[],
): { text: string; masked: string[] } {
  const values = sourceValues(sources);
  const masked = new Set<string>();
  let text = '';
  let at = 0;
  for (const n of numbersIn(answer)) {
    if (grounded(n, values)) continue;
    masked.add(n.text);
    text += answer.slice(at, n.index) + MASK;
    at = n.index + n.text.length;
  }
  return { text: text + answer.slice(at), masked: [...masked] };
}
