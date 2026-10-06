import { describe, it, expect } from 'vitest';
import { describeIssues } from '../zodIssues';
import { gcsimConfig } from './configgen';
import { compareToBase, TeamSimSpec } from './team';

describe('TeamSimSpec (TODO 6.1)', () => {
  const issues = (x: unknown) => {
    const r = TeamSimSpec.safeParse(x);
    return r.success ? [] : describeIssues(r.error.issues, '');
  };

  it('accepts a base and labelled variants changing anything', () => {
    expect(
      issues({
        rotation: 'raiden-national',
        iterations: 500,
        enemy: { res: -20 },
        variants: [
          {
            label: 'The Catch',
            weapons: { raiden_shogun: { weapon: 'the_catch', refinement: 5 } },
          },
          { label: 'Sucrose', swap: { kaedehara_kazuha: 'sucrose' } },
          {
            label: 'TF',
            builds: {
              raiden_shogun: { set: { kind: '4pc', setKey: 'ThunderingFury' } },
            },
          },
          { label: 'Pieces', builds: { bennett: { artifacts: ['a1', 'a2'] } } },
          {
            label: 'AoE',
            enemy: { count: 3, level: 95 },
            rotation: 'raiden-national-xingqiu',
          },
        ],
      }),
    ).toEqual([]);
  });

  it('refuses what it doesn’t know, with where', () => {
    expect(
      issues({ rotation: 'x', variants: [{ label: 'a', bogus: 1 }] }),
    ).toEqual([{ path: 'variants.0.bogus', message: 'unknown field' }]);
    expect(issues({ rotation: 'x', variants: [{ swap: {} }] })).toEqual([
      { path: 'variants.0.label', message: 'expected string' },
    ]);
    expect(issues({ rotation: 'x', enemy: { count: 9 } })).toEqual([
      { path: 'enemy.count', message: 'at most 5' },
    ]);
    expect(
      issues({
        rotation: 'x',
        variants: Array.from({ length: 6 }, (_, i) => ({ label: `v${i}` })),
      }),
    ).toEqual([{ path: 'variants', message: 'at most 5' }]);
  });
});

describe('compareToBase', () => {
  it('the difference in percent of the base, its 95% interval, and the text an explanation cites', () => {
    // se 50 each (sd 1000, 400 iterations): the difference's se is 70.7,
    // so its 95% half-width is 138.6, 0.2772% of 50,000.
    const v = compareToBase(
      { mean: 50_000, sd: 1000, iterations: 400 },
      { mean: 53_700, sd: 1000, iterations: 400 },
    );
    expect(v.pct).toBeCloseTo(7.4, 10);
    expect(v.ci95Pct).toBeCloseTo(
      (100 * 1.96 * Math.hypot(50, 50)) / 50_000,
      10,
    );
    expect(v).toMatchObject({ withinNoise: false, text: '+7.4% ± 0.3%' });
  });

  it('a loss reads with a minus sign; a difference inside the noise says so', () => {
    expect(
      compareToBase(
        { mean: 50_000, sd: 1000, iterations: 400 },
        { mean: 46_350, sd: 1000, iterations: 400 },
      ).text,
    ).toBe('−7.3% ± 0.3%');
    const tie = compareToBase(
      { mean: 50_000, sd: 5000, iterations: 100 },
      { mean: 50_400, sd: 5000, iterations: 100 },
    );
    expect(tie).toMatchObject({ withinNoise: true, text: '+0.8% ± 2.8%' });
  });
});

describe('several targets (configgen)', () => {
  it('copies the first target on a line through it, hitboxes apart (2 × radius + 0.5)', () => {
    const c = gcsimConfig({
      characters: [],
      active: 'furina',
      rotation: 'furina attack;',
      enemy: { hp: 999, radius: 2, pos: [0, 2.4], count: 4 },
    });
    expect(c.split('\n').filter((l) => l.startsWith('target'))).toEqual([
      'target lvl=100 resist=0.1 radius=2 pos=0,2.4 hp=999;',
      'target lvl=100 resist=0.1 radius=2 pos=4.5,2.4 hp=999;',
      'target lvl=100 resist=0.1 radius=2 pos=-4.5,2.4 hp=999;',
      'target lvl=100 resist=0.1 radius=2 pos=9,2.4 hp=999;',
    ]);
  });
});
