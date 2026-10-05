import { describe, it, expect } from 'vitest';
import { normalizeGOOD } from '../good/normalize';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import { parseConstraintSpec, type ConstraintSpec } from './spec';
import { specToRun } from './toRequest';
import { canonicalSpec, runKey, sameSpec, specDiff } from './compare';

const good = normalizeGOOD(loadSampleGOOD())!;
const account = {
  roster: good.roster,
  artifacts: good.artifacts!.map((e) => e.artifact),
};
const spec = (x: object): ConstraintSpec => {
  const p = parseConstraintSpec(x);
  if (!p.ok) throw new Error(JSON.stringify(p.issues));
  return p.spec;
};
const key = (x: object) => {
  const r = specToRun(spec(x), account);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return runKey(r.run);
};

describe('canonicalSpec and sameSpec', () => {
  it('ignores what cannot change the meaning', () => {
    expect(
      sameSpec(
        spec({
          character: 'neuvillette',
          defaults: 'extend',
          set: { kind: '2+2', setKeys: ['GoldenTroupe', 'MarechausseeHunter'] },
          keepEquippedOn: ['raiden_shogun', 'furina', 'furina'],
          excludeArtifacts: [],
          objective: { weights: { crit_rate: 2, crit_dmg: 1, em: 0 } },
        }),
        spec({
          character: 'neuvillette',
          set: { kind: '2+2', setKeys: ['MarechausseeHunter', 'GoldenTroupe'] },
          keepEquippedOn: ['furina', 'raiden_shogun'],
          objective: { weights: { crit_dmg: 1, crit_rate: 2 } },
        }),
      ),
    ).toBe(true);
    expect(canonicalSpec(spec({ character: 'furina', minStats: {} }))).toEqual({
      version: 1,
      character: 'furina',
    });
  });

  it('keeps what does change it, and says where', () => {
    const a = spec({ character: 'furina', minStats: { er_pct: 180 } });
    const b = spec({
      character: 'furina',
      minStats: { er_pct: 1.8 },
      objective: 'em',
    });
    expect(sameSpec(a, b)).toBe(false);
    expect(specDiff(a, b)).toEqual([
      'minStats: expected {"er_pct":180}, got {"er_pct":1.8}',
      'objective: expected (none), got "em"',
    ]);
  });
});

describe('runKey: specs that run the same search', () => {
  it('spelling out the defaults runs what leaving them out runs', () => {
    expect(
      key({
        character: 'furina',
        set: { kind: '4pc', setKey: 'GoldenTroupe' },
        mainStats: { sands: 'hp_pct', goblet: 'elemental_dmg' },
        minStats: { er_pct: 180 },
        objective: 'avg_damage',
        weapon: 'favonius_sword',
      }),
    ).toBe(key({ character: 'furina', minStats: { er_pct: 180 } }));
  });

  it('a 2+2 in either order is the same run', () => {
    expect(
      key({
        character: 'neuvillette',
        set: { kind: '2+2', setKeys: ['GoldenTroupe', 'MarechausseeHunter'] },
      }),
    ).toBe(
      key({
        character: 'neuvillette',
        set: { kind: '2+2', setKeys: ['MarechausseeHunter', 'GoldenTroupe'] },
      }),
    );
  });

  it('a different condition is a different run', () => {
    expect(key({ character: 'furina', minStats: { er_pct: 170 } })).not.toBe(
      key({ character: 'furina', minStats: { er_pct: 180 } }),
    );
    expect(key({ character: 'furina', keepEquippedOn: 'all' })).not.toBe(
      key({ character: 'furina' }),
    );
  });
});
