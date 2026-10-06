/**
 * Curated weapon and character passives that reduce to sheet stats
 * (ADR-0042), the way `damage/setBonuses.ts` curates 4-piece bonuses
 * (ADR-0020).
 *
 * The frozen snapshot carries a weapon's base ATK and secondary stat but not
 * its passive, and no character passives at all: genshin-db has them as
 * prose. So the ones that are plain stat bonuses are transcribed here, with
 * the genshin-db value they come from (`param`, checked by a test against
 * the installed genshin-db) and checked against the final stats gcsim
 * reports (a live test, where gcsim is installed).
 *
 * ## What is modelled
 *
 * - **Static** passives: an unconditional stat bonus, scaled by refinement
 *   ("ATK is increased by 20/25/30/35/40%"). Exact for every build.
 * - **ER-derived** passives (Engulfing Lightning's ATK, Mona's and Raiden's
 *   Elemental DMG): resolved once, at the ER the build is optimised toward,
 *   like Emblem of Severed Fate (ADR-0020), so they stay a constant the
 *   pruning bound can carry (ADR-0004). `buildContext` picks the ER.
 *
 * ## What is not
 *
 * Conditional effects (stacks, "after using a Skill", enemy count, HP
 * thresholds), passives derived from a stat other than ER (Staff of Homa's
 * ATK from HP), and DMG bonuses restricted to some hits (The Catch's Burst
 * DMG). Each modelled entry says what it leaves out in `notModelled`;
 * `UNMODELLED_WEAPON_PASSIVES` lists, with the reason, weapons whose passive
 * has no static part at all. gcsim simulates all of them, so the sim
 * re-rank (TODO 5.8) sees what this table doesn't.
 *
 * Freshness: transcribed from genshin-db 5.2.14 (game version 7.1). Re-check
 * on a patch refresh (`docs/runbooks/patch-refresh.md`).
 * @packageDocumentation
 */

import type { BuildLevel, StatKey, StatVec } from '../types';
import { isPctStat, statLabel } from '../../labels-core';
import { WIKI } from '../../curation';

/** A weapon's refinement, R1 to R5. */
export type Refinement = 1 | 2 | 3 | 4 | 5;

export function isRefinement(x: unknown): x is Refinement {
  return x === 1 || x === 2 || x === 3 || x === 4 || x === 5;
}

/** One value per refinement, R1 first. */
type PerRefinement = readonly [number, number, number, number, number];

/** A sheet stat, or `all_dmg`: a DMG bonus for every hit ("Increases all
 *  DMG"), which lands in both `elemental_dmg` and `physical_dmg`. */
export type PassiveStat = StatKey | 'all_dmg';

/** Stat bonus derived from Energy Recharge: `values[r]`% of the ER above
 *  `above`%, capped at `cap[r]`. */
interface FromEr {
  above: number;
  cap?: PerRefinement;
  /** genshin-db's value index for the cap. */
  capParam?: number;
}

export interface WeaponGrant {
  stat: PassiveStat;
  /** R1..R5. The bonus itself, or, with `fromEr`, the % of ER it converts. */
  values: PerRefinement;
  /** Index into genshin-db's `r1..r5.values` the values are transcribed
   *  from. A test reads it, so a genshin-db correction can't drift past. */
  param: number;
  fromEr?: FromEr;
}

export interface WeaponPassive {
  grants: readonly WeaponGrant[];
  /** The rest of the passive, which the stat engine leaves to gcsim. */
  notModelled?: string;
  source: string;
}

const DB = 'genshin-db 5.2.14';
const src = (page: string) => `${WIKI}${page} (values: ${DB})`;

const r = (a: number, b: number, c: number, d: number, e: number) =>
  [a, b, c, d, e] as const;
/** The common shapes: +x per refinement from R1 (20/25/30/35/40). */
const step = (r1: number, inc: number): PerRefinement =>
  r(r1, r1 + inc, r1 + 2 * inc, r1 + 3 * inc, r1 + 4 * inc);
const ATK_20 = step(20, 5);
const ELEMENTAL_12 = step(12, 3);

function grant(stat: PassiveStat, values: PerRefinement, param = 0) {
  return [{ stat, values, param }] as const;
}

/** Keyed by dataset weapon key. */
export const WEAPON_PASSIVES: Record<string, WeaponPassive> = {
  // --- Swords --------------------------------------------------------------
  absolution: {
    grants: grant('crit_dmg', ATK_20),
    notModelled: 'Bond of Life stacks (+16% DMG each).',
    source: src('Absolution'),
  },
  aquila_favonia: {
    grants: grant('atk_pct', ATK_20),
    notModelled: 'The heal and damage proc when hit.',
    source: src('Aquila_Favonia'),
  },
  freedomsworn: {
    grants: grant('all_dmg', step(10, 2.5)),
    notModelled: 'Millennial Movement: the party buff after 2 Sigils.',
    source: src('Freedom-Sworn'),
  },
  haran_geppaku_futsu: {
    grants: grant('elemental_dmg', ELEMENTAL_12),
    notModelled: 'Wavespike stacks (Normal Attack DMG).',
    source: src('Haran_Geppaku_Futsu'),
  },
  key_of_khajnisut: {
    grants: grant('hp_pct', ATK_20),
    notModelled: 'Grand Hymn: Elemental Mastery from Max HP after a Skill.',
    source: src('Key_of_Khaj-Nisut'),
  },
  light_of_foliar_incision: {
    grants: grant('crit_rate', step(4, 1)),
    notModelled:
      'Foliar Incision: Normal and Skill DMG from Elemental Mastery.',
    source: src('Light_of_Foliar_Incision'),
  },
  lightbearing_moonshard: {
    grants: grant('def_pct', ATK_20),
    notModelled: 'Lunar-Crystallize DMG after a Skill.',
    source: src('Lightbearing_Moonshard'),
  },
  mistsplitter_reforged: {
    grants: grant('elemental_dmg', ELEMENTAL_12),
    notModelled: 'Mistsplitter’s Emblem stacks (up to +28% at R1).',
    source: src('Mistsplitter_Reforged'),
  },
  primordial_jade_cutter: {
    grants: grant('hp_pct', ATK_20),
    notModelled:
      'ATK from 1.2% (R1) of Max HP: derived from HP, which the build sets, so not a constant.',
    source: src('Primordial_Jade_Cutter'),
  },
  skyward_blade: {
    grants: grant('crit_rate', step(4, 1)),
    notModelled: 'The Burst’s ATK SPD and extra damage.',
    source: src('Skyward_Blade'),
  },
  uraku_misugiri: {
    grants: grant('def_pct', ATK_20, 2),
    notModelled:
      'Normal Attack and Skill DMG bonuses (doubled after Geo DMG): restricted to hit kinds.',
    source: src('Uraku_Misugiri'),
  },

  // --- Claymores -----------------------------------------------------------
  redhorn_stonethresher: {
    grants: grant('def_pct', step(28, 7)),
    notModelled: 'Normal and Charged Attack DMG from DEF.',
    source: src('Redhorn_Stonethresher'),
  },
  skyward_pride: {
    grants: grant('all_dmg', step(8, 2)),
    notModelled: 'The vacuum blades after a Burst.',
    source: src('Skyward_Pride'),
  },
  song_of_broken_pines: {
    grants: grant('atk_pct', step(16, 4)),
    notModelled: 'Sigils of Whispers: the party buff at 4 Sigils.',
    source: src('Song_of_Broken_Pines'),
  },
  verdict: {
    grants: grant('atk_pct', ATK_20),
    notModelled: 'Seals from Geo Crystallize shards (Skill DMG).',
    source: src('Verdict'),
  },
  "wolf's_gravestone": {
    grants: grant('atk_pct', ATK_20),
    notModelled: 'The party ATK buff on hitting an opponent under 30% HP.',
    source: src("Wolf's_Gravestone"),
  },

  // --- Polearms ------------------------------------------------------------
  calamity_queller: {
    grants: grant('elemental_dmg', ELEMENTAL_12),
    notModelled: 'Consummation: ATK stacks after a Skill (doubled off-field).',
    source: src('Calamity_Queller'),
  },
  engulfing_lightning: {
    grants: [
      {
        stat: 'atk_pct',
        values: step(28, 7),
        param: 0,
        fromEr: { above: 100, cap: step(80, 10), capParam: 1 },
      },
    ],
    notModelled:
      'The +30% (R1) Energy Recharge for 12 s after a Burst, and the ATK it would add.',
    source: src('Engulfing_Lightning'),
  },
  lumidouce_elegy: {
    grants: grant('atk_pct', step(15, 4)),
    notModelled: 'DMG stacks against Burning opponents.',
    source: src('Lumidouce_Elegy'),
  },
  skyward_spine: {
    grants: grant('crit_rate', step(8, 2)),
    notModelled: 'The Normal ATK SPD (no sheet stat) and the vacuum blade.',
    source: src('Skyward_Spine'),
  },
  staff_of_homa: {
    grants: grant('hp_pct', ATK_20),
    notModelled:
      'ATK from 0.8% (R1) of Max HP, more under 50% HP: derived from HP, so not a constant.',
    source: src('Staff_of_Homa'),
  },
  symphonist_of_scents: {
    grants: grant('atk_pct', step(12, 3)),
    notModelled:
      'The further +12% (R1) ATK while off-field, and Sweet Echoes after healing.',
    source: src('Symphonist_of_Scents'),
  },

  // --- Bows ----------------------------------------------------------------
  aqua_simulacra: {
    grants: grant('hp_pct', step(16, 4)),
    notModelled: 'The +20% (R1) DMG while opponents are nearby.',
    source: src('Aqua_Simulacra'),
  },
  elegy_for_the_end: {
    grants: grant('em', step(60, 15)),
    notModelled: 'Millennial Movement: the party buff after 4 Sigils.',
    source: src('Elegy_for_the_End'),
  },
  "hunter's_path": {
    grants: grant('elemental_dmg', ELEMENTAL_12),
    notModelled: 'Tireless Hunt: Charged Attack DMG from Elemental Mastery.',
    source: src("Hunter's_Path"),
  },
  skyward_harp: {
    grants: grant('crit_dmg', ATK_20),
    notModelled: 'The AoE proc on hit.',
    source: src('Skyward_Harp'),
  },
  the_first_great_magic: {
    // Per Gimmick stack; the wielder always counts as one (the passive's
    // own words), so one stack is unconditional.
    grants: grant('atk_pct', step(16, 4), 1),
    notModelled:
      'Gimmick stacks from party members of the wielder’s element (only the wielder’s own counted), and the Charged Attack DMG bonus.',
    source: src('The_First_Great_Magic'),
  },
  thundering_pulse: {
    grants: grant('atk_pct', ATK_20),
    notModelled: 'Thunder Emblem stacks (Normal Attack DMG).',
    source: src('Thundering_Pulse'),
  },

  // --- Catalysts -----------------------------------------------------------
  "angelos'_heptades": {
    grants: grant('atk_pct', step(12, 3)),
    notModelled: 'Pathfinder’s Light and the Energy after creating a Shield.',
    source: src("Angelos'_Heptades"),
  },
  a_teaspoon_of_transcendence: {
    grants: grant('atk_pct', step(28, 7)),
    notModelled: 'Transcendence stacks (reaction DMG).',
    source: src('A_Teaspoon_of_Transcendence'),
  },
  cashflow_supervision: {
    grants: grant('atk_pct', step(16, 4)),
    notModelled: 'Stacks from HP changes (Normal and Charged Attack DMG).',
    source: src('Cashflow_Supervision'),
  },
  everlasting_moonglow: {
    grants: grant('healing', step(10, 2.5)),
    notModelled: 'Normal Attack DMG from Max HP and the Energy after a Burst.',
    source: src('Everlasting_Moonglow'),
  },
  hymn_of_the_maelstrom: {
    grants: grant('healing', step(4, 1)),
    notModelled:
      'Stacks after healing (Max HP, and ATK for the active member).',
    source: src('Hymn_of_the_Maelstrom'),
  },
  "nocturne's_curtain_call": {
    grants: grant('hp_pct', step(10, 2)),
    notModelled:
      'The further Max HP and Lunar CRIT DMG after a Lunar reaction.',
    source: src("Nocturne's_Curtain_Call"),
  },
  reliquary_of_truth: {
    grants: grant('crit_rate', step(8, 2)),
    notModelled:
      'Secret of Lies and Moon of Truth (EM after a Skill, CRIT DMG).',
    source: src('Reliquary_of_Truth'),
  },
  skyward_atlas: {
    grants: grant('elemental_dmg', ELEMENTAL_12),
    notModelled: 'The cloud proc on Normal Attacks.',
    source: src('Skyward_Atlas'),
  },
  "starcaller's_watch": {
    grants: grant('em', step(100, 25)),
    notModelled: 'The party DMG bonus after creating a Shield.',
    source: src("Starcaller's_Watch"),
  },
  "surf's_up": {
    grants: grant('hp_pct', ATK_20),
    notModelled: 'Scorching Summer stacks (Normal Attack DMG).',
    source: src("Surf's_Up"),
  },
  tome_of_the_eternal_flow: {
    grants: grant('hp_pct', step(16, 4)),
    notModelled: 'Charged Attack DMG stacks when HP changes, and their Energy.',
    source: src('Tome_of_the_Eternal_Flow'),
  },
  vivid_notions: {
    grants: grant('atk_pct', step(28, 7)),
    notModelled: 'Plunging Attack CRIT DMG after a Plunge, Skill or Burst.',
    source: src('Vivid_Notions'),
  },

  // --- 4-star -------------------------------------------------------------
  breezeborne_refrain: {
    grants: grant('er_pct', ATK_20),
    notModelled: 'Hymn of the Pure stacks (a party reaction DMG buff).',
    source: src('Breezeborne_Refrain'),
  },
  "ultimate_overlord's_mega_magic_sword": {
    grants: grant('atk_pct', step(12, 3)),
    notModelled:
      'The further ATK (up to +12% at R1) from Melusines helped in Merusea Village: account progress, not modelled.',
    source: src("Ultimate_Overlord's_Mega_Magic_Sword"),
  },
};

/** Meta-relevant weapons whose passive has no static part, and why. */
export const UNMODELLED_WEAPON_PASSIVES: Record<string, string> = {
  beacon_of_the_reed_sea:
    'Max HP +32% (R1) only while not shielded, and ATK after a Skill or taking DMG: conditional.',
  primordial_jade_wingedspear: 'ATK stacks on hit: conditional.',
  staff_of_the_scarlet_sands:
    'ATK from Elemental Mastery: derived from a stat the build sets, so not a constant.',
  deathmatch:
    'ATK (and DEF) depend on how many opponents are nearby: an enemy state.',
  harbinger_of_dawn: 'CRIT Rate only above 90% HP: conditional.',
  the_alley_flash: 'DMG bonus until the wielder is hit: conditional.',
  makhaira_aquamarine:
    'ATK from Elemental Mastery: derived, so not a constant.',
  wandering_evenstar:
    'ATK from Elemental Mastery, periodically: derived, so not a constant.',
  "xiphos'_moonlight":
    'Energy Recharge from Elemental Mastery: derived, so not a constant.',
  polar_star:
    'Skill and Burst DMG (restricted to hit kinds) and Ashen Nightstar stacks.',
  "amos'_bow": 'Normal and Charged Attack DMG: restricted to hit kinds.',
};

export interface CharacterGrant {
  stat: PassiveStat;
  /** The bonus, or with `fromEr`, the % of ER it converts. */
  value: number;
  fromEr?: { above: number };
}

export interface CharacterPassive {
  /** genshin-db's talent key, for the drift test. */
  talent: 'passive2' | 'passive4';
  /** The lowest build level with the passive: 70 for one unlocked at
   *  Ascension 4 (build level is ascension's level cap, ADR-0015), 1 for an
   *  innate one. */
  minBuildLevel: BuildLevel;
  grants: readonly CharacterGrant[];
  source: string;
}

/** Character passives that reduce to sheet stats. Keyed by dataset key. */
export const CHARACTER_PASSIVES: Record<string, CharacterPassive> = {
  xingqiu: {
    talent: 'passive2',
    minBuildLevel: 70,
    grants: [{ stat: 'elemental_dmg', value: 20 }],
    source: src('Xingqiu'),
  },
  mona: {
    talent: 'passive2',
    minBuildLevel: 70,
    // "Hydro DMG Bonus ... equivalent to 20% of her Energy Recharge": all
    // of it, not the part above 100%.
    grants: [{ stat: 'elemental_dmg', value: 20, fromEr: { above: 0 } }],
    source: src('Mona'),
  },
  raiden_shogun: {
    talent: 'passive2',
    minBuildLevel: 70,
    // 0.4% Electro DMG per 1% ER above 100%.
    grants: [{ stat: 'elemental_dmg', value: 40, fromEr: { above: 100 } }],
    source: src('Raiden_Shogun'),
  },
  sangonomiya_kokomi: {
    talent: 'passive4',
    minBuildLevel: 1,
    grants: [
      { stat: 'healing', value: 25 },
      { stat: 'crit_rate', value: -100 },
    ],
    source: src('Sangonomiya_Kokomi'),
  },
};

export interface PassiveQuery {
  characterKey: string;
  weaponKey: string;
  /** Defaults to 1: every copy is at least R1, so it never overstates. */
  refinement?: number;
  buildLevel: BuildLevel;
  /** The ER (percent) ER-derived passives are resolved at. */
  erFloor: number;
}

/** Which passives apply, each grant with its resolved value. */
export interface ResolvedGrant {
  source: 'weapon' | 'character';
  stat: PassiveStat;
  value: number;
  /** Set for an ER-derived grant: the ER it was resolved at. */
  atEr?: number;
}

function refinementOf(q: PassiveQuery): Refinement {
  const ref = q.refinement ?? 1;
  if (!isRefinement(ref))
    throw new Error(`refinement must be 1 to 5, got ${String(ref)}`);
  return ref;
}

function fromEr(er: number, pct: number, above: number, cap?: number) {
  const v = (pct / 100) * Math.max(0, er - above);
  return cap === undefined ? v : Math.min(cap, v);
}

/** Every passive grant that applies to this character, weapon, refinement
 *  and build level, resolved to a number. */
export function resolvePassives(q: PassiveQuery): ResolvedGrant[] {
  const ref = refinementOf(q);
  const out: ResolvedGrant[] = [];
  for (const g of WEAPON_PASSIVES[q.weaponKey]?.grants ?? []) {
    const pct = g.values[ref - 1];
    out.push(
      g.fromEr
        ? {
            source: 'weapon',
            stat: g.stat,
            value: fromEr(
              q.erFloor,
              pct,
              g.fromEr.above,
              g.fromEr.cap?.[ref - 1],
            ),
            atEr: q.erFloor,
          }
        : { source: 'weapon', stat: g.stat, value: pct },
    );
  }
  const c = CHARACTER_PASSIVES[q.characterKey];
  if (c && q.buildLevel >= c.minBuildLevel)
    for (const g of c.grants)
      out.push(
        g.fromEr
          ? {
              source: 'character',
              stat: g.stat,
              value: fromEr(q.erFloor, g.value, g.fromEr.above),
              atEr: q.erFloor,
            }
          : { source: 'character', stat: g.stat, value: g.value },
      );
  return out;
}

/** The passives as one stat vector, `all_dmg` spread over both DMG
 *  stats. Empty when nothing applies. */
export function passiveVector(q: PassiveQuery): StatVec {
  const out: StatVec = {};
  const add = (k: StatKey, v: number) => (out[k] = (out[k] ?? 0) + v);
  for (const g of resolvePassives(q)) {
    if (g.value === 0) continue;
    if (g.stat === 'all_dmg') {
      add('elemental_dmg', g.value);
      add('physical_dmg', g.value);
    } else add(g.stat, g.value);
  }
  return out;
}

/** Whether anything resolved for this query depends on the ER floor. */
export function hasErDerivedPassive(q: Omit<PassiveQuery, 'erFloor'>) {
  return resolvePassives({ ...q, erFloor: 100 }).some(
    (g) => g.atEr !== undefined,
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function grantText(stat: PassiveStat, value: number): string {
  if (stat === 'all_dmg') return `${value < 0 ? '' : '+'}${fmt(value)}% DMG`;
  const unit = isPctStat(stat) ? '%' : '';
  return `${value < 0 ? '' : '+'}${fmt(value)}${unit} ${statLabel(stat)}`;
}

/**
 * One line per passive the build carries, saying what is counted and what
 * isn't (ADR-0042), so a total that includes a passive, or a passive that
 * scores nothing, is never silent. Names come from the caller, which has
 * the dataset (this module stays free of it, like `setBonuses.ts`).
 */
export function passiveAssumptions(
  q: PassiveQuery,
  names: { weapon: string; character: string },
): string[] {
  const ref = refinementOf(q);
  const out: string[] = [];
  const atEr = ` counted at ${fmt(q.erFloor)}% Energy Recharge, the ER the build is optimised toward`;
  const w = WEAPON_PASSIVES[q.weaponKey];
  if (w) {
    const parts = w.grants.map((g) => {
      const pct = g.values[ref - 1];
      if (!g.fromEr) return grantText(g.stat, pct);
      const cap = g.fromEr.cap?.[ref - 1];
      const v = fromEr(q.erFloor, pct, g.fromEr.above, cap);
      return `${grantText(g.stat, v)} (${fmt(pct)}% of the ER above ${g.fromEr.above}%${
        cap === undefined ? '' : `, max ${fmt(cap)}%`
      }),${atEr}`;
    });
    out.push(
      `${names.weapon} R${ref} passive: ${parts.join('; ')}.${
        w.notModelled ? ` Not counted: ${w.notModelled}` : ''
      }`,
    );
  } else if (UNMODELLED_WEAPON_PASSIVES[q.weaponKey])
    out.push(
      `${names.weapon} passive not counted: ${UNMODELLED_WEAPON_PASSIVES[q.weaponKey]}`,
    );
  const c = CHARACTER_PASSIVES[q.characterKey];
  if (c && q.buildLevel < c.minBuildLevel)
    out.push(
      `${names.character}’s passive unlocks at Ascension 4 (build level ${c.minBuildLevel}): not counted at level ${q.buildLevel}.`,
    );
  else if (c) {
    const parts = c.grants.map((g) =>
      g.fromEr
        ? `${grantText(g.stat, fromEr(q.erFloor, g.value, g.fromEr.above))} (${fmt(g.value)}% of the ER${
            g.fromEr.above ? ` above ${g.fromEr.above}%` : ''
          }),${atEr}`
        : grantText(g.stat, g.value),
    );
    out.push(`${names.character}’s passive: ${parts.join(', ')}.`);
  }
  return out;
}
