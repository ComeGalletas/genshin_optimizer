import { describe, it, expect } from 'vitest';
import { normalizeGOOD } from '../good/normalize';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import type { OptimizeRequest } from '../game/types';
import { parseConstraintSpec } from './spec';
import { specToRun, type SpecAccount } from './toRequest';
import { simSpecFromRequest } from './fromRequest';

const good = normalizeGOOD(loadSampleGOOD())!;
const account: SpecAccount = {
  roster: good.roster,
  artifacts: good.artifacts!.map((e) => e.artifact),
};

const base: OptimizeRequest = {
  characterKey: 'raiden_shogun',
  weaponKey: 'engulfing_lightning',
  buildLevel: 80,
  constraints: {},
  objective: 'crit_value',
};

/** The spec, checked and mapped back onto the account. */
function roundTrip(req: OptimizeRequest) {
  const parsed = parseConstraintSpec(
    simSpecFromRequest(req, { rotation: 'raiden-national', topK: 10 }),
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const mapped = specToRun(parsed.spec, account, { topK: 10 });
  if (!mapped.ok) throw new Error(JSON.stringify(mapped.issues));
  return { spec: parsed.spec, request: mapped.run.request };
}

describe('simSpecFromRequest (TODO 8.2)', () => {
  it('says exactly what the panel set, so the server searches the same candidates', () => {
    for (const req of [
      base,
      {
        ...base,
        objective: 'avg_damage' as const,
        constraints: {
          setRequirement: {
            kind: '4pc' as const,
            setKey: 'EmblemOfSeveredFate',
          },
          mainStatLocks: {
            sands: 'er_pct' as const,
            circlet: 'crit_rate' as const,
          },
          minStats: { er_pct: 250 },
          maxStats: { crit_rate: 80 },
        },
      },
      {
        ...base,
        objective: 'atk_pct' as const,
        constraints: {
          setRequirement: {
            kind: '2+2' as const,
            setKeys: ['GladiatorsFinale', 'ShimenawasReminiscence'] as [
              string,
              string,
            ],
          },
        },
      },
    ]) {
      const { spec, request } = roundTrip(req);
      expect(spec).toMatchObject({
        objective: 'sim',
        sim: { rotation: 'raiden-national', by: req.objective, topK: 10 },
      });
      // The curated defaults (Raiden's Emblem, ER floor) don't creep in.
      expect(request.constraints).toEqual(req.constraints);
      expect(request).toMatchObject({
        characterKey: req.characterKey,
        weaponKey: req.weaponKey,
        buildLevel: req.buildLevel,
        objective: req.objective,
      });
    }
  });

  it('leaves out what a spec can’t say: a weighted objective and the crit-ratio tiebreak', () => {
    const spec = simSpecFromRequest({
      ...base,
      objective: 'weighted',
      constraints: { critRatioTarget: 0.5 },
    });
    expect(spec.sim).toEqual({});
    expect(spec).not.toHaveProperty('critRatioTarget');
    expect(spec.set).toEqual({ kind: 'any' });
  });
});
