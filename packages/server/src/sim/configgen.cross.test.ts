/**
 * TODO 5.5's cross-check: for each character of the committed sample
 * account, a config from `gcsimConfig` runs through the pinned gcsim, and
 * the final stats gcsim reports (`character_details[].snapshot`) are
 * compared with our own totals for the same build. Runs only where
 * `npm run sim:check` installed the binary (not in CI).
 *
 * Our side has 2-piece set bonuses and no 4-piece effects (conditional, so
 * not in gcsim's opening snapshot). Static weapon and character passives
 * aren't modelled by the stat engine (a separate task), so a character with
 * one differs by exactly that passive, which is checked too.
 */

import { existsSync } from 'node:fs';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import { loadSampleGOOD } from '@genshin-build-lab/engine/test-fixtures/sampleAccount';
import {
  gcsimConfig,
  gcsimName,
} from '@genshin-build-lab/engine/sim/configgen';
import { buildContext } from '@genshin-build-lab/engine/optimizer/context';
import { totals } from '@genshin-build-lab/engine/optimizer/score';
import { effectiveStat } from '@genshin-build-lab/engine/damage/formula';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type { StatVec } from '@genshin-build-lab/engine/game/types';
import { gcsimPath, loadGcsimTool, runGcsim } from './gcsim';

const installed = (() => {
  try {
    const p = gcsimPath(loadGcsimTool());
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
})();

/** gcsim's stat order (`pkg/core/attributes/stats.go` at the pin). */
const AT = { def: 2, hp: 3, atk: 5, er: 7, em: 8, cr: 9, cd: 10 } as const;
const ELEMENT_AT: Record<string, number> = {
  pyro: 12,
  hydro: 13,
  cryo: 14,
  electro: 15,
  anemo: 16,
  geo: 17,
  dendro: 18,
  physical: 19,
};

const good = normalizeGOOD(loadSampleGOOD())!;
const artifacts = good.artifacts!.map((e) => e.artifact);

type Sheet = Record<
  'hp' | 'atk' | 'def' | 'er' | 'em' | 'cr' | 'cd' | 'dmg',
  number
>;

/** Ours and gcsim's, in gcsim's units, for one character's own gear. */
async function compare(
  key: string,
): Promise<{ ours: Sheet; theirs: Sheet; base: StatVec }> {
  const entry = good.roster[key];
  const weapon = good.weapons.find((w) => w.location === key)!;
  const pieces = artifacts.filter((a) => a.location === key);
  const config = gcsimConfig({
    characters: [
      {
        key,
        level: 90,
        maxLevel: 90,
        constellation: entry.constellation ?? 0,
        talents: entry.talents ?? { auto: 1, skill: 1, burst: 1 },
        weapon: {
          key: weapon.key,
          level: 90,
          maxLevel: 90,
          refinement: weapon.refinement ?? 1,
        },
        artifacts: pieces,
      },
    ],
    active: key,
    rotation: `while 1 { ${gcsimName(key)} attack; }`,
    iterations: 1,
    duration: 5,
  });
  const snapshot = (
    (await runGcsim(installed!, config)) as {
      character_details: { snapshot: number[] }[];
    }
  ).character_details[0].snapshot;
  const ctx = buildContext({
    characterKey: key,
    weaponKey: weapon.key,
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
  });
  for (const b of Object.values(ctx.setBonuses)) delete b.four;
  const t: StatVec = totals(ctx, pieces);
  const element = genshinAdapter.character(key)!.element;
  const ours: Sheet = {
    hp: effectiveStat(ctx.base, t, 'hp'),
    atk: effectiveStat(ctx.base, t, 'atk'),
    def: effectiveStat(ctx.base, t, 'def'),
    er: (t.er_pct ?? 0) / 100,
    em: t.em ?? 0,
    cr: (t.crit_rate ?? 0) / 100,
    cd: (t.crit_dmg ?? 0) / 100,
    dmg:
      ((element === 'physical' ? t.physical_dmg : t.elemental_dmg) ?? 0) / 100,
  };
  const theirs: Sheet = {
    hp: snapshot[AT.hp],
    atk: snapshot[AT.atk],
    def: snapshot[AT.def],
    er: snapshot[AT.er],
    em: snapshot[AT.em],
    cr: snapshot[AT.cr],
    cd: snapshot[AT.cd],
    dmg: snapshot[ELEMENT_AT[element]],
  };
  return { ours, theirs, base: ctx.base };
}

/** Flat stats to 0.5 (rounding in the data), fractions to 0.0005. */
function differing(ours: Sheet, theirs: Sheet): string[] {
  return (Object.keys(ours) as (keyof Sheet)[]).filter(
    (k) =>
      Math.abs(ours[k] - theirs[k]) >
      (['hp', 'atk', 'def', 'em'].includes(k) ? 0.5 : 0.0005),
  );
}

describe.skipIf(!installed)(
  'gcsimConfig against gcsim’s own stats (TODO 5.5)',
  () => {
    it.each(['furina', 'kaedehara_kazuha', 'charlotte', 'xiangling'])(
      '%s: our totals equal gcsim’s (no static weapon or character passive)',
      async (key) => {
        const { ours, theirs } = await compare(key);
        expect(differing(ours, theirs)).toEqual([]);
      },
      60_000,
    );

    it('a static passive is the only difference, by exactly its value', async () => {
      // Weapons. Tome of the Eternal Flow R1: +16% HP.
      const neuvillette = await compare('neuvillette');
      expect(differing(neuvillette.ours, neuvillette.theirs)).toEqual(['hp']);
      expect(neuvillette.theirs.hp - neuvillette.ours.hp).toBeCloseTo(
        (neuvillette.base.hp ?? 0) * 0.16,
        0,
      );
      // Aquila Favonia R1: +20% ATK.
      const bennett = await compare('bennett');
      expect(differing(bennett.ours, bennett.theirs)).toEqual(['atk']);
      expect(bennett.theirs.atk - bennett.ours.atk).toBeCloseTo(
        (bennett.base.atk ?? 0) * 0.2,
        0,
      );
      // Characters. Xingqiu's ascension passive: +20% Hydro DMG.
      const xingqiu = await compare('xingqiu');
      expect(differing(xingqiu.ours, xingqiu.theirs)).toEqual(['dmg']);
      expect(xingqiu.theirs.dmg - xingqiu.ours.dmg).toBeCloseTo(0.2, 6);
      // Raiden's: 0.4% Electro DMG for each 1% ER above 100%.
      const raiden = await compare('raiden_shogun');
      expect(differing(raiden.ours, raiden.theirs)).toEqual(['dmg']);
      expect(raiden.theirs.dmg - raiden.ours.dmg).toBeCloseTo(
        0.4 * (raiden.ours.er - 1),
        6,
      );
    }, 120_000);
  },
);
