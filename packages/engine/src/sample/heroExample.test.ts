import { describe, it, expect } from 'vitest';
import { buildHeroExample } from './heroExample';
import { SLOTS } from '../game/types';

describe('buildHeroExample', () => {
  it('returns a feasible, deterministic build with one piece per slot', () => {
    const hero = buildHeroExample();
    expect(hero).not.toBeNull();
    expect(hero!.artifacts).toHaveLength(SLOTS.length);
    expect(hero!.build.objectiveValue).toBeGreaterThan(0);
    expect(hero!.explored).toBeGreaterThan(0);
    expect(hero!.naive).toBeGreaterThan(hero!.explored);
  });

  it('is reproducible across calls (fixed seed)', () => {
    const a = buildHeroExample();
    const b = buildHeroExample();
    expect(a!.build.objectiveValue).toBe(b!.build.objectiveValue);
    expect(a!.explored).toBe(b!.explored);
    expect(a!.pruned).toBe(b!.pruned);
  });
});
