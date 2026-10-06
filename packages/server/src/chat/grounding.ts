/**
 * "Every number in an answer must come from a tool result" (CLAUDE.md,
 * principle 3), checked mechanically (TODO 3.6, ADR-0035). A number in the
 * model's answer is grounded when a tool result or the owner's own words
 * hold it, as written or rounded to the precision the answer uses (71.2 is
 * grounded by 71.23, 71 by 71.2, 39,812 by 39812.4). Small counting words
 * (0–10: "4-piece", "top 3", a list's "2.") are exempt; anything else the
 * model made up, summed or estimated is not grounded.
 *
 * Two stricter rules for differences (TODO 6.3, ADR-0047):
 * - A number written with a sign ("+7.4", "−8.6") needs a source number of
 *   the same sign: a loss can't be told as a gain.
 * - A simulated comparison ("+7.4% ± 1.2%") must be one a tool wrote, sign
 *   and digits exactly (`simulate_team`'s `vsBase.text`): not rounded, and
 *   not one variant's difference with another's interval.
 *
 * Pure; no model calls. The chat loop asks the model to revise once, then
 * masks what is still ungrounded.
 * @packageDocumentation
 */

/** A number as people write it: `39,812`, `71.2`, `180`. */
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** A comparison as `simulate_team` writes it, sign optional so that an
 *  unsigned one is caught too: "+7.4% ± 1.2%", "−3.6% ± 0.3%". */
const COMPARISON =
  /(?:([+\-−±])\s?)?(\d+(?:\.\d+)?)\s?%\s?±\s?(\d+(?:\.\d+)?)\s?%/g;

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
  /** Written with a sign attached ("+7.4", "−8.6", "-8.6"). */
  sign?: '+' | '-';
}

/** The sign written right before a number at `index`, if it is a sign: not
 *  a hyphen inside a word, a date or a range ("m1-17", "2026-01", "1-2"). */
function signAt(text: string, index: number): '+' | '-' | undefined {
  const c = text[index - 1];
  if (c !== '+' && c !== '-' && c !== '−') return undefined;
  if (index >= 2 && /[\w.,%)\]]/.test(text[index - 2])) return undefined;
  return c === '+' ? '+' : '-';
}

function numbersIn(text: string): Written[] {
  return [...text.matchAll(NUMBER)].map((m) => {
    const plain = m[0].replace(/,/g, '');
    const dot = plain.indexOf('.');
    const sign = signAt(text, m.index);
    return {
      text: m[0],
      value: Number(plain),
      decimals: dot < 0 ? 0 : plain.length - dot - 1,
      index: m.index,
      ...(sign && { sign }),
    };
  });
}

interface WrittenComparison {
  text: string;
  index: number;
  /** "+7.4% ± 1.2%", the sign normalised to + or −. */
  key: string;
}

function comparisonsIn(text: string): WrittenComparison[] {
  return [...text.matchAll(COMPARISON)].map((m) => ({
    text: m[0],
    index: m.index,
    key: `${m[1] === '-' ? '−' : (m[1] ?? '')}${m[2]}% ± ${m[3]}%`,
  }));
}

const EPS = 1e-9;
const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const truncTo = (x: number, d: number) => Math.trunc(x * 10 ** d) / 10 ** d;

/** What the sources hold, for lookups; built once per answer. */
interface Sources {
  values: number[];
  /** Values that appear with a minus sign, and without one. */
  negative: number[];
  positive: number[];
  comparisons: Set<string>;
}

function readSources(sources: readonly string[]): Sources {
  const all = sources.flatMap((s) => numbersIn(s));
  const uniq = (xs: number[]) => [...new Set(xs)];
  return {
    values: uniq(all.map((n) => n.value)),
    negative: uniq(all.filter((n) => n.sign === '-').map((n) => n.value)),
    positive: uniq(all.filter((n) => n.sign !== '-').map((n) => n.value)),
    comparisons: new Set(
      sources.flatMap((s) => comparisonsIn(s).map((c) => c.key)),
    ),
  };
}

const matches = (n: Written, values: readonly number[]) =>
  values.some(
    (v) =>
      Math.abs(v - n.value) < EPS ||
      Math.abs(roundTo(v, n.decimals) - n.value) < EPS ||
      Math.abs(truncTo(v, n.decimals) - n.value) < EPS,
  );

function grounded(n: Written, src: Sources): boolean {
  if (n.decimals === 0 && n.value <= MAX_EXEMPT_INTEGER) return true;
  if (n.sign === '-') return matches(n, src.negative);
  if (n.sign === '+') return matches(n, src.positive);
  return matches(n, src.values);
}

/** What in `answer` fails the rules: each comparison not written exactly as
 *  a tool wrote one, and each other number no source holds, as written
 *  (with its sign when it has one). Spans, in order. */
function findUngrounded(
  answer: string,
  src: Sources,
): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const covered: [number, number][] = [];
  for (const c of comparisonsIn(answer)) {
    covered.push([c.index, c.index + c.text.length]);
    if (!src.comparisons.has(c.key))
      out.push({ text: c.text, start: c.index, end: c.index + c.text.length });
  }
  for (const n of numbersIn(answer)) {
    if (covered.some(([a, b]) => n.index >= a && n.index < b)) continue;
    if (grounded(n, src)) continue;
    const start = n.sign ? n.index - 1 : n.index;
    out.push({
      text: answer.slice(start, n.index + n.text.length),
      start,
      end: n.index + n.text.length,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The numbers and comparisons in `answer` (as written) that no source
 *  holds. */
export function ungroundedNumbers(
  answer: string,
  sources: readonly string[],
): string[] {
  return [
    ...new Set(findUngrounded(answer, readSources(sources)).map((u) => u.text)),
  ];
}

/** The answer with everything ungrounded replaced by `MASK`, and what it
 *  replaced. */
export function maskUngrounded(
  answer: string,
  sources: readonly string[],
): { text: string; masked: string[] } {
  const masked = new Set<string>();
  let text = '';
  let at = 0;
  for (const u of findUngrounded(answer, readSources(sources))) {
    masked.add(u.text);
    text += answer.slice(at, u.start) + MASK;
    at = u.end;
  }
  return { text: text + answer.slice(at), masked: [...masked] };
}
