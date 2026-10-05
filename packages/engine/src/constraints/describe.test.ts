import { describe, it, expect } from 'vitest';
import { normalizeGOOD } from '../good/normalize';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import { parseConstraintSpec } from './spec';
import { specToRun, type SpecAccount } from './toRequest';
import { describeRun } from './describe';

const good = normalizeGOOD(loadSampleGOOD())!;
const account: SpecAccount = {
  roster: good.roster,
  artifacts: good.artifacts!.map((e) => e.artifact),
};
function understood(input: object) {
  const p = parseConstraintSpec(input);
  if (!p.ok) throw new Error(JSON.stringify(p.issues));
  const r = specToRun(p.spec, account);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return describeRun(p.spec, r.run);
}

describe('describeRun', () => {
  it('the Phase 3 question: what was asked, and what came from the defaults', () => {
    expect(
      understood({ character: 'furina', minStats: { er_pct: 180 } }).text,
    ).toBe(
      'I understood: build Furina (Favonius Sword, level 90) for average damage (estimated; default), ' +
        'with 4-piece Golden Troupe (default); sands main stat HP% (default); ' +
        'goblet main stat Elemental DMG (default); Energy Recharge at least 180%.',
    );
  });

  it('marks each condition by source', () => {
    const u = understood({
      character: 'neuvillette',
      set: { kind: 'any' },
      mainStats: { sands: 'any' },
      maxStats: { crit_rate: 80 },
      objective: 'crit_value',
    });
    expect(u.goal).toBe(
      'build Neuvillette (Tome of the Eternal Flow, level 90) for crit value',
    );
    expect(u.conditions).toEqual([
      { text: 'any artifact sets', source: 'asked' },
      { text: 'goblet main stat Elemental DMG', source: 'default' },
      { text: 'any sands main stat', source: 'asked' },
      { text: 'Energy Recharge at least 110%', source: 'default' },
      { text: 'CRIT Rate at most 80%', source: 'asked' },
    ]);
  });

  it('says the rest: pieces left alone, exclusions, buffs, enemy, weights', () => {
    const u = understood({
      character: 'neuvillette',
      defaults: 'replace',
      objective: { weights: { hp_pct: 1, crit_rate: 2 } },
      keepEquippedOn: ['furina', 'raiden_shogun'],
      excludeArtifacts: [account.artifacts[0].id],
      teamBuffs: { atk: 1000, elemental_dmg: 20 },
      enemy: { level: 95, res: -20 },
    });
    expect(u.goal).toBe(
      'build Neuvillette (Tome of the Eternal Flow, level 90) for a weighted sum of HP% × 1 + CRIT Rate × 2',
    );
    expect(u.conditions.map((l) => l.text)).toEqual([
      'leaving the pieces Furina, Raiden Shogun wear',
      `never using artifact ${account.artifacts[0].id}`,
      'team buffs ATK +1000, Elemental DMG +20%',
      'against an enemy at level 95, -20% resistance',
    ]);
    expect(u.conditions.every((l) => l.source === 'asked')).toBe(true);
    expect(
      understood({ character: 'neuvillette', keepEquippedOn: 'all' }).text,
    ).toMatch(/only unequipped pieces and Neuvillette's own/);
  });
});
