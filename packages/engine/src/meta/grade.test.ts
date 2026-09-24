import { describe, it, expect } from 'vitest';
import { gradeBuild } from './grade';

describe('gradeBuild', () => {
  it('returns null when there are no stat targets to grade against', () => {
    expect(gradeBuild({ crit_rate: 70 }, {})).toBeNull();
  });

  it('treats a missing totals key as 0', () => {
    const g = gradeBuild({}, { crit_rate: 70 });
    expect(g?.perStat).toEqual([
      { key: 'crit_rate', have: 0, target: 70, pct: 0 },
    ]);
    expect(g?.grade).toBe('D');
  });

  it('grades S when every stat is at or above its target', () => {
    const g = gradeBuild(
      { crit_rate: 70, crit_dmg: 150 },
      { crit_rate: 70, crit_dmg: 140 },
    );
    expect(g?.grade).toBe('S');
  });

  it('grades exactly at each threshold boundary', () => {
    // score = 0.98 exactly -> S
    expect(gradeBuild({ crit_rate: 98 }, { crit_rate: 100 })?.grade).toBe('S');
    // score = 0.97999... -> A (just under the S cutoff)
    expect(gradeBuild({ crit_rate: 97.9 }, { crit_rate: 100 })?.grade).toBe(
      'A',
    );
    // score = 0.9 exactly -> A
    expect(gradeBuild({ crit_rate: 90 }, { crit_rate: 100 })?.grade).toBe('A');
    // score = 0.75 exactly -> B
    expect(gradeBuild({ crit_rate: 75 }, { crit_rate: 100 })?.grade).toBe('B');
    // score = 0.5 exactly -> C
    expect(gradeBuild({ crit_rate: 50 }, { crit_rate: 100 })?.grade).toBe('C');
    // score just under 0.5 -> D
    expect(gradeBuild({ crit_rate: 49 }, { crit_rate: 100 })?.grade).toBe('D');
  });

  it('a single very-short stat drags the grade down even if others are maxed', () => {
    // crit_dmg at 300% of target (capped to 1.0) + crit_rate at 20% of target
    // -> mean = (1.0 + 0.2) / 2 = 0.6 -> C, not S, despite the huge crit_dmg overshoot.
    const g = gradeBuild(
      { crit_rate: 14, crit_dmg: 450 },
      { crit_rate: 70, crit_dmg: 150 },
    );
    expect(g?.grade).toBe('C');
    expect(g?.perStat.find((s) => s.key === 'crit_dmg')?.pct).toBeCloseTo(3);
  });

  it("finds the weakest stat by pct for a 'what's holding you back' cue", () => {
    const g = gradeBuild(
      { crit_rate: 70, crit_dmg: 100 },
      { crit_rate: 70, crit_dmg: 140 },
    );
    const weakest = g?.perStat.reduce((a, b) => (b.pct < a.pct ? b : a));
    expect(weakest?.key).toBe('crit_dmg');
  });
});
