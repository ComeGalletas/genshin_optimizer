import { describe, it, expect } from 'vitest';
import { rankBySim } from './rank';

const e = (item: string, statRank: number, mean: number, sd = 1000) => ({
  item,
  statRank,
  dps: { mean, sd, iterations: 400 },
});

describe('rankBySim', () => {
  it('ranks by mean DPS with a 95% interval of the mean', () => {
    const [a, b] = rankBySim([e('second', 1, 50_000), e('first', 2, 60_000)]);
    expect(a).toMatchObject({
      item: 'first',
      rank: 1,
      statRank: 2,
      behindPct: 0,
      tiedWithBest: false,
    });
    // sd 1000 over 400 iterations: the mean is known to ± 1.96 × 50.
    expect(a.ci95[0]).toBeCloseTo(60_000 - 98, 6);
    expect(a.ci95[1]).toBeCloseTo(60_000 + 98, 6);
    expect(b).toMatchObject({ item: 'second', rank: 2 });
    expect(b.behindPct).toBeCloseTo(100 / 6, 6);
  });

  it('flags what the noise can’t separate from the best, and the best with it', () => {
    // Two runs with se 50 each: the difference has se ≈ 70.7, so anything
    // within 1.96 × 70.7 ≈ 138.6 of the best ties it.
    const r = rankBySim([
      e('best', 3, 60_000),
      e('inside', 1, 59_870),
      e('outside', 2, 59_850),
    ]);
    expect(r.map((x) => [x.item, x.tiedWithBest])).toEqual([
      ['best', true],
      ['inside', true],
      ['outside', false],
    ]);
    expect(
      rankBySim([e('a', 1, 60_000), e('b', 2, 50_000)])[0].tiedWithBest,
    ).toBe(false);
  });

  it('more iterations separate what fewer couldn’t', () => {
    const few = rankBySim([
      {
        item: 'a',
        statRank: 1,
        dps: { mean: 60_000, sd: 1000, iterations: 100 },
      },
      {
        item: 'b',
        statRank: 2,
        dps: { mean: 59_800, sd: 1000, iterations: 100 },
      },
    ]);
    const many = rankBySim([
      {
        item: 'a',
        statRank: 1,
        dps: { mean: 60_000, sd: 1000, iterations: 1000 },
      },
      {
        item: 'b',
        statRank: 2,
        dps: { mean: 59_800, sd: 1000, iterations: 1000 },
      },
    ]);
    expect(few[1].tiedWithBest).toBe(true);
    expect(many[1].tiedWithBest).toBe(false);
  });

  it('equal means keep the stat search’s order; nothing in, nothing out', () => {
    expect(
      rankBySim([e('later', 2, 60_000), e('earlier', 1, 60_000)]).map(
        (x) => x.item,
      ),
    ).toEqual(['earlier', 'later']);
    expect(rankBySim([])).toEqual([]);
  });
});
