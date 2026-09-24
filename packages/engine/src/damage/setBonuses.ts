/**
 * Curated 4-piece set bonuses, modelled at **full uptime / max stacks**
 * (ADR-0020, amending ADR-0003's "conditional 4pc effects are not scored").
 *
 * The table is hand-curated content, like `DAMAGE_PROFILES` and `META_TARGETS`:
 * the frozen `genshin-db` snapshot carries only the flat-stat 2-piece bonuses
 * (every `sets[].fourPiece` in `data.generated.json` is absent), because a 4pc
 * effect is prose, not a stat vector. Turning that prose into a number is a
 * judgement call, so it lives here with its assumption written down next to it.
 *
 * ## The two channels
 *
 * - **`sheet`** — a flat sheet stat the effect reduces to at full uptime
 *   (Crimson Witch's three stacks are just "+22.5% Pyro DMG"). Honest for any
 *   objective, so it feeds the **scalar** pruning path as well as the damage
 *   engine.
 * - **`hitDmg` / `burstDmgFromEr`** — a DMG% bonus restricted to one or more
 *   hit kinds (Gladiator's "+35% Normal Attack DMG"). These are *not* sheet
 *   stats and never reach a scalar objective; they are folded into
 *   `elemental_dmg` **only** for the `avg_damage` objective, weighted by the
 *   share of the character's damage profile that the restricted hit kinds
 *   account for. See `fourPieceVector` for why that is an approximation.
 *
 * ## What is deliberately not modelled
 *
 * `UNMODELLED_FOUR_PIECE` lists, with a reason, every meta-relevant set whose
 * 4pc has no honest self-buff number: enemy RES shred (a team effect, and the
 * enemy config is a constant across candidate builds anyway), transformative-
 * reaction bonuses (excluded by ADR-0016), and effects that scale off healing
 * or team composition rather than the wearer's own sheet.
 *
 * Freshness: transcribed against snapshot patch 6.7. `source` is the set's
 * Fandom wiki page; the bonus text was cross-read against community build
 * guides. Re-check on a patch refresh (`docs/runbooks/patch-refresh.md`).
 */
import type { StatVec, WeaponType } from '../game/types';
import { computeHitDamage } from './formula';
import type { DamageContext, HitKind } from './types';

export interface FourPieceBonus {
  /** The flat sheet stats the 4pc reduces to at full uptime. Scalar-safe. */
  sheet?: StatVec;
  /** Additive DMG% by hit kind. Damage-engine only (see module docs). */
  hitDmg?: Partial<Record<HitKind, number>>;
  /** Emblem of Severed Fate: Burst DMG% = `pctOfEr`% of Energy Recharge,
   *  capped at `cap`. Resolved against the profile's ER requirement, not the
   *  candidate build's ER — see `fourPieceVector`. */
  burstDmgFromEr?: { pctOfEr: number; cap: number };
  /** Weapon classes the bonus is gated on; unset means "any". */
  weaponTypes?: WeaponType[];
  /** What "full uptime" is being assumed. Surfaced in the UI (see ADR-0020). */
  uptime: string;
  source: string;
}

const WIKI = 'https://genshin-impact.fandom.com/wiki/';

export const FOUR_PIECE_BONUSES: Record<string, FourPieceBonus> = {
  // --- reduces to a flat sheet stat at full uptime -------------------------
  CrimsonWitchOfFlames: {
    sheet: { elemental_dmg: 22.5 },
    uptime:
      'Assumes 3 stacks of the Elemental Skill bonus (+50% of the 2pc Pyro DMG each), i.e. +22.5% Pyro DMG on top of the 2pc. The 4pc reaction-DMG bonuses (Overloaded/Burning/Burgeon/Vaporize/Melt) are not modelled — ADR-0016 excludes reaction DMG bonuses.',
    source: `${WIKI}Crimson_Witch_of_Flames`,
  },
  NoblesseOblige: {
    sheet: { atk_pct: 20 },
    uptime:
      'Assumes the wearer’s Elemental Burst is up, so the party-wide +20% ATK is always active. Does not stack in-game; modelled as if the wearer is the only Noblesse holder.',
    source: `${WIKI}Noblesse_Oblige`,
  },
  MarechausseeHunter: {
    sheet: { crit_rate: 36 },
    uptime:
      'Assumes 3 stacks (+12% CRIT Rate each) from continuous current-HP changes — the standard Fontaine/Furina-team assumption.',
    source: `${WIKI}Marechaussee_Hunter`,
  },
  HuskOfOpulentDreams: {
    sheet: { def_pct: 24, elemental_dmg: 24 },
    uptime:
      'Assumes 4 Curiosity stacks (+6% DEF and +6% Geo DMG each) maintained on-field.',
    source: `${WIKI}Husk_of_Opulent_Dreams`,
  },
  BlizzardStrayer: {
    sheet: { crit_rate: 40 },
    uptime:
      'Assumes the target is Frozen (+20% base, +20% more) — permafreeze. Against a merely Cryo-affected target it is +20%, and against neither it is 0%.',
    source: `${WIKI}Blizzard_Strayer`,
  },
  NymphsDream: {
    sheet: { atk_pct: 25, elemental_dmg: 15 },
    uptime:
      'Assumes 3+ Mirrored Nymph stacks (the top tier): +25% ATK and +15% Hydro DMG.',
    source: `${WIKI}Nymph's_Dream`,
  },
  VermillionHereafter: {
    sheet: { atk_pct: 48 },
    uptime:
      'Optimistic: +8% ATK from Nascent Light plus 4 HP-loss stacks (+10% each). Real rotations rarely hold 4 stacks; this is the max-stack convention.',
    source: `${WIKI}Vermillion_Hereafter`,
  },
  FragmentOfHarmonicWhimsy: {
    sheet: { elemental_dmg: 54 },
    uptime:
      'Assumes 3 stacks (+18% DMG each) from Bond of Life value changes. Modelled as a flat DMG bonus because it applies to every hit, not one hit kind.',
    source: `${WIKI}Fragment_of_Harmonic_Whimsy`,
  },
  UnfinishedReverie: {
    sheet: { elemental_dmg: 50 },
    uptime:
      'Assumes the +50% DMG cap is held — i.e. an opponent affected by Burning is nearby throughout, so the bonus grows rather than decays.',
    source: `${WIKI}Unfinished_Reverie`,
  },
  ObsidianCodex: {
    sheet: { crit_rate: 40 },
    uptime:
      'Assumes Nightsoul points are consumed at least once every 6s, so the +40% CRIT Rate never lapses.',
    source: `${WIKI}Obsidian_Codex`,
  },
  TenacityOfTheMillelith: {
    sheet: { atk_pct: 20 },
    uptime:
      'Assumes the Elemental Skill hits often enough to keep the +20% ATK refreshed (0.5s ICD, 3s duration). The +30% Shield Strength half is not a damage stat.',
    source: `${WIKI}Tenacity_of_the_Millelith`,
  },
  GildedDreams: {
    sheet: { em: 100 },
    uptime:
      'Team-composition dependent. Assumes 2 party members of a different element (+50 EM each) — the common Dendro-team case. The same-element branch (+14% ATK per matching ally) is not modelled, because the two cannot both be assumed.',
    source: `${WIKI}Gilded_Dreams`,
  },
  PaleFlame: {
    sheet: { atk_pct: 18, physical_dmg: 25 },
    uptime:
      'Assumes 2 stacks (+9% ATK each). The second stack also doubles the 2pc Physical DMG bonus, so the extra +25% Physical DMG on top of the snapshot’s 2pc is included here.',
    source: `${WIKI}Pale_Flame`,
  },
  NighttimeWhispersInTheEchoingWoods: {
    sheet: { elemental_dmg: 20 },
    uptime:
      'Assumes the Elemental Skill keeps the base +20% Geo DMG refreshed. The +150% escalation requires a Crystallize shield, which is a team state, so it is not modelled.',
    source: `${WIKI}Nighttime_Whispers_in_the_Echoing_Woods`,
  },

  // --- DMG% restricted to hit kinds (damage engine only) -------------------
  GladiatorsFinale: {
    hitDmg: { normal: 35 },
    weaponTypes: ['sword', 'claymore', 'polearm'],
    uptime:
      'Unconditional for Sword/Claymore/Polearm users; the bonus simply does not exist for Bow/Catalyst users, which `weaponTypes` enforces.',
    source: `${WIKI}Gladiator's_Finale`,
  },
  WanderersTroupe: {
    hitDmg: { charged: 35 },
    weaponTypes: ['catalyst', 'bow'],
    uptime:
      'Unconditional for Catalyst/Bow users; absent for every other weapon class.',
    source: `${WIKI}Wanderer's_Troupe`,
  },
  EmblemOfSeveredFate: {
    burstDmgFromEr: { pctOfEr: 25, cap: 75 },
    uptime:
      'Burst DMG +25% of Energy Recharge, capped at +75%. Resolved once against the damage profile’s ER requirement rather than the candidate build’s own ER, so it stays a constant the pruning bound can carry (see ADR-0020).',
    source: `${WIKI}Emblem_of_Severed_Fate`,
  },
  GoldenTroupe: {
    hitDmg: { skill: 50 },
    uptime:
      'Assumes the wearer is off-field (+25% base, +25% more), the standard Golden Troupe use case. An on-field holder gets only +25%.',
    source: `${WIKI}Golden_Troupe`,
  },
  ShimenawasReminiscence: {
    hitDmg: { normal: 50, charged: 50, plunge: 50 },
    uptime:
      'Assumes the 15-Energy Skill cast happens every rotation and the 10s window covers the damage. The Energy cost is a real trade-off the model does not charge for.',
    source: `${WIKI}Shimenawa's_Reminiscence`,
  },
  HeartOfDepth: {
    hitDmg: { normal: 30, charged: 30 },
    uptime:
      'Assumes the Elemental Skill is cast each rotation, so the 15s window covers the Normal/Charged attacks.',
    source: `${WIKI}Heart_of_Depth`,
  },
  DesertPavilionChronicle: {
    hitDmg: { charged: 80, normal: 40, plunge: 40 },
    uptime:
      'Charged Attacks get the unconditional +40% plus the +40% refreshed by Charged Attacks hitting; Normal and Plunging attacks get only the refreshed +40%. Assumes a Charged-Attack rotation keeps the 15s window alive.',
    source: `${WIKI}Desert_Pavilion_Chronicle`,
  },
  RetracingBolide: {
    hitDmg: { normal: 40, charged: 40 },
    uptime:
      'Assumes a shield is up for the whole rotation — a team state, not a property of the wearer’s build.',
    source: `${WIKI}Retracing_Bolide`,
  },
  LongNightsOath: {
    hitDmg: { plunge: 75 },
    uptime:
      'Assumes 5 Radiance Everlasting stacks (+15% Plunging Attack DMG each) are held.',
    source: `${WIKI}Long_Night's_Oath`,
  },
  FinaleOfTheDeepGalleries: {
    hitDmg: { normal: 60 },
    uptime:
      'Assumes the wearer sits at 0 Energy (the set’s design) and the Normal-Attack half of the bonus is the one that lands. The Burst half is mutually exclusive with it, so only one can honestly be counted.',
    source: `${WIKI}Finale_of_the_Deep_Galleries`,
  },
};

/** Meta-relevant 4pc effects deliberately left unmodelled, and why. Kept as
 *  data so the UI and the docs can list them instead of silently scoring 0. */
export const UNMODELLED_FOUR_PIECE: Record<string, string> = {
  ViridescentVenerer:
    'Swirl DMG +60% and -40% enemy RES to the swirled element: a transformative-reaction bonus (excluded by ADR-0016) plus an enemy debuff that helps the team, not the wearer.',
  DeepwoodMemories:
    'Dendro RES -30% on the enemy. An enemy debuff, and identical across every candidate build, so it cannot change the ranking.',
  ThunderingFury:
    'Electro reaction DMG bonuses plus a Skill cooldown reduction — reaction-only (ADR-0016) and rotation-shaped.',
  FlowerOfParadiseLost:
    'Bloom/Hyperbloom/Burgeon DMG only: transformative reactions, excluded by ADR-0016.',
  ArchaicPetra:
    'Requires picking up a Crystallize shard of a matching element, and the buff is normally passed to a different party member.',
  ScrollOfTheHeroOfCinderCity:
    'A party-wide Elemental DMG buff gated on reaction elements and the wearer’s Nightsoul state; the exact self-buff share could not be confirmed against a primary source.',
  OceanHuedClam:
    'Deals a separate damage instance worth 90% of accumulated healing. Scales off healing done, not off the wearer’s offensive sheet.',
  SongOfDaysPast:
    'Adds a share of recorded healing to damage — healing-driven, like Ocean-Hued Clam.',
  EchoesOfAnOffering:
    'A 36%-chance proc per Normal Attack hit with an escalating make-up chance; an expected-value number would misrepresent it as a steady buff.',
  Lavawalker:
    '+35% DMG only against Pyro-affected opponents — an enemy state the model has no field for.',
  DisenchantmentInDeepShadow:
    'Newer than the reference material that could be verified; left unmodelled rather than guessed.',
};

/**
 * The `four` stat vector for a set, or `undefined` when the set has no
 * modelled 4pc (or its weapon gate does not match).
 *
 * `damage` (with the character's `base` stats) is supplied only for the
 * `avg_damage` objective. Without it the
 * result is the honest `sheet` portion alone, so a scalar objective never
 * silently collects a Normal-Attack-only bonus.
 *
 * **The hit-kind approximation.** A "+35% Normal Attack DMG" bonus is not a
 * sheet stat: in the KQM formula it lands in the DMG-bonus bucket of *some*
 * hits only. The optimiser's pruning bound, however, can only see a `StatVec`
 * (ADR-0004), so the bonus has to become one. It is converted to the
 * `elemental_dmg` that would produce the same total at a **representative
 * endgame sheet**: `Σ_kind pct[kind] × share[kind]`, where `share[kind]` is that
 * kind's fraction of the profile's weighted *elemental* damage (see
 * `weightedHitKindShares`). The share drifts slightly as
 * artifacts change the totals, so this is an approximation — but it lives
 * entirely inside the stat vector, so the bound and the leaf score use the very
 * same number and admissibility (ADR-0004) is untouched.
 */
export function fourPieceVector(
  setKey: string,
  opts: {
    weaponType?: WeaponType;
    damage?: DamageContext;
    /** character + weapon base stats; required whenever `damage` is given. */
    base?: StatVec;
    /** Hit-kind shares, computed once per run by `buildContext` (ADR-0020) so
     *  every set reads the identical vector and the shares are measured at a
     *  representative endgame sheet rather than the EM-less base. Falls back to
     *  measuring at `base` when omitted. */
    shares?: Partial<Record<HitKind, number>>;
    /** ER% the Emblem bonus is resolved against. Precedence is the caller's:
     *  the request's `minStats.er_pct`, else the profile's `erRequirement`,
     *  else 100. Omitted here means "fall back to the profile". */
    erFloor?: number;
  } = {},
): StatVec | undefined {
  const entry = FOUR_PIECE_BONUSES[setKey];
  if (!entry) return undefined;
  if (
    entry.weaponTypes &&
    opts.weaponType !== undefined &&
    !entry.weaponTypes.includes(opts.weaponType)
  )
    return undefined;

  const out: StatVec = { ...entry.sheet };
  const dmg = opts.damage;
  if (dmg && (entry.hitDmg || entry.burstDmgFromEr)) {
    const shares = opts.shares ?? weightedHitKindShares(opts.base ?? {}, dmg);
    let bonus = 0;
    for (const [kind, pct] of Object.entries(entry.hitDmg ?? {}))
      bonus += pct * (shares[kind as HitKind] ?? 0);
    if (entry.burstDmgFromEr) {
      const er = opts.erFloor ?? dmg.profile.erRequirement ?? 100;
      const pct = Math.min(
        entry.burstDmgFromEr.cap,
        (entry.burstDmgFromEr.pctOfEr / 100) * er,
      );
      bonus += pct * (shares.burst ?? 0);
    }
    if (bonus > 0) out.elemental_dmg = (out.elemental_dmg ?? 0) + bonus;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * A stand-in endgame sheet, used when the character has no `META_TARGETS`
 * `statTargets` to measure the shares against (ADR-0020). Measuring at the bare
 * `base` vector would read the shares off a character with 0 EM, 5% CRIT Rate
 * and no ATK% — a sheet nobody actually plays, which systematically
 * under-weights reaction and crit-heavy hits against unreacted ones. These are
 * deliberately unremarkable "a built character" numbers rather than a ceiling.
 */
export const REPRESENTATIVE_ENDGAME_SHEET: StatVec = {
  em: 300,
  crit_rate: 70,
  crit_dmg: 140,
  atk_pct: 50,
};

/**
 * Each hit kind's share of the profile's weighted **elemental** damage.
 *
 * `sheet` is the stat vector the shares are measured at — `buildContext` passes
 * the character's base merged with a representative endgame vector (their
 * `META_TARGETS.statTargets` when curated, else
 * `REPRESENTATIVE_ENDGAME_SHEET`), because the shares are ratios and the
 * EM-less, crit-less base sheet is not the sheet the ratios will be read at.
 *
 * The denominator is the elemental sum, not the total: the bonus is folded into
 * `elemental_dmg`, which a physical hit never reads, so normalising by a total
 * that includes physical hits would shrink every share toward zero and silently
 * discount the set on a part-physical profile.
 */
export function weightedHitKindShares(
  sheet: StatVec,
  dmg: DamageContext,
): Partial<Record<HitKind, number>> {
  const shares: Partial<Record<HitKind, number>> = {};
  let elemental = 0;
  for (const hit of dmg.profile.hits) {
    if (hit.bonus !== 'elemental') continue;
    // The shared crit/DEF/RES factor cancels in the ratio, so only the per-hit
    // factor would strictly matter; computeHitDamage is used whole for clarity.
    const d = hit.weight * computeHitDamage(sheet, sheet, hit, dmg);
    elemental += d;
    shares[hit.kind] = (shares[hit.kind] ?? 0) + d;
  }
  if (elemental <= 0) return {};
  for (const k of Object.keys(shares) as HitKind[])
    shares[k] = (shares[k] ?? 0) / elemental;
  return shares;
}

/** Whether a modelled entry has anything but hit-kind-restricted DMG%, i.e.
 *  whether it contributes at all to a non-damage objective. */
function hasSheetPart(e: FourPieceBonus): boolean {
  return e.sheet !== undefined && Object.keys(e.sheet).length > 0;
}

/**
 * One line per 4pc a build actually carries, saying either what the modelled
 * number assumes or — the case that used to be silent — why there is no number
 * (ADR-0020). A set can be unscored three ways: its effect has no honest
 * self-buff value at all (`UNMODELLED_FOUR_PIECE`), it is a hit-kind bonus and
 * the objective is a scalar stat rather than damage, or its weapon gate does
 * not match the build's weapon.
 */
export function fourPieceAssumptions(
  setKeys: Iterable<string>,
  opts: {
    /** The run is ranking by `avg_damage`, so the hit-kind channel is live. */
    hasDamage: boolean;
    weaponType?: WeaponType;
  },
  // Display-name resolver injected by the caller: this module must stay free
  // of the dataset adapter (the API bundle imports it), so it cannot call
  // formatSetName itself. Defaults to the raw key.
  setName: (key: string) => string = (key) => key,
): string[] {
  const out: string[] = [];
  for (const key of setKeys) {
    const name = setName(key);
    const e = FOUR_PIECE_BONUSES[key];
    if (!e) {
      const reason = UNMODELLED_FOUR_PIECE[key];
      if (reason) out.push(`${name} 4pc not scored: ${reason}`);
      continue;
    }
    if (
      e.weaponTypes &&
      opts.weaponType !== undefined &&
      !e.weaponTypes.includes(opts.weaponType)
    ) {
      out.push(`${name} 4pc: not scored for this weapon class.`);
      continue;
    }
    const hitKindOnly = !hasSheetPart(e);
    if (hitKindOnly && !opts.hasDamage) {
      out.push(`${name} 4pc: not scored on this objective.`);
      continue;
    }
    const folded =
      opts.hasDamage &&
      (e.hitDmg !== undefined || e.burstDmgFromEr !== undefined)
        ? ' Its hit-kind DMG bonus is modelled as the equivalent Elemental DMG%, so the Elemental DMG figure above already includes it.'
        : '';
    out.push(`${name} 4pc: ${e.uptime}${folded}`);
  }
  return out;
}
