import { describe, it, expect } from 'vitest';
import {
  buildDiagnostics,
  emptySlotCause,
  unreachableMinStats,
} from './diagnostics';
import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
  BuildResult,
  Slot,
} from '../game/types';
import { SLOTS } from '../game/types';

const ctx: OptimizeContext = {
  base: { crit_rate: 5, crit_dmg: 50 },
  setBonuses: {},
};

let counter = 0;
function mkArtifact(slot: Slot, cr = 0, cd = 0): Artifact {
  return {
    id: `diag-id${counter++}`,
    setKey: 'A',
    slot,
    rarity: 5,
    level: 20,
    mainStat: 'crit_rate',
    mainStatValue: cr,
    subStats: cd ? [{ key: 'crit_dmg', value: cd }] : [],
  };
}

function makeChosenAndBuild(
  crPerSlot: number,
  cdPerSlot: number,
): { chosen: Artifact[]; b: BuildResult } {
  const chosen = SLOTS.map((s) => mkArtifact(s, crPerSlot, cdPerSlot));
  // totals: crit_rate = base(5) + 5 * crPerSlot, crit_dmg = base(50) + 5 * cdPerSlot
  const crit_rate = 5 + SLOTS.length * crPerSlot;
  const crit_dmg = 50 + SLOTS.length * cdPerSlot;
  const t = { crit_rate, crit_dmg };
  const objectiveVal = crit_rate * 2 + crit_dmg; // crit_value formula
  const artifactIds = {} as Record<Slot, string>;
  for (const a of chosen) artifactIds[a.slot] = a.id;
  const b: BuildResult = {
    artifactIds,
    totals: t,
    objectiveValue: objectiveVal,
    score: objectiveVal,
    diagnostics: {
      bindingConstraints: [],
      marginalBySlot: {},
      explored: 0,
      pruned: 0,
    },
  };
  return { chosen, b };
}

describe('buildDiagnostics', () => {
  it('marginalBySlot has a finite non-negative entry for each slot', () => {
    const { chosen, b } = makeChosenAndBuild(2, 4);
    const req: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    };
    const diag = buildDiagnostics(ctx, req, b, chosen, 10, 2);

    expect(Object.keys(diag.marginalBySlot)).toHaveLength(SLOTS.length);
    for (const slot of SLOTS) {
      const v = diag.marginalBySlot[slot];
      expect(typeof v).toBe('number');
      expect(isFinite(v!)).toBe(true);
      expect(v!).toBeGreaterThanOrEqual(0);
    }
  });

  it('passes through explored and pruned counts unchanged', () => {
    const { chosen, b } = makeChosenAndBuild(1, 2);
    const req: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    };
    const diag = buildDiagnostics(ctx, req, b, chosen, 42, 7);
    expect(diag.explored).toBe(42);
    expect(diag.pruned).toBe(7);
  });

  it('emits a binding constraint string when a minStats floor is cleared by < 5%', () => {
    // Build has crit_dmg = 50 + 5*2 = 60. Set floor at 58 so margin = 2/58 ≈ 3.4% < 5%.
    const { chosen, b } = makeChosenAndBuild(0, 2);
    const need = 58;
    const req: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: { minStats: { crit_dmg: need } },
      objective: 'crit_value',
    };
    const diag = buildDiagnostics(ctx, req, b, chosen, 5, 1);

    expect(diag.bindingConstraints.length).toBeGreaterThan(0);
    const msg = diag.bindingConstraints[0];
    // Must contain the stat label, the ≥ wording, and the "build has" wording
    expect(msg).toContain('≥');
    expect(msg).toContain('build has');
    // Stat label for crit_dmg
    expect(msg).toContain('CRIT DMG');
  });

  it('does NOT emit a binding constraint when the floor is comfortably cleared (> 5%)', () => {
    // Build has crit_dmg = 60. Set floor at 50 → margin = 10/50 = 20% > 5%.
    const { chosen, b } = makeChosenAndBuild(0, 2);
    const req: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: { minStats: { crit_dmg: 50 } },
      objective: 'crit_value',
    };
    const diag = buildDiagnostics(ctx, req, b, chosen, 5, 1);
    expect(diag.bindingConstraints).toHaveLength(0);
  });

  it('bindingConstraints is empty when no minStats are set', () => {
    const { chosen, b } = makeChosenAndBuild(2, 4);
    const req: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    };
    const diag = buildDiagnostics(ctx, req, b, chosen, 0, 0);
    expect(diag.bindingConstraints).toHaveLength(0);
  });
});

describe('binding set requirement formatting', () => {
  it('names the set in words rather than dumping its JSON', () => {
    const { chosen, b } = makeChosenAndBuild(1, 1);
    const req: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: {
        setRequirement: { kind: '4pc', setKey: 'EmblemOfSeveredFate' },
      },
      objective: 'crit_value',
    };
    // `ctx.setNames` is what a real `buildContext` call populates from the
    // adapter (diagnostics.ts itself must stay adapter-free — see the import
    // comment there); supply the one entry this test exercises directly.
    const namedCtx: OptimizeContext = {
      ...ctx,
      setNames: { EmblemOfSeveredFate: 'Emblem of Severed Fate' },
    };
    const msg = buildDiagnostics(namedCtx, req, b, chosen, 1, 0)
      .bindingConstraints[0];
    expect(msg).toBe('Set requirement: 4-piece Emblem of Severed Fate');
    expect(msg).not.toContain('{');
    expect(msg).not.toContain('"');
  });

  it('falls back to a spaced-out key when setNames has no entry (worker context without a match)', () => {
    const { chosen, b } = makeChosenAndBuild(1, 1);
    const req: OptimizeRequest = {
      characterKey: 'c',
      weaponKey: 'w',
      buildLevel: 90,
      constraints: {
        setRequirement: { kind: '4pc', setKey: 'SomeFutureSetKey' },
      },
      objective: 'crit_value',
    };
    const msg = buildDiagnostics(ctx, req, b, chosen, 1, 0)
      .bindingConstraints[0];
    expect(msg).toBe('Set requirement: 4-piece Some Future Set Key');
  });
});

describe('unreachableMinStats', () => {
  const inv = (): Artifact[] =>
    SLOTS.map((s, i) => ({
      id: `reach-${s}`,
      setKey: i < 2 ? 'A' : 'B',
      slot: s,
      rarity: 5,
      level: 20,
      mainStat: 'er_pct' as const,
      mainStatValue: 10,
      subStats: [],
    }));
  const req = (
    constraints: OptimizeRequest['constraints'],
  ): OptimizeRequest => ({
    characterKey: 'c',
    weaponKey: 'w',
    buildLevel: 90,
    constraints,
    objective: 'crit_value',
  });

  it('reports only the floors that are out of reach', () => {
    const c: OptimizeContext = { base: { er_pct: 100 }, setBonuses: {} };
    const out = unreachableMinStats(
      c,
      req({ minStats: { er_pct: 200, crit_rate: 0 } }),
      inv(),
    );
    expect(out).toEqual([{ key: 'er_pct', need: 200, best: 150 }]);
  });

  it('reports nothing when a slot has no legal piece — that is not a floor', () => {
    const c: OptimizeContext = { base: { er_pct: 100 }, setBonuses: {} };
    expect(
      unreachableMinStats(
        c,
        req({
          minStats: { er_pct: 200 },
          mainStatLocks: { circlet: 'crit_rate' },
        }),
        inv(),
      ),
    ).toEqual([]);
  });

  it('sorts the worst relative shortfall first', () => {
    const c: OptimizeContext = {
      base: { er_pct: 100, crit_rate: 100 },
      setBonuses: {},
    };
    const out = unreachableMinStats(
      c,
      // ER short by 25% of its floor; crit_rate short by 50% of its.
      req({ minStats: { er_pct: 200, crit_rate: 200 } }),
      inv(),
    );
    expect(out.map((o) => o.key)).toEqual(['crit_rate', 'er_pct']);
  });

  it('never understates what the search can actually build', () => {
    // A 2pc requirement leaves three free slots. The old hand-rolled bound
    // dropped free slots it could not fill from the required set, so it
    // reported a ceiling *below* builds the search really finds. The search's
    // own bound is admissible by construction: it can only over-state.
    const c: OptimizeContext = {
      base: {},
      setBonuses: { A: { two: { er_pct: 20 } } },
    };
    const inventory = inv();
    const out = unreachableMinStats(
      c,
      req({
        minStats: { er_pct: 68 },
        setRequirement: { kind: '2pc', setKey: 'A' },
      }),
      inventory,
    );
    // 5 pieces x 10 + a 20 2pc = 70 >= 68, so this floor is NOT unreachable.
    expect(out).toEqual([]);
  });
});

describe('emptySlotCause', () => {
  const piece = (slot: Slot, mainStat: 'er_pct' | 'crit_rate'): Artifact => ({
    id: `empty-${slot}-${mainStat}`,
    setKey: 'A',
    slot,
    rarity: 5,
    level: 20,
    mainStat,
    mainStatValue: 10,
    subStats: [],
  });
  const req = (
    constraints: OptimizeRequest['constraints'],
  ): OptimizeRequest => ({
    characterKey: 'c',
    weaponKey: 'w',
    buildLevel: 90,
    constraints,
    objective: 'crit_value',
  });

  it('names the slot and the lock that empties it', () => {
    const inventory = SLOTS.map((s) => piece(s, 'er_pct'));
    expect(
      emptySlotCause(
        req({ mainStatLocks: { circlet: 'crit_rate' } }),
        inventory,
      ),
    ).toMatch(/no circlet with a CRIT Rate main stat/i);
  });

  it('names a slot the inventory simply has nothing for', () => {
    const inventory = SLOTS.filter((s) => s !== 'sands').map((s) =>
      piece(s, 'er_pct'),
    );
    expect(emptySlotCause(req({}), inventory)).toMatch(/no sands at all/i);
  });

  it('is null when every slot has a legal piece', () => {
    const inventory = SLOTS.map((s) => piece(s, 'er_pct'));
    expect(emptySlotCause(req({}), inventory)).toBeNull();
  });
});
