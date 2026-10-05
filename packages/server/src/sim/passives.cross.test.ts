/**
 * The curated passives (ADR-0042) against gcsim: for every weapon in the
 * table at R1 and R5, and every character passive, a one-character config
 * with no artifacts runs through the pinned gcsim for one iteration, and
 * the final stats it reports (`character_details[0].snapshot`) must equal
 * our totals, ER-derived passives resolved at the build's own ER. Runs only
 * where `npm run sim:check` installed the binary (not in CI).
 *
 * The holders were chosen because their own totals match gcsim's with a
 * Favonius weapon (whose passive grants no stats), so any difference is the
 * passive's.
 */

import { existsSync } from 'node:fs';
import {
  gcsimConfig,
  gcsimName,
} from '@genshin-build-lab/engine/sim/configgen';
import { sheetTotals } from '@genshin-build-lab/engine/optimizer/sheet';
import { effectiveStat } from '@genshin-build-lab/engine/damage/formula';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  CHARACTER_PASSIVES,
  WEAPON_PASSIVES,
} from '@genshin-build-lab/engine/game/genshin/passives';
import type {
  BuildLevel,
  WeaponType,
} from '@genshin-build-lab/engine/game/types';
import { GcsimError, gcsimPath, loadGcsimTool, runGcsim } from './gcsim';

const installed = (() => {
  try {
    const p = gcsimPath(loadGcsimTool());
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
})();

/** gcsim's stat order (`pkg/core/attributes/stats.go` at the pin). */
const AT = {
  def: 2,
  hp: 3,
  atk: 5,
  er: 7,
  em: 8,
  cr: 9,
  cd: 10,
  heal: 11,
  phys: 19,
  dmg: 21,
} as const;
const ELEMENT_AT: Record<string, number> = {
  pyro: 12,
  hydro: 13,
  cryo: 14,
  electro: 15,
  anemo: 16,
  geo: 17,
  dendro: 18,
};

/** A holder per weapon class with no stat passive of their own. */
const HOLDER: Record<WeaponType, string> = {
  sword: 'furina',
  claymore: 'noelle',
  polearm: 'xiangling',
  bow: 'fischl',
  catalyst: 'charlotte',
};

/** Weapons gcsim reads differently, each with the reason. */
const GCSIM_GAPS: Record<string, string> = {
  thundering_pulse:
    'The static +20% (R1) ATK is in the game’s passive (genshin-db) but not in gcsim’s opening snapshot.',
  "ultimate_overlord's_mega_magic_sword":
    'gcsim counts the Melusine bonus at its maximum; we count only the static part.',
};

/** Passives with a part derived from a stat other than ER, which we leave
 *  out (ADR-0042): flat ATK as a % of Max HP, R1..R5. gcsim counts it, so
 *  the difference must be exactly that. */
const ATK_FROM_HP: Record<string, readonly number[]> = {
  primordial_jade_cutter: [1.2, 1.5, 1.8, 2.1, 2.4],
  staff_of_homa: [0.8, 1, 1.2, 1.4, 1.6],
};

type Sheet = Record<
  'hp' | 'atk' | 'def' | 'er' | 'em' | 'cr' | 'cd' | 'heal' | 'dmg' | 'phys',
  number
>;

async function compare(
  key: string,
  weaponKey: string,
  refinement: number,
  level: BuildLevel = 90,
): Promise<{ ours: Sheet; theirs: Sheet }> {
  const config = gcsimConfig({
    characters: [
      {
        key,
        level,
        maxLevel: level,
        constellation: 0,
        talents: { auto: 1, skill: 1, burst: 1 },
        weapon: { key: weaponKey, level, maxLevel: level, refinement },
        artifacts: [],
      },
    ],
    active: key,
    rotation: `while 1 { ${gcsimName(key)} attack; }`,
    iterations: 1,
    duration: 5,
  });
  const s = (
    (await runGcsim(installed!, config)) as {
      character_details: { snapshot: number[] }[];
    }
  ).character_details[0].snapshot;
  const { ctx, totals: t } = sheetTotals(
    {
      characterKey: key,
      weaponKey,
      buildLevel: level,
      refinement,
      constraints: {},
      objective: 'crit_value',
    },
    [],
  );
  const element = genshinAdapter.character(key)!.element;
  const ours: Sheet = {
    hp: effectiveStat(ctx.base, t, 'hp'),
    atk: effectiveStat(ctx.base, t, 'atk'),
    def: effectiveStat(ctx.base, t, 'def'),
    er: (t.er_pct ?? 0) / 100,
    em: t.em ?? 0,
    cr: (t.crit_rate ?? 0) / 100,
    cd: (t.crit_dmg ?? 0) / 100,
    heal: (t.healing ?? 0) / 100,
    dmg: (t.elemental_dmg ?? 0) / 100,
    phys: (t.physical_dmg ?? 0) / 100,
  };
  // An "all DMG" bonus is gcsim's own stat; ours carries it in both.
  const theirs: Sheet = {
    hp: s[AT.hp],
    atk: s[AT.atk],
    def: s[AT.def],
    er: s[AT.er],
    em: s[AT.em],
    cr: s[AT.cr],
    cd: s[AT.cd],
    heal: s[AT.heal],
    dmg: s[ELEMENT_AT[element]] + s[AT.dmg],
    phys: s[AT.phys] + s[AT.dmg],
  };
  return { ours, theirs };
}

/** Flat stats to 0.01% or 0.5, whichever is more (the data's rounding:
 *  ~0.55 HP on a 28k sheet), fractions to 0.0005. */
function differing(ours: Sheet, theirs: Sheet): string[] {
  return (Object.keys(ours) as (keyof Sheet)[]).filter(
    (k) =>
      Math.abs(ours[k] - theirs[k]) >
      (['hp', 'atk', 'def', 'em'].includes(k)
        ? Math.max(0.5, Math.abs(theirs[k]) * 1e-4)
        : 0.0005),
  );
}

const weapons = Object.keys(WEAPON_PASSIVES).flatMap((w) =>
  [1, 5].map((r) => [w, r] as const),
);

describe.skipIf(!installed)('curated passives against gcsim (ADR-0042)', () => {
  it.each(weapons.filter(([w]) => !(w in GCSIM_GAPS)))(
    '%s R%i: our totals equal gcsim’s',
    async (weaponKey, refinement) => {
      const holder = HOLDER[genshinAdapter.weapon(weaponKey)!.type];
      try {
        const { ours, theirs } = await compare(holder, weaponKey, refinement);
        const fromHp = ATK_FROM_HP[weaponKey];
        if (fromHp) {
          expect(differing(ours, theirs)).toEqual(['atk']);
          expect(theirs.atk - ours.atk).toBeCloseTo(
            (fromHp[refinement - 1] / 100) * theirs.hp,
            0,
          );
        } else expect(differing(ours, theirs)).toEqual([]);
      } catch (e) {
        // A weapon gcsim doesn't implement yet (Breezeborne Refrain, Hymn of
        // the Maelstrom at the pin) can only be checked against genshin-db;
        // once gcsim adds it, this comparison runs.
        if (e instanceof GcsimError && /invalid weapon/.test(e.message)) return;
        throw e;
      }
    },
    60_000,
  );

  it('the documented gaps differ by exactly the reason given', async () => {
    // Thundering Pulse: gcsim's snapshot lacks the static ATK.
    const pulse = await compare('fischl', 'thundering_pulse', 1);
    expect(differing(pulse.ours, pulse.theirs)).toEqual(['atk']);
    const fischlBase = sheetTotals(
      {
        characterKey: 'fischl',
        weaponKey: 'thundering_pulse',
        buildLevel: 90,
        constraints: {},
        objective: 'crit_value',
      },
      [],
    ).ctx.base.atk!;
    expect(pulse.ours.atk - pulse.theirs.atk).toBeCloseTo(fischlBase * 0.2, 0);
    // Ultimate Overlord's: gcsim adds the Melusine +12% (R1) we don't.
    const sword = await compare(
      'noelle',
      "ultimate_overlord's_mega_magic_sword",
      1,
    );
    expect(differing(sword.ours, sword.theirs)).toEqual(['atk']);
    expect(sword.theirs.atk).toBeGreaterThan(sword.ours.atk);
  }, 60_000);

  it.each(Object.keys(CHARACTER_PASSIVES))(
    '%s’s passive: our totals equal gcsim’s',
    async (key) => {
      const type = genshinAdapter.character(key)!.weaponType;
      const favonius: Record<WeaponType, string> = {
        sword: 'favonius_sword',
        claymore: 'favonius_greatsword',
        polearm: 'favonius_lance',
        bow: 'favonius_warbow',
        catalyst: 'favonius_codex',
      };
      const { ours, theirs } = await compare(key, favonius[type], 1);
      expect(differing(ours, theirs)).toEqual([]);
    },
    60_000,
  );

  it('ER-derived weapon and character passives together: Raiden with Engulfing', async () => {
    for (const r of [1, 5]) {
      const { ours, theirs } = await compare(
        'raiden_shogun',
        'engulfing_lightning',
        r,
      );
      expect(differing(ours, theirs)).toEqual([]);
    }
  }, 60_000);

  it('an Ascension 4 passive is not counted below build level 70, nor by gcsim', async () => {
    const { ours, theirs } = await compare('xingqiu', 'favonius_sword', 1, 60);
    expect(differing(ours, theirs)).toEqual([]);
  }, 60_000);
});
