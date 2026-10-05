import { readFileSync } from 'node:fs';
import { importGood, openStore, recordMerge, type Store } from '../store/store';
import { Services } from '../api/services';
import { canonicalSpec } from '@genshin-build-lab/engine/constraints/compare';
import {
  ConstraintSpecSchema,
  parseConstraintSpec,
} from '@genshin-build-lab/engine/constraints/spec';
import type { ChatRequest, LlmClient } from './client';
import { SUBMIT_SPEC } from './translate';
import { evaluateGolden, evaluationReport, loadGolden } from './evaluate';

const SAMPLE = readFileSync(
  new URL(
    '../../../engine/src/import/__fixtures__/sample-account.good.json',
    import.meta.url,
  ),
  'utf8',
);
let db: Store;
let services: Services;
beforeEach(() => {
  db = openStore(':memory:');
  importGood(db, { text: SAMPLE, importedAt: '2026-01-02T03:04:05.000Z' });
  recordMerge(db, [1], '2026-01-02T03:04:05.000Z');
  services = new Services(db);
});
afterEach(() => services.searches.close());

const cases = loadGolden();

describe('the golden set', () => {
  it('has 30 cases with unique ids and requests', () => {
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((c) => c.id)).size).toBe(30);
    expect(new Set(cases.map((c) => c.request)).size).toBe(30);
  });

  it('expects only valid, minimal specs that fit the sample account', () => {
    for (const c of cases) {
      const p = parseConstraintSpec(c.expected);
      expect(p.ok, c.id).toBe(true);
      if (!p.ok) continue;
      // Minimal: nothing canonicalSpec would remove or reorder.
      const canon: Record<string, unknown> = { ...canonicalSpec(p.spec) };
      delete canon.version;
      expect(canon, c.id).toEqual(c.expected);
      expect(() => services.checkSpec(c.expected), c.id).not.toThrow();
    }
  });

  it('exercises every field of the spec, and every set rule and objective form', () => {
    const used = new Set(cases.flatMap((c) => Object.keys(c.expected)));
    const fields = Object.keys(ConstraintSpecSchema.shape).filter(
      (k) => k !== 'version',
    );
    expect(fields.filter((f) => !used.has(f))).toEqual([]);
    const kinds = new Set(
      cases.map((c) => (c.expected as { set?: { kind: string } }).set?.kind),
    );
    expect([...kinds].filter(Boolean).sort()).toEqual([
      '2+2',
      '2pc',
      '4pc',
      'any',
    ]);
    const objectives = cases.map(
      (c) => (c.expected as { objective?: unknown }).objective,
    );
    expect(objectives).toContain('avg_damage');
    expect(objectives).toContain('crit_value');
    expect(objectives.some((o) => typeof o === 'object')).toBe(true);
  });
});

/** A model that answers each request with `answer(expected, id)`, or in
 *  text when that is null. */
function modelAnswering(
  answer: (expected: object, id: string) => object | null,
): LlmClient {
  const byRequest = new Map(cases.map((c) => [c.request, c]));
  return {
    provider: 'ollama',
    model: 'fake',
    async chat(req: ChatRequest) {
      const c = byRequest.get(req.messages[0].content)!;
      const spec = answer(c.expected, c.id);
      return spec
        ? {
            text: '',
            toolCalls: [
              { id: 'x', name: SUBMIT_SPEC, arguments: spec as never },
            ],
            stop: 'tool_calls',
          }
        : { text: 'no', toolCalls: [], stop: 'end' };
    },
  };
}

describe('evaluateGolden', () => {
  it('a model that answers every case right scores 30/30, exact', async () => {
    const e = await evaluateGolden(
      modelAnswering((x) => x),
      services,
      cases,
    );
    expect(e).toMatchObject({
      total: 30,
      exact: 30,
      equivalent: 30,
      translated: 30,
    });
  });

  it('tells "equivalent" from "exact", and both from wrong and untranslated', async () => {
    const e = await evaluateGolden(
      modelAnswering((x, id) => {
        // Spells out her defaults: the same run, not the same spec.
        if (id === 'furina-er-floor')
          return {
            ...x,
            set: { kind: '4pc', setKey: 'GoldenTroupe' },
            defaults: 'extend',
          };
        if (id === 'neuvillette-crit-floor')
          return { character: 'neuvillette', minStats: { crit_rate: 0.7 } };
        if (id === 'raiden-4pc') return null;
        return x;
      }),
      services,
      cases,
    );
    const by = new Map(e.results.map((r) => [r.id, r]));
    expect(by.get('furina-er-floor')).toMatchObject({
      equivalent: true,
      exact: false,
    });
    expect(by.get('neuvillette-crit-floor')).toMatchObject({
      translated: true,
      equivalent: false,
      diff: ['minStats: expected {"crit_rate":70}, got {"crit_rate":0.7}'],
    });
    expect(by.get('raiden-4pc')).toMatchObject({
      translated: false,
      attempts: 3,
    });
    expect(e).toMatchObject({ equivalent: 28, exact: 27, translated: 29 });
    const report = evaluationReport(e, '2026-10-05');
    expect(report).toMatch(/^# Spec translator evaluation: ollama fake/);
    expect(report).toMatch(
      /\*\*28\/30 equivalent \(93%\)\*\*, 27\/30 exact \(90%\), 1 not translated/,
    );
    expect(report).toMatch(/\| neuvillette-crit-floor \| different \| 1 \|/);
  });
});
