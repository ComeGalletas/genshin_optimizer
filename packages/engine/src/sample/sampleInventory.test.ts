import { describe, it, expect } from 'vitest';
import { SAMPLE_INVENTORY } from './sampleInventory';
import { DEMO_MEMBERS } from './demoAccount';
import { SLOTS } from '../game/types';
import { buildContext } from '../optimizer/context';
import { searchBuilds } from '../optimizer/search';
import type { OptimizeRequest } from '../game/types';

describe('SAMPLE_INVENTORY', () => {
  it('is non-empty, sample-prefixed, with a piece in every slot', () => {
    expect(SAMPLE_INVENTORY.length).toBeGreaterThan(40);
    expect(SAMPLE_INVENTORY.every((a) => a.id.startsWith('sample-'))).toBe(
      true,
    );
    for (const slot of SLOTS) {
      expect(SAMPLE_INVENTORY.some((a) => a.slot === slot)).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = SAMPLE_INVENTORY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The bag used to hold one fixed value per substat key and the same four
  // substats on every piece, which made every piece of a given main stat
  // interchangeable and every preset return a wall of exactly-tied builds.
  it('varies substat values, substat counts and levels', () => {
    const critValues = new Set(
      SAMPLE_INVENTORY.flatMap((a) =>
        a.subStats.filter((s) => s.key === 'crit_dmg').map((s) => s.value),
      ),
    );
    expect(critValues.size).toBeGreaterThan(10);
    expect(new Set(SAMPLE_INVENTORY.map((a) => a.subStats.length))).toEqual(
      new Set([3, 4]),
    );
    expect(new Set(SAMPLE_INVENTORY.map((a) => a.level))).toEqual(
      new Set([16, 20]),
    );
  });

  it('yields distinct top builds for every demo character (TODO 9.4)', () => {
    for (const m of DEMO_MEMBERS) {
      const p = { label: m.key };
      const req: OptimizeRequest = {
        characterKey: m.key,
        weaponKey: m.weaponKey,
        buildLevel: 90,
        constraints: {},
        objective: 'crit_value',
        topK: 10,
      };
      const ctx = buildContext(req);
      const res = searchBuilds(req, SAMPLE_INVENTORY, ctx);
      expect(res.status, `${p.label} should be feasible`).toBe('ok');
      if (res.status !== 'ok') continue; // narrows for TS; assert above already failed the test otherwise
      expect(res.builds.length, `${p.label} builds`).toBeGreaterThan(0);

      // The recruiter demo shows these cards side by side. Identical scores on
      // the podium read as a rendering bug, not as "these are equally good" —
      // and with a zero-variance bag that is exactly what every preset returned.
      const podium = res.builds.slice(0, 3).map((b) => b.objectiveValue);
      expect(podium.length, `${p.label} top-3`).toBe(3);
      expect(new Set(podium).size, `${p.label} distinct top-3`).toBe(3);
      // Strictly descending, so the delta chips on ranks 2+ are never "+".
      for (let i = 1; i < podium.length; i++)
        expect(podium[i], `${p.label} rank ${i + 1}`).toBeLessThan(
          podium[i - 1],
        );
    }
  });
});
