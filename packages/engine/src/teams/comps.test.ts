import { describe, it, expect } from 'vitest';
import { COMP_ARCHETYPES, teammatesFor } from './comps';
import { META_TARGETS } from '../meta/metaTargets';
import { genshinAdapter } from '../game/genshin/adapter';

describe('COMP_ARCHETYPES', () => {
  const keys = new Set(genshinAdapter.characters().map((c) => c.key));

  it('has at least 25 archetypes with unique ids', () => {
    expect(COMP_ARCHETYPES.length).toBeGreaterThanOrEqual(25);
    const ids = COMP_ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references only real characters, with https sources', () => {
    for (const a of COMP_ARCHETYPES) {
      expect(a.source, a.id).toMatch(/^https:\/\//);
      expect(a.slots, a.id).toHaveLength(4);
      for (const slot of a.slots) {
        expect(slot.options.length, a.id).toBeGreaterThan(0);
        for (const o of slot.options) {
          expect(keys.has(o.characterKey), `${a.id}: ${o.characterKey}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('ranks options by non-increasing weight in (0, 1]', () => {
    for (const a of COMP_ARCHETYPES) {
      for (const slot of a.slots) {
        let prev = Infinity;
        for (const o of slot.options) {
          expect(o.weight, `${a.id}: ${o.characterKey}`).toBeGreaterThan(0);
          expect(o.weight, `${a.id}: ${o.characterKey}`).toBeLessThanOrEqual(1);
          expect(o.weight, `${a.id}: ${o.characterKey}`).toBeLessThanOrEqual(
            prev,
          );
          prev = o.weight;
        }
      }
    }
  });

  // The plan solves every ideal pick with its meta recipe; an uncovered one
  // falls back to an unconstrained crit_value solve that returns a rainbow
  // stat-stick, which users read as a bug. Substitutes may stay uncovered —
  // PlanView labels those — but ideals must have a curated recipe.
  it('has a curated META_TARGETS recipe for every ideal (weight 1) pick', () => {
    const uncovered = [
      ...new Set(
        COMP_ARCHETYPES.flatMap((a) =>
          a.slots.flatMap((s) =>
            s.options
              .filter((o) => o.weight === 1 && !META_TARGETS[o.characterKey])
              .map((o) => o.characterKey),
          ),
        ),
      ),
    ].sort();
    expect(
      uncovered,
      `no META_TARGETS entry for: ${uncovered.join(', ')}`,
    ).toEqual([]);
  });

  it('has four distinct characters in every ideal lineup', () => {
    for (const a of COMP_ARCHETYPES) {
      const ideal = a.slots.flatMap((s) =>
        s.options.filter((o) => o.weight === 1).map((o) => o.characterKey),
      );
      expect(new Set(ideal).size, a.id).toBe(ideal.length);
      expect(ideal.length, `${a.id} needs one ideal per slot`).toBe(4);
    }
  });
});

describe('teammatesFor (OptimizePanel "Works well with" derivation, issue #90)', () => {
  it('derives recs from the archetype where the character has its highest weight', () => {
    const entry = teammatesFor('xiao');
    expect(entry).toBeDefined();
    expect(entry!.source).toBe('https://keqingmains.com/xiao/');
    const keys = entry!.recs.map((r) => r.characterKey);
    expect(keys).toContain('faruzan');
    expect(keys).not.toContain('xiao');
    expect(entry!.recs).toHaveLength(3);
    for (const r of entry!.recs) {
      expect(r.role.length).toBeGreaterThan(0);
      expect(r.why).toBe(
        'Anemo RES shred plus plunge buffs; Xiao burns his own HP for uptime.',
      );
    }
  });

  it('returns undefined for a character in no archetype', () => {
    expect(teammatesFor('zzz_not_meta')).toBeUndefined();
  });
});
