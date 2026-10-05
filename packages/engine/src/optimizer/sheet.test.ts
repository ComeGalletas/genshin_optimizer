import { describe, it, expect } from 'vitest';
import type { Artifact, OptimizeRequest } from '../game/types';
import { buildContext, passiveNotes, requestErFloor } from './context';
import { sheetTotals } from './sheet';
import { totals } from './score';

const piece = (slot: Artifact['slot'], er: number): Artifact => ({
  id: slot,
  setKey: 'NoSuchSet',
  slot,
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 0,
  subStats: [{ key: 'er_pct', value: er }],
});
const build = [piece('flower', 20), piece('plume', 13)];

const raiden: OptimizeRequest = {
  characterKey: 'raiden_shogun',
  weaponKey: 'engulfing_lightning',
  refinement: 1,
  buildLevel: 90,
  constraints: {},
  objective: 'crit_value',
};

describe('buildContext with passives (ADR-0042)', () => {
  it('adds the weapon’s passive at the request’s refinement to the base', () => {
    const at = (refinement?: number) =>
      buildContext({
        ...raiden,
        weaponKey: 'aquila_favonia',
        characterKey: 'bennett',
        refinement,
      }).base.atk_pct ?? 0;
    const none =
      buildContext({
        ...raiden,
        weaponKey: 'favonius_sword',
        characterKey: 'bennett',
      }).base.atk_pct ?? 0;
    expect(at() - none).toBeCloseTo(20, 9); // R1 by default
    expect(at(5) - at(1)).toBeCloseTo(20, 9);
  });

  it('resolves ER-derived passives at the ER floor: the request’s, then the profile’s', () => {
    expect(requestErFloor(raiden)).toBe(200); // Raiden's damage profile
    expect(
      requestErFloor({ ...raiden, constraints: { minStats: { er_pct: 250 } } }),
    ).toBe(250);
    expect(requestErFloor({ ...raiden, characterKey: 'bennett' })).toBe(100);
    // 0.4% Electro DMG per 1% ER above 100%, at 250%: +60.
    const at250 = buildContext({
      ...raiden,
      constraints: { minStats: { er_pct: 250 } },
    });
    const at150 = buildContext({
      ...raiden,
      constraints: { minStats: { er_pct: 150 } },
    });
    expect(
      (at250.base.elemental_dmg ?? 0) - (at150.base.elemental_dmg ?? 0),
    ).toBeCloseTo(40, 9);
    // Engulfing R1: 28% of the ER above 100%, max 80%.
    expect((at250.base.atk_pct ?? 0) - (at150.base.atk_pct ?? 0)).toBeCloseTo(
      28,
      9,
    );
  });
});

describe('sheetTotals', () => {
  it('resolves ER-derived passives at the build’s own ER, not a floor', () => {
    const { totals: t } = sheetTotals(raiden, build);
    // Raiden 32% ER ascension + Engulfing 55.1% + 100% base + 33 from pieces.
    const er = t.er_pct!;
    expect(er).toBeCloseTo(220.1, 1);
    const plain = buildContext({
      ...raiden,
      weaponKey: 'favonius_lance',
      constraints: { minStats: { er_pct: 100 } },
    });
    const noPassiveDmg = totals(plain, build).elemental_dmg ?? 0;
    expect((t.elemental_dmg ?? 0) - noPassiveDmg).toBeCloseTo(
      0.4 * (er - 100),
      9,
    );
    // The floor the search would use (200) gives less.
    expect(totals(buildContext(raiden), build).elemental_dmg ?? 0).toBeLessThan(
      t.elemental_dmg ?? 0,
    );
  });

  it('is plain `totals` when nothing depends on ER', () => {
    const req = {
      ...raiden,
      weaponKey: 'aquila_favonia',
      characterKey: 'bennett',
    };
    expect(sheetTotals(req, build).totals).toEqual(
      totals(buildContext(req), build),
    );
  });

  it('passiveNotes names each passive with the refinement and the ER used', () => {
    expect(passiveNotes(raiden, 220)).toEqual([
      expect.stringMatching(
        /^Engulfing Lightning R1 passive: \+33\.6% ATK% .* counted at 220% Energy Recharge/,
      ),
      expect.stringMatching(
        /^Raiden Shogun’s passive: \+48% Elemental DMG \(40% of the ER above 100%\)/,
      ),
    ]);
  });
});
