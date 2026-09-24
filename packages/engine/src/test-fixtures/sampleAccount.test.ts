import { describe, it, expect } from 'vitest';
import { loadSampleGOOD } from './sampleAccount';
import { parseGOOD, parseGOODRoster } from '../import/good';
import { SLOTS, type Artifact } from '../game/types';

// End-to-end importer check against a committed synthetic GOOD export, so it
// runs in every clone and in CI rather than only on one machine.
describe('sample account fixture', () => {
  it('imports the full artifact inventory', () => {
    const arts = parseGOOD(loadSampleGOOD());
    expect(Array.isArray(arts)).toBe(true);
    const list = arts as Artifact[];
    // Every entry in the fixture is well-formed, so none may be skipped.
    expect(list).toHaveLength(20);
    // All five slots are represented, four pieces each.
    for (const slot of SLOTS) {
      expect(list.filter((a) => a.slot === slot)).toHaveLength(4);
    }
    expect(list.every((a) => a.rarity === 5)).toBe(true);
    expect(list.every((a) => a.level >= 16 && a.level <= 20)).toBe(true);
    // Sub-stats survive the stat-key mapping (GOOD `critDMG_` -> `crit_dmg`).
    expect(list.every((a) => a.subStats.length === 4)).toBe(true);
    expect(list.some((a) => a.subStats.some((s) => s.key === 'crit_dmg'))).toBe(
      true,
    );
    // Main-stat values are resolved from the frozen rarity/level tables.
    expect(list.every((a) => a.mainStatValue > 0)).toBe(true);
    // A goblet's element is captured, not discarded (ADR-0014).
    const hydroGoblet = list.find(
      (a) => a.slot === 'goblet' && a.location === 'neuvillette',
    );
    expect(hydroGoblet?.mainStat).toBe('elemental_dmg');
    expect(hydroGoblet?.element).toBe('hydro');
  });

  it('imports the roster, resolving GOOD keys to dataset keys', () => {
    const roster = parseGOODRoster(loadSampleGOOD());
    expect(Object.keys(roster)).toHaveLength(8);
    expect(roster['neuvillette']).toBeDefined();
    // Multi-word GOOD keys normalize to the dataset's underscored keys.
    expect(roster['kaedehara_kazuha']).toBeDefined();
    expect(roster['raiden_shogun']).toBeDefined();
    // Ascension, not level, drives the build level the optimiser evaluates at.
    expect(roster['neuvillette'].buildLevel).toBe(90);
    expect(roster['charlotte'].buildLevel).toBe(80);
    expect(roster['charlotte'].level).toBe(80);
  });

  it('carries the v2 fields the roster view needs', () => {
    const roster = parseGOODRoster(loadSampleGOOD());
    // Talents are all-or-nothing per character; the fixture gives all three.
    expect(Object.values(roster).filter((e) => e.talents)).toHaveLength(8);
    expect(roster['raiden_shogun'].talents).toEqual({
      auto: 9,
      skill: 9,
      burst: 10,
    });
    expect(roster['xiangling'].constellation).toBe(6);
    // Equipped weapons come from weapons[].location, not characters[].
    expect(roster['raiden_shogun'].weaponKey).toBe('the_catch');
    expect(roster['xiangling'].weaponKey).toBe("dragon's_bane");
    expect(roster['xingqiu'].weaponLevel).toBe(90);

    const arts = parseGOOD(loadSampleGOOD()) as Artifact[];
    // 17 of the 20 pieces are equipped; the other 3 sit loose in the inventory.
    expect(arts.filter((a) => a.location)).toHaveLength(17);
    expect(arts.filter((a) => a.location === 'neuvillette')).toHaveLength(5);
  });
});
