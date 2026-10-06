import { describe, it, expect } from 'vitest';
import { demoAccount, DEMO_MEMBERS } from './demoAccount';
import { SAMPLE_INVENTORY } from './sampleInventory';
import { genshinAdapter } from '../game/genshin/adapter';
import { SLOTS } from '../game/types';
import { rosterBuildScores } from '../roster/buildScore';
import { recommendAbyss } from '../teams/recommend';

describe('the demo account (TODO 9.4)', () => {
  it('is the sample bag (and the flowers and plumes it lacks), each roster member wearing one piece a slot', () => {
    const { artifacts, roster } = demoAccount();
    // The bag, and a flower and plume for each member past the bag's five.
    expect(artifacts).toHaveLength(
      SAMPLE_INVENTORY.length + 2 * (DEMO_MEMBERS.length - 5),
    );
    expect(new Set(artifacts.map((a) => a.id)).size).toBe(artifacts.length);
    expect(artifacts.every((a) => a.id.startsWith('sample-'))).toBe(true);
    for (const m of DEMO_MEMBERS) {
      const worn = artifacts.filter((a) => a.location === m.key);
      expect(worn.map((a) => a.slot).sort(), m.key).toEqual([...SLOTS].sort());
      expect(roster[m.key].weaponKey).toBe(m.weaponKey);
    }
  });

  it('names real characters holding weapons they can wield', () => {
    for (const m of DEMO_MEMBERS) {
      expect(genshinAdapter.character(m.key), m.key).toBeDefined();
      expect(genshinAdapter.weapon(m.weaponKey), m.weaponKey).toBeDefined();
      expect(genshinAdapter.canEquip(m.key, m.weaponKey), m.key).toBe(true);
    }
  });

  it('gives the Teams view two halves to recommend, and is the same every time', () => {
    const { artifacts, roster } = demoAccount();
    const rec = recommendAbyss(rosterBuildScores(roster, artifacts));
    expect(rec.teams).not.toBeNull();
    expect(demoAccount()).toEqual(demoAccount());
  });
});
