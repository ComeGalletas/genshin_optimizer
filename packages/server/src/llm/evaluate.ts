/**
 * The translator's golden-set evaluation (TODO 4.4, ADR-0039): each request
 * in `spec-golden.json` goes through `translateSpec` exactly as the app
 * sends it, and the spec that comes back is compared with the expected one,
 * both exactly (canonical specs) and by what it runs (`runKey`). The
 * account is the committed sample, so scores are comparable across models
 * and machines and no owner data is involved.
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { fromRoot } from '../paths';
import { importGood, openStore, recordMerge } from '../store/store';
import { Services } from '../api/services';
import {
  runKey,
  sameSpec,
  specDiff,
} from '@genshin-build-lab/engine/constraints/compare';
import type { ConstraintSpec } from '@genshin-build-lab/engine/constraints/spec';
import type { LlmClient } from './client';

export interface GoldenCase {
  id: string;
  request: string;
  /** The spec the request should translate to (minimal: only what it says). */
  expected: object;
}

export interface CaseResult {
  id: string;
  request: string;
  /** A spec came back that passed every check. */
  translated: boolean;
  /** Equal to the expected spec after canonicalising. */
  exact: boolean;
  /** Maps to the same run as the expected spec. */
  equivalent: boolean;
  attempts: number;
  ms: number;
  spec?: ConstraintSpec;
  /** Field by field, where the spec differs from the expected one. */
  diff: string[];
  /** Why no spec came back. */
  error?: string;
}

export interface Evaluation {
  provider: string;
  model: string;
  total: number;
  exact: number;
  equivalent: number;
  translated: number;
  ms: number;
  results: CaseResult[];
}

/** Services over the committed sample account, in a store of its own, with
 *  fixed times: what every evaluation runs against. */
export function sampleAccountServices(): Services {
  const db = openStore(':memory:');
  importGood(db, {
    text: readFileSync(
      fromRoot(
        'packages/engine/src/import/__fixtures__/sample-account.good.json',
      ),
      'utf8',
    ),
    importedAt: '2026-01-02T03:04:05.000Z',
  });
  recordMerge(db, [1], '2026-01-02T03:04:05.000Z');
  return new Services(db);
}

export function loadGolden(
  path: URL | string = new URL('./spec-golden.json', import.meta.url),
): GoldenCase[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { cases: GoldenCase[] })
    .cases;
}

/** Turns one request into a spec that passed the checks, or throws (with
 *  `issues` when it got that far). The app's own path is `appTranslator`;
 *  `npm run spec:eval -- --via claude-code` supplies another. */
export type Translator = (
  request: string,
) => Promise<{ spec: ConstraintSpec; attempts: number }>;

/** The app's path: `translateSpec` with the configured model. */
export const appTranslator =
  (client: LlmClient, services: Services): Translator =>
  (request) =>
    services.translateSpec(client, request);

export async function evaluateGolden(
  label: { provider: string; model: string },
  translate: Translator,
  services: Services,
  cases: readonly GoldenCase[],
  onCase?: (r: CaseResult, index: number) => void,
): Promise<Evaluation> {
  const results: CaseResult[] = [];
  for (const [i, c] of cases.entries()) {
    const expected = services.checkSpec(c.expected);
    const t0 = performance.now();
    let r: CaseResult;
    try {
      const t = await translate(c.request);
      const actual = services.checkSpec(t.spec);
      r = {
        id: c.id,
        request: c.request,
        translated: true,
        exact: sameSpec(expected.spec, t.spec),
        equivalent: runKey(expected.run) === runKey(actual.run),
        attempts: t.attempts,
        ms: Math.round(performance.now() - t0),
        spec: t.spec,
        diff: specDiff(expected.spec, t.spec),
      };
    } catch (e) {
      r = {
        id: c.id,
        request: c.request,
        translated: false,
        exact: false,
        equivalent: false,
        attempts: (e as { issues?: unknown }).issues ? 3 : 0,
        ms: Math.round(performance.now() - t0),
        diff: [],
        error: (e as Error).message,
      };
    }
    results.push(r);
    onCase?.(r, i);
  }
  const count = (f: (r: CaseResult) => boolean) => results.filter(f).length;
  return {
    provider: label.provider,
    model: label.model,
    total: results.length,
    exact: count((r) => r.exact),
    equivalent: count((r) => r.equivalent),
    translated: count((r) => r.translated),
    ms: results.reduce((t, r) => t + r.ms, 0),
    results,
  };
}

const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;

/** The evaluation as Markdown: a summary line and one row per case. */
export function evaluationReport(e: Evaluation, date: string): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const rows = e.results.map(
    (r) =>
      `| ${r.id} | ${r.equivalent ? 'equivalent' : r.translated ? 'different' : 'not translated'}${r.exact ? ', exact' : ''} | ${r.attempts} | ${(r.ms / 1000).toFixed(1)} | ${cell(r.error ?? r.diff.join('; '))} |`,
  );
  return [
    `# Spec translator evaluation: ${e.provider} ${e.model}`,
    '',
    `> Generated by \`npm run spec:eval\` on ${date}, against the sample account; ADR-0039.`,
    '',
    `**${e.equivalent}/${e.total} equivalent (${pct(e.equivalent, e.total)})**, ${e.exact}/${e.total} exact (${pct(e.exact, e.total)}), ${e.total - e.translated} not translated; ${(e.ms / 1000 / e.total).toFixed(1)} s per request on average.`,
    '',
    '| Case | Result | Attempts | Seconds | Difference |',
    '| ---- | ------ | -------: | ------: | ---------- |',
    ...rows,
    '',
  ].join('\n');
}
