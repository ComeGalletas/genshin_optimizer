import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Artifact, StatKey, SubStat } from '../game/types';
import {
  meanRoll5,
  SUBSTAT_TIERS_5,
  type SubStatKey,
} from '../game/genshin/substatRolls';
import { normalizeGOOD } from '../good/normalize';
import {
  projectTo20,
  rankProspects,
  substatScore,
  type Projection,
} from './prospects';

const sub = (key: StatKey, value: number): SubStat => ({ key, value });
let id = 0;
const art = (over: Partial<Artifact> = {}): Artifact => ({
  id: String(id++),
  setKey: 'EmblemOfSeveredFate',
  slot: 'sands',
  rarity: 5,
  level: 0,
  mainStat: 'atk_pct',
  mainStatValue: 7,
  subStats: [
    sub('crit_rate', 3.9),
    sub('crit_dmg', 7.8),
    sub('hp', 299),
    sub('def', 23),
  ],
  ...over,
});
const projected = (p: ReturnType<typeof projectTo20>) => p as Projection;
const inputs = (...arts: Artifact[]) => arts.map((artifact) => ({ artifact }));

describe('5★ substat rolls', () => {
  // The values the game shows for each tier, as read from every first roll
  // in the owner's Irminsul export (6,600 of them, 2026-09-27).
  const SHOWN: Record<SubStatKey, number[]> = {
    hp: [209, 239, 269, 299],
    atk: [14, 16, 18, 19],
    def: [16, 19, 21, 23],
    hp_pct: [4.1, 4.7, 5.3, 5.8],
    atk_pct: [4.1, 4.7, 5.3, 5.8],
    def_pct: [5.1, 5.8, 6.6, 7.3],
    em: [16, 19, 21, 23],
    er_pct: [4.5, 5.2, 5.8, 6.5],
    crit_rate: [2.7, 3.1, 3.5, 3.9],
    crit_dmg: [5.4, 6.2, 7.0, 7.8],
  };
  const flat = ['hp', 'atk', 'def', 'em'];

  it.each(Object.keys(SHOWN) as SubStatKey[])(
    '%s tiers round to what the game shows',
    (k) => {
      const round = (x: number) =>
        flat.includes(k) ? Math.round(x) : Math.round(x * 10) / 10;
      expect(SUBSTAT_TIERS_5[k].map(round)).toEqual(SHOWN[k]);
    },
  );

  it('averages 85% of the maximum roll', () => {
    for (const k of Object.keys(SUBSTAT_TIERS_5) as SubStatKey[])
      expect(meanRoll5(k) / SUBSTAT_TIERS_5[k][3]).toBeCloseTo(0.85, 2);
  });
});

describe('projectTo20', () => {
  it('spreads 5 random rolls over the 4 lines of a 4-line +0 piece', () => {
    const p = projected(projectTo20({ artifact: art() }));
    expect(p).toMatchObject({ upgradesLeft: 5, randomRolls: 5 });
    expect(p.subStats[0].value).toBeCloseTo(3.9 + (5 / 4) * 3.305, 6);
  });

  it('adds the unactivated line and one roll fewer to a 3-line +0 piece', () => {
    const a = art({ subStats: [sub('crit_rate', 3.9), sub('hp', 299)] });
    a.subStats.push(sub('atk', 19));
    const p = projected(
      projectTo20({ artifact: a, unactivated: sub('crit_dmg', 7.8) }),
    );
    expect(p).toMatchObject({ upgradesLeft: 5, randomRolls: 4 });
    expect(p.subStats.map((s) => s.key)).toEqual([
      'crit_rate',
      'hp',
      'atk',
      'crit_dmg',
    ]);
    expect(p.subStats[3].value).toBeCloseTo(7.8 + 6.605, 6);
  });

  it('counts only the upgrades left on a part-levelled piece', () => {
    expect(projectTo20({ artifact: art({ level: 8 }) })).toMatchObject({
      upgradesLeft: 3,
      randomRolls: 3,
    });
    expect(projectTo20({ artifact: art({ level: 19 }) })).toMatchObject({
      upgradesLeft: 1,
    });
  });

  it('leaves a +20 piece as it is', () => {
    const a = art({ level: 20 });
    expect(projectTo20({ artifact: a })).toEqual({
      subStats: a.subStats,
      upgradesLeft: 0,
      randomRolls: 0,
    });
  });

  it('never guesses a line it does not know', () => {
    const three = art({ subStats: art().subStats.slice(0, 3) });
    expect(projectTo20({ artifact: three })).toEqual({
      notProjected: 'fourth-line-unknown',
    });
    expect(projectTo20({ artifact: { ...three, level: 4 } })).toEqual({
      notProjected: 'inconsistent-lines',
    });
    expect(
      projectTo20({ artifact: art(), unactivated: sub('atk', 19) }),
    ).toEqual({ notProjected: 'inconsistent-lines' });
    expect(projectTo20({ artifact: art({ rarity: 4 }) })).toEqual({
      notProjected: 'not-5-star',
    });
  });
});

describe('rankProspects', () => {
  const cv = (a: Artifact) => substatScore(a.subStats, 'crit_value');

  it('ranks by the score at +20, within slot and main stat', () => {
    const good20 = art({
      level: 20,
      subStats: [
        sub('crit_rate', 10.5),
        sub('crit_dmg', 21),
        sub('hp', 299),
        sub('def', 23),
      ],
    });
    const plain0 = art(); // expected CV at +20: about 15.6 + 16.5
    const other = art({ mainStat: 'hp_pct' });
    const { rows } = rankProspects(inputs(plain0, good20, other), 'crit_value');
    expect(rows.map((r) => [r.group, r.rank, r.index, r.status])).toEqual([
      ['sands/atk_pct', 1, 1, 'upgraded'],
      ['sands/atk_pct', 2, 0, 'prospect'],
      ['sands/hp_pct', 1, 2, 'prospect'],
    ]);
    expect(rows[1].current).toBeCloseTo(cv(plain0), 6);
    expect(rows[1].atPlus20).toBeCloseTo(
      15.6 + (5 / 4) * (2 * meanRoll5('crit_rate') + meanRoll5('crit_dmg')),
      6,
    );
  });

  it('ranks a proven piece above a prospect of equal shown score', () => {
    const prospect = art();
    const expected = projected(projectTo20({ artifact: prospect })).subStats;
    // The same expected lines, rounded as the app shows them, on a +20 piece.
    const proven = art({
      level: 20,
      subStats: expected.map((s) => sub(s.key, Math.round(s.value * 10) / 10)),
    });
    const { rows } = rankProspects(inputs(prospect, proven), 'crit_value');
    expect(rows.map((r) => r.status)).toEqual(['upgraded', 'prospect']);
  });

  it('keeps elemental goblets apart and lists what it could not project', () => {
    const pyro = art({
      slot: 'goblet',
      mainStat: 'elemental_dmg',
      element: 'pyro',
    });
    const hydro = { ...pyro, id: 'h', element: 'hydro' as const };
    const four = art({ rarity: 4 });
    const r = rankProspects(inputs(pyro, hydro, four), 'crit_value');
    expect(r.rows.map((x) => x.group)).toEqual([
      'goblet/elemental_dmg/pyro',
      'goblet/elemental_dmg/hydro',
    ]);
    expect(r.notProjected).toEqual([{ index: 2, reason: 'not-5-star' }]);
  });

  it('carries the unactivated line through normalizeGOOD', () => {
    const n = normalizeGOOD({
      format: 'GOOD',
      artifacts: [
        {
          setKey: 'EmblemOfSeveredFate',
          slotKey: 'sands',
          rarity: 5,
          level: 0,
          mainStatKey: 'atk_',
          substats: [
            { key: 'critRate_', value: 3.9 },
            { key: 'hp', value: 299 },
            { key: 'def', value: 23 },
          ],
          unactivatedSubstats: [{ key: 'critDMG_', value: 7.8 }],
        },
      ],
    })!;
    const [row] = rankProspects(n.artifacts!, 'crit_value').rows;
    expect(row.current).toBeCloseTo(7.8, 6);
    expect(row.projection.subStats).toHaveLength(4);
  });
});

// Back-test on real rolls. The fixture holds every +20 piece of the owner's
// Irminsul export (substat lines only: first roll and value at +20). Each is
// rewound to its first rolls and projected; the projection must match what
// the pieces actually rolled, on average.
describe('projection back-test on 309 real +20 pieces', () => {
  const { pieces } = JSON.parse(
    readFileSync(
      new URL('./__fixtures__/plus20-rolls.json', import.meta.url),
      'utf8',
    ),
  ) as { pieces: [3 | 4, [SubStatKey, number, number][]][] };

  const rewound = pieces.map(([startLines, lines]) => {
    const first = lines.map(([k, v]) => sub(k, v));
    const input =
      startLines === 4
        ? { artifact: art({ subStats: first }) }
        : {
            artifact: art({ subStats: first.slice(0, 3) }),
            unactivated: first[3],
          };
    return {
      projected: projected(projectTo20(input)).subStats,
      actual: lines.map(([k, , v]) => sub(k, v)),
    };
  });

  it('covers every piece', () => {
    expect(pieces).toHaveLength(309);
    expect(rewound.every((r) => r.projected.length === 4)).toBe(true);
  });

  it('projects the total roll mass within 1%', () => {
    const units = (subs: SubStat[]) =>
      subs.reduce(
        (s, x) => s + x.value / SUBSTAT_TIERS_5[x.key as SubStatKey][3],
        0,
      );
    const p = rewound.reduce((s, r) => s + units(r.projected), 0);
    const a = rewound.reduce((s, r) => s + units(r.actual), 0);
    expect(p / a).toBeGreaterThan(0.99);
    expect(p / a).toBeLessThan(1.01);
  });

  // These pieces are survivors: a piece whose early rolls went to DEF or flat
  // stats tends to be abandoned before +20. Their crit lines got 422 rolls
  // against 395 expected, so the projection sits ~3.5% under their crit
  // value. A fresh +0 piece has no such history; the bound pins the size of
  // the effect, and its direction.
  it('projects crit value within 5% (under, by survivorship)', () => {
    const total = (key: 'projected' | 'actual') =>
      rewound.reduce((s, r) => s + substatScore(r[key], 'crit_value'), 0);
    const ratio = total('projected') / total('actual');
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1);
  });
});
