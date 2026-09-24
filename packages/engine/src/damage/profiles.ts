/**
 * Curated damage profiles: the weighted stand-in rotations that drive the
 * `avg_damage` objective.
 *
 * Multipliers are the character's **talent level 9** values, read from the same
 * frozen `genshin-db` snapshot the rest of the reference data comes from
 * (ADR-0002) — `talents(name).combatN.attributes.parameters`, index 8. Which
 * hits appear and how they are weighted approximates the rotation each
 * character's KQM guide describes; `source` is that guide.
 *
 * // ponytail: hand-transcribed at talent lv9 — constant scale factor per
 * // character, fine for ranking that character's own artifacts; revisit for
 * // cross-character comparisons.
 *
 * Reactions are set only where the character is essentially always built around
 * one (Hu Tao and Xiangling as pyro vaporize triggers, hence the 1.5× variant).
 * Everyone else carries `reaction: 'none'` — the reaction a build actually sees
 * is a team property, not a character property, and guessing it here would bake
 * a comp assumption into the artifact ranking.
 *
 * Freshness: transcribed against snapshot patch 6.7. Re-check when the snapshot
 * is refreshed or a character is reworked.
 */
import type { DamageProfile } from './types';

/** Every hit is an elemental-DMG hit; no profile here is built for physical. */
export const DAMAGE_PROFILES: Record<string, DamageProfile> = {
  neuvillette: {
    characterKey: 'neuvillette',
    source: 'https://keqingmains.com/neuvillette/',
    erRequirement: 110,
    hits: [
      {
        name: 'Charged Attack: Equitable Judgment (per tick)',
        kind: 'charged',
        scaling: 'hp',
        multiplier: 13.4458,
        bonus: 'elemental',
        reaction: 'none',
        weight: 12,
      },
      {
        name: 'Burst',
        kind: 'burst',
        scaling: 'hp',
        multiplier: 37.8383,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
      {
        name: 'Skill',
        kind: 'skill',
        scaling: 'hp',
        multiplier: 21.8688,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  alhaitham: {
    characterKey: 'alhaitham',
    source: 'https://keqingmains.com/alhaitham/',
    erRequirement: 120,
    hits: [
      {
        name: 'Mirror projection attack (ATK part)',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 114.24,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
      {
        name: 'Mirror projection attack (EM part)',
        kind: 'skill',
        scaling: 'em',
        multiplier: 228.48,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
      {
        name: 'Burst instance (ATK part)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 206.72,
        bonus: 'elemental',
        reaction: 'none',
        weight: 4,
      },
      {
        name: 'Burst instance (EM part)',
        kind: 'burst',
        scaling: 'em',
        multiplier: 165.376,
        bonus: 'elemental',
        reaction: 'none',
        weight: 4,
      },
    ],
  },

  nahida: {
    characterKey: 'nahida',
    source: 'https://keqingmains.com/nahida/',
    erRequirement: 120,
    hits: [
      {
        name: 'Tri-Karma Purification (ATK part)',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 175.44,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
      {
        name: 'Tri-Karma Purification (EM part)',
        kind: 'skill',
        scaling: 'em',
        multiplier: 350.88,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
      {
        name: 'Skill (hold)',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 221.68,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  furina: {
    characterKey: 'furina',
    source: 'https://keqingmains.com/furina/',
    erRequirement: 130,
    hits: [
      {
        name: 'Mademoiselle Crabaletta',
        kind: 'skill',
        scaling: 'hp',
        multiplier: 14.0896,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
      {
        name: 'Surintendante Chevalmarin',
        kind: 'skill',
        scaling: 'hp',
        multiplier: 5.4944,
        bonus: 'elemental',
        reaction: 'none',
        weight: 8,
      },
      {
        name: 'Gentilhomme Usher',
        kind: 'skill',
        scaling: 'hp',
        multiplier: 10.132,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
    ],
  },

  raiden_shogun: {
    characterKey: 'raiden_shogun',
    source: 'https://keqingmains.com/raiden/',
    erRequirement: 200,
    hits: [
      {
        name: 'Musou no Hitotachi (burst initial)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 681.36,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
      {
        name: 'Musou Isshin attack string (5 hits combined)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 468.09,
        bonus: 'elemental',
        reaction: 'none',
        weight: 4,
      },
      {
        name: 'Eye of Stormy Judgment coordinated ATK',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 71.4,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
    ],
  },

  yelan: {
    characterKey: 'yelan',
    source: 'https://keqingmains.com/yelan/',
    erRequirement: 180,
    hits: [
      {
        name: 'Exquisite Throw (per proc)',
        kind: 'burst',
        scaling: 'hp',
        multiplier: 8.2824,
        bonus: 'elemental',
        reaction: 'none',
        weight: 14,
      },
      {
        name: 'Burst initial',
        kind: 'burst',
        scaling: 'hp',
        multiplier: 12.4236,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
      {
        name: 'Lingering Lifeline',
        kind: 'skill',
        scaling: 'hp',
        multiplier: 38.4431,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  xingqiu: {
    characterKey: 'xingqiu',
    source: 'https://keqingmains.com/xingqiu/',
    erRequirement: 180,
    hits: [
      {
        name: 'Guhua Sword: Raincutter (rain sword)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 92.2624,
        bonus: 'elemental',
        reaction: 'none',
        weight: 12,
      },
      {
        name: 'Guhua Sword: Fatal Rainscreen (1st hit)',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 285.6,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
      {
        name: 'Guhua Sword: Fatal Rainscreen (2nd hit)',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 325.04,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  xiangling: {
    characterKey: 'xiangling',
    source: 'https://keqingmains.com/xiangling/',
    erRequirement: 200,
    hits: [
      {
        name: 'Pyronado (per spin)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 190.4,
        bonus: 'elemental',
        reaction: 'vaporize-1.5x',
        weight: 6,
      },
      {
        name: 'Guoba flame',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 189.176,
        bonus: 'elemental',
        reaction: 'vaporize-1.5x',
        weight: 2,
      },
      {
        name: 'Burst swings (3 hits combined)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 458.32,
        bonus: 'elemental',
        reaction: 'vaporize-1.5x',
        weight: 1,
      },
    ],
  },

  navia: {
    characterKey: 'navia',
    source: 'https://keqingmains.com/navia/',
    erRequirement: 130,
    hits: [
      {
        name: 'Rosula Shardshot',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 671.16,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
      {
        name: 'Surging Blade',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 61.2,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
      {
        name: 'Burst',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 127.84,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
      {
        name: 'Cannon fire support',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 73.355,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
    ],
  },

  xiao: {
    characterKey: 'xiao',
    source: 'https://keqingmains.com/xiao/',
    erRequirement: 130,
    hits: [
      {
        name: 'High plunge',
        kind: 'plunge',
        scaling: 'atk',
        multiplier: 293.3586,
        bonus: 'elemental',
        reaction: 'none',
        weight: 8,
      },
      {
        name: 'Lemniscatic Wind Cycling',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 429.76,
        bonus: 'elemental',
        reaction: 'none',
        weight: 2,
      },
    ],
  },

  wanderer: {
    characterKey: 'wanderer',
    source: 'https://keqingmains.com/wanderer/',
    erRequirement: 120,
    hits: [
      {
        name: 'Charged Attack',
        kind: 'charged',
        scaling: 'atk',
        multiplier: 224.536,
        bonus: 'elemental',
        reaction: 'none',
        weight: 4,
      },
      {
        name: 'Kuugo: Fushoudan',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 151.1525,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
      {
        name: 'Burst',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 250.24,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  clorinde: {
    characterKey: 'clorinde',
    source: 'https://keqingmains.com/clorinde/',
    erRequirement: 130,
    hits: [
      {
        name: 'Impale the Night (lv3 pistol shot)',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 80.7696,
        bonus: 'elemental',
        reaction: 'none',
        weight: 8,
      },
      {
        name: 'Swift Hunt',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 49.1696,
        bonus: 'elemental',
        reaction: 'none',
        weight: 2,
      },
      {
        name: 'Burst',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 215.696,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  hu_tao: {
    characterKey: 'hu_tao',
    source: 'https://keqingmains.com/hu-tao/',
    erRequirement: 100,
    hits: [
      {
        name: 'Charged Attack',
        kind: 'charged',
        scaling: 'atk',
        multiplier: 228.66,
        bonus: 'elemental',
        reaction: 'vaporize-1.5x',
        weight: 5,
      },
      {
        name: 'Blood Blossom',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 108.8,
        bonus: 'elemental',
        reaction: 'vaporize-1.5x',
        weight: 4,
      },
      {
        name: 'Burst (low HP)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 587.93,
        bonus: 'elemental',
        reaction: 'vaporize-1.5x',
        weight: 1,
      },
    ],
  },

  keqing: {
    characterKey: 'keqing',
    source: 'https://keqingmains.com/keqing/',
    erRequirement: 140,
    hits: [
      {
        name: 'Charged Attack (2 hits combined)',
        kind: 'charged',
        scaling: 'atk',
        multiplier: 299.094,
        bonus: 'elemental',
        reaction: 'none',
        weight: 4,
      },
      {
        name: 'Burst consecutive slash',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 40.8,
        bonus: 'elemental',
        reaction: 'none',
        weight: 8,
      },
      {
        name: 'Burst last attack',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 320.96,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
      {
        name: 'Stellar Restoration (Thunderclap Slash)',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 142.8,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  ganyu: {
    characterKey: 'ganyu',
    source: 'https://keqingmains.com/ganyu/',
    erRequirement: 130,
    hits: [
      {
        name: 'Frostflake Arrow',
        kind: 'charged',
        scaling: 'atk',
        multiplier: 217.6,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
      {
        name: 'Frostflake Arrow Bloom',
        kind: 'charged',
        scaling: 'atk',
        multiplier: 369.92,
        bonus: 'elemental',
        reaction: 'none',
        weight: 3,
      },
      {
        name: 'Celestial Shower ice shard',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 119.4624,
        bonus: 'elemental',
        reaction: 'none',
        weight: 10,
      },
    ],
  },

  tartaglia: {
    characterKey: 'tartaglia',
    source: 'https://keqingmains.com/childe/',
    erRequirement: 130,
    hits: [
      {
        name: 'Melee 3-hit',
        kind: 'normal',
        scaling: 'atk',
        multiplier: 103.49,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
      {
        name: 'Riptide Slash',
        kind: 'normal',
        scaling: 'atk',
        multiplier: 110.6,
        bonus: 'elemental',
        reaction: 'none',
        weight: 4,
      },
      {
        name: 'Havoc: Obliteration (melee)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 788.8,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  wriothesley: {
    characterKey: 'wriothesley',
    source: 'https://keqingmains.com/wriothesley/',
    erRequirement: 130,
    hits: [
      {
        name: 'Enhanced Repelling Fist',
        kind: 'charged',
        scaling: 'atk',
        multiplier: 166.9515,
        bonus: 'elemental',
        reaction: 'none',
        weight: 8,
      },
      {
        name: 'Burst (per instance, 5 instances)',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 216.24,
        bonus: 'elemental',
        reaction: 'none',
        weight: 5,
      },
      {
        name: 'Surging Blade',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 72.08,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },

  kamisato_ayaka: {
    characterKey: 'kamisato_ayaka',
    source: 'https://keqingmains.com/ayaka/',
    erRequirement: 130,
    hits: [
      {
        name: 'Charged Attack (per slash)',
        kind: 'charged',
        scaling: 'atk',
        multiplier: 101.278,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
      {
        name: 'Kamisato Art: Hyouka',
        kind: 'skill',
        scaling: 'atk',
        multiplier: 406.64,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
      {
        name: 'Soumetsu cutting DMG',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 190.91,
        bonus: 'elemental',
        reaction: 'none',
        weight: 6,
      },
      {
        name: 'Soumetsu bloom DMG',
        kind: 'burst',
        scaling: 'atk',
        multiplier: 286.365,
        bonus: 'elemental',
        reaction: 'none',
        weight: 1,
      },
    ],
  },
};

export function getDamageProfile(
  characterKey: string,
): DamageProfile | undefined {
  return DAMAGE_PROFILES[characterKey];
}
