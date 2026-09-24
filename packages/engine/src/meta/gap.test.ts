import { describe, it, expect } from 'vitest';
import { computeGapReport, setRequirementGap } from './gap';
import type { MetaTarget } from './metaTargets';
import type {
  Artifact,
  BuildResult,
  SetRequirement,
  Slot,
  StatKey,
} from '../game/types';

const meta: MetaTarget = {
  characterKey: 'furina',
  setRequirement: { kind: '4pc', setKey: 'GoldenTroupe' },
  mains: { sands: 'hp_pct', goblet: 'elemental_dmg' },
  erTarget: 130,
  objective: 'crit_value',
  source: 'x',
};

let n = 0;
function art(slot: Slot, setKey: string, mainStat: StatKey): Artifact {
  return {
    id: `g${n++}`,
    setKey,
    slot,
    rarity: 5,
    level: 20,
    mainStat,
    mainStatValue: 1,
    subStats: [],
  };
}

function fullInventory(): Artifact[] {
  return [
    art('flower', 'GoldenTroupe', 'hp'),
    art('plume', 'GoldenTroupe', 'atk'),
    art('sands', 'GoldenTroupe', 'hp_pct'),
    art('goblet', 'GoldenTroupe', 'elemental_dmg'),
    art('circlet', 'GoldenTroupe', 'crit_rate'),
  ];
}

function build(
  totals: Partial<Record<StatKey, number>>,
  marginalBySlot: Partial<Record<Slot, number>> = {},
): BuildResult {
  return {
    artifactIds: { flower: '', plume: '', sands: '', goblet: '', circlet: '' },
    totals,
    objectiveValue: 0,
    score: 0,
    diagnostics: {
      bindingConstraints: [],
      marginalBySlot,
      explored: 0,
      pruned: 0,
    },
  };
}

describe('setRequirementGap', () => {
  it('is satisfied when a 2pc requirement is already met', () => {
    const req: SetRequirement = { kind: '2pc', setKey: 'GoldenTroupe' };
    const inv = [
      art('flower', 'GoldenTroupe', 'hp'),
      art('plume', 'GoldenTroupe', 'atk'),
    ];
    expect(setRequirementGap(req, inv)).toBeNull();
  });

  it('reports a 2pc requirement short by one piece', () => {
    const req: SetRequirement = { kind: '2pc', setKey: 'GoldenTroupe' };
    const inv = [art('flower', 'GoldenTroupe', 'hp')];
    expect(setRequirementGap(req, inv)).toEqual({
      setKey: 'GoldenTroupe',
      have: 1,
      need: 2,
    });
  });

  it('for a 2+2 requirement, finds the gap on the second setKey when the first is already met', () => {
    const req: SetRequirement = {
      kind: '2+2',
      setKeys: ['GoldenTroupe', 'EmblemOfSeveredFate'],
    };
    const inv = [
      art('flower', 'GoldenTroupe', 'hp'),
      art('plume', 'GoldenTroupe', 'atk'),
      art('sands', 'EmblemOfSeveredFate', 'hp_pct'),
    ];
    expect(setRequirementGap(req, inv)).toEqual({
      setKey: 'EmblemOfSeveredFate',
      have: 1,
      need: 2,
    });
  });

  it('is satisfied when both 2+2 setKeys are met', () => {
    const req: SetRequirement = {
      kind: '2+2',
      setKeys: ['GoldenTroupe', 'EmblemOfSeveredFate'],
    };
    const inv = [
      art('flower', 'GoldenTroupe', 'hp'),
      art('plume', 'GoldenTroupe', 'atk'),
      art('sands', 'EmblemOfSeveredFate', 'hp_pct'),
      art('goblet', 'EmblemOfSeveredFate', 'elemental_dmg'),
    ];
    expect(setRequirementGap(req, inv)).toBeNull();
  });
});

describe('computeGapReport', () => {
  it('flags a set feasibility gap and makes farming it the action', () => {
    const inv = [
      art('flower', 'GoldenTroupe', 'hp'),
      art('sands', 'EmblemOfSeveredFate', 'hp_pct'),
    ];
    const r = computeGapReport(meta, inv, null);
    expect(r.feasibility.some((f) => /Golden Troupe/.test(f))).toBe(true);
    expect(r.action).toMatch(/Farm Golden Troupe/);
  });

  it('flags a missing meta main stat', () => {
    const inv = [
      art('flower', 'GoldenTroupe', 'hp'),
      art('plume', 'GoldenTroupe', 'atk'),
      art('sands', 'GoldenTroupe', 'hp_pct'),
      art('goblet', 'GoldenTroupe', 'atk_pct'),
      art('circlet', 'GoldenTroupe', 'crit_rate'),
    ];
    const r = computeGapReport(meta, inv, null);
    expect(r.feasibility.some((f) => /Elemental DMG Goblet/i.test(f))).toBe(
      true,
    );
  });

  it('reports an ER shortfall vs the target', () => {
    const r = computeGapReport(meta, fullInventory(), build({ er_pct: 118 }));
    expect(r.shortfalls.some((s) => /ER 118% vs 130%/.test(s))).toBe(true);
  });

  it('names the weakest slot as the action when nothing is missing', () => {
    const r = computeGapReport(
      meta,
      fullInventory(),
      build(
        { er_pct: 140 },
        { flower: 50, plume: 50, sands: 50, goblet: 5, circlet: 50 },
      ),
    );
    expect(r.feasibility).toHaveLength(0);
    expect(r.action).toMatch(/Goblet contributes least/);
  });
});
