import { describe, it, expect } from 'vitest';
import { WEAPON_OBTAINABILITY } from './obtainability';
import { adviseInvestments } from './advise';
import { genshinAdapter } from '../game/genshin/adapter';
import { WEAPON_TYPES } from '../game/types';
import type { ArchetypeGap } from '../teams/recommend';
import type { RosterEntry } from '../import/good';

describe('WEAPON_OBTAINABILITY', () => {
  it('references only real weapons, each with an https source', () => {
    const keys = new Set(genshinAdapter.weapons().map((w) => w.key));
    for (const [key, entry] of Object.entries(WEAPON_OBTAINABILITY)) {
      expect(keys.has(key), `unknown weapon: ${key}`).toBe(true);
      expect(entry.source, key).toMatch(/^https:\/\//);
    }
    expect(Object.keys(WEAPON_OBTAINABILITY).length).toBeGreaterThanOrEqual(50);
  });

  it('includes at least one craftable option for every weapon type', () => {
    const byKey = new Map(genshinAdapter.weapons().map((w) => [w.key, w]));
    const craftableTypes = new Set(
      Object.entries(WEAPON_OBTAINABILITY)
        .filter(([, e]) => e.tier === 'craftable')
        .map(([k]) => byKey.get(k)?.type),
    );
    for (const t of WEAPON_TYPES)
      expect(craftableTypes.has(t), `no craftable ${t}`).toBe(true);
  });
});

const gap = (over: Partial<ArchetypeGap> = {}): ArchetypeGap => ({
  archetypeId: 'hu-tao-vape',
  missingRole: 'sustain',
  candidates: ['zhongli', 'layla'],
  bestPossibleScore: 80,
  ...over,
});

describe('adviseInvestments', () => {
  it('advises an unowned gap candidate, with the score delta in the headline', () => {
    const out = adviseInvestments([gap()], {}, {});
    const char = out.find((a) => a.kind === 'character');
    expect(char?.subjectKey).toBe('zhongli');
    expect(char?.headline).toMatch(/Zhongli/);
    expect(char?.headline).toMatch(/Hu Tao Vaporize/);
    expect(char?.headline).toMatch(/\+80/);
    expect(char?.provenance).toBe('hu-tao-vape');
  });

  it('never advises a character the player already owns', () => {
    const roster: Record<string, RosterEntry> = { zhongli: {}, layla: {} };
    const out = adviseInvestments([gap()], roster, { zhongli: 90, layla: 40 });
    expect(out.some((a) => a.kind === 'character')).toBe(false);
  });

  it('advises a craftable weapon for a member holding an off-list one', () => {
    const roster: Record<string, RosterEntry> = {
      zhongli: { weaponKey: "beginner's_protector" },
    };
    const out = adviseInvestments([gap()], roster, { zhongli: 90 });
    const weapon = out.find((a) => a.kind === 'weapon');
    expect(weapon?.detail).toMatch(/craftable/i);
    expect(weapon?.provenance).toBe('zhongli');
  });

  it('warns that limited-banner availability rotates', () => {
    const out = adviseInvestments(
      [gap({ candidates: ['neuvillette'], missingRole: 'on-field-dps' })],
      {},
      {},
    );
    const char = out.find((a) => a.subjectKey === 'neuvillette');
    expect(char?.detail).toMatch(
      /Availability rotates — check a banner tracker before pulling\.$/,
    );
  });

  it('gives no weapon advice when no craftable option exists for the equipped type (craftableFor falls through)', () => {
    // craftableFor is not exported; exercise its `return undefined` branch
    // (line 42) by temporarily demoting every curated entry off "craftable"
    // so no entry can ever match the equipped weapon's type, then confirm
    // the weapon-advice loop `continue`s rather than pushing a bogus
    // recommendation. Restored in `finally` since the table is a shared
    // module-level object other tests (and files) read.
    const originalTiers = Object.entries(WEAPON_OBTAINABILITY).map(
      ([key, entry]) => [key, entry.tier] as const,
    );
    try {
      for (const entry of Object.values(WEAPON_OBTAINABILITY))
        entry.tier = 'event';
      const roster: Record<string, RosterEntry> = {
        zhongli: { weaponKey: "beginner's_protector" },
      };
      const out = adviseInvestments([gap()], roster, { zhongli: 90 });
      expect(out.some((a) => a.kind === 'weapon')).toBe(false);
    } finally {
      for (const [key, tier] of originalTiers)
        WEAPON_OBTAINABILITY[key].tier = tier;
    }
  });

  it('caps at ten entries, sorted by upside', () => {
    const gaps = Array.from({ length: 20 }, (_, i) =>
      gap({
        archetypeId: `a${i}`,
        bestPossibleScore: i,
        candidates: ['zhongli'],
      }),
    );
    const out = adviseInvestments(gaps, {}, {});
    expect(out.length).toBeLessThanOrEqual(10);
    const scores = out.map((a) => a.upside);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
});
