/**
 * Guide builds (ADR-0059): every artifact build the guides list for each
 * character, for the artifact score. Generated on 2026-10-07 from a read of
 * the KQM guides (the quick guide wherever one exists) and genshin-builds.com
 * (Game8 is links only), then checked against the dataset's keys. Not
 * optimizer defaults: `META_TARGETS` stays the only source of those.
 *
 * - Builds from the two guides with the same role (and constellation) are
 *   one build: the main stats either names, the sets either names, KQM's
 *   substats and Energy Recharge minimum. Other builds stay separate.
 * - `erMin` is the guide's figure for that build, the lower bound of the
 *   first case it gives; `erWeapons` are its weapon-specific figures. Both
 *   are shown beside the character's Energy Recharge and never limit the
 *   score.
 * - `unscored` lists builds the guide leaves a main stat or the substats
 *   out of, and why, so the window can say so.
 * - Builds their own guide marks not recommended or out of date were left
 *   out (owner, 2026-10-07).
 * - Varka's KQM goblet is a Pyro, Hydro, Electro or Cryo DMG one over his
 *   own Anemo; only an Anemo one is accepted until a goblet can name an
 *   element.
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';

export type BuildRole =
  | 'on_field_dps'
  | 'off_field_dps'
  | 'support'
  | 'healer'
  | 'shield'
  | 'reaction_dps';

export type GuideSource = 'kqm' | 'genshinBuilds';

export interface GuideBuild {
  /** As the guide names it (a generic name becomes the role). */
  name: string;
  role: BuildRole;
  /** The constellation the build needs, such as "C6". */
  constellation?: string;
  sources: GuideSource[];
  accepts: Record<'sands' | 'goblet' | 'circlet', StatKey[]>;
  /** In the guide's order; flat stats count at 0.4 in the score. */
  substats: StatKey[];
  /** Ranked; a 2+2 names both sets. */
  sets: string[];
  /** Including the base 100%. */
  erMin?: number;
  erWeapons?: { weapon: string; min: number }[];
}

export interface CharacterGuides {
  kqm?: string;
  genshinBuilds?: string;
  builds: GuideBuild[];
  unscored?: { name: string; source: GuideSource; reason: string }[];
}

export const GUIDE_BUILDS: Record<string, CharacterGuides> = {
  aino: {
    kqm: 'https://keqingmains.com/q/aino-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/aino',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'em'],
          goblet: ['em', 'elemental_dmg'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'em', 'crit_dmg', 'atk_pct'],
        sets: [
          'SilkenMoonsSerenade',
          'Instructor',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'DeepwoodMemories',
          'GildedDreams',
          'FlowerOfParadiseLost',
        ],
        erMin: 190,
        erWeapons: [
          {
            weapon: 'Favonius Greatsword',
            min: 155,
          },
          {
            weapon: 'Flame-Forged Insight',
            min: 100,
          },
        ],
      },
    ],
  },
  albedo: {
    kqm: 'https://keqingmains.com/q/albedo-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/albedo',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['def_pct'],
          goblet: ['def_pct', 'elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'def_pct', 'atk_pct'],
        sets: [
          'HuskOfOpulentDreams',
          'GoldenTroupe',
          'ArchaicPetra',
          'TenacityOfTheMillelith',
        ],
        erMin: 120,
      },
    ],
  },
  alhaitham: {
    kqm: 'https://keqingmains.com/q/alhaitham-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/alhaitham',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'GildedDreams',
          'DeepwoodMemories',
          'GoldenTroupe',
          'EmblemOfSeveredFate',
          'MarechausseeHunter',
        ],
        erMin: 105,
      },
    ],
  },
  aloy: {
    kqm: 'https://keqingmains.com/q/aloy-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/aloy',
    builds: [
      {
        name: 'Reverse Melt DPS',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: ['EmblemOfSeveredFate', 'GildedDreams', 'Lavawalker'],
        erMin: 140,
      },
      {
        name: 'Freeze and Mono Cryo',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_dmg', 'crit_rate', 'atk_pct'],
        sets: [
          'NoblesseOblige',
          'BlizzardStrayer',
          'MarechausseeHunter',
          'EmblemOfSeveredFate',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 140,
      },
    ],
  },
  alyosha: {
    kqm: 'https://keqingmains.com/q/alyosha-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/alyosha',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['atk_pct'],
          circlet: ['healing', 'atk_pct', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'atk_pct', 'crit_dmg'],
        sets: [
          'HeartOfTheFurnace',
          'NoblesseOblige',
          'Instructor',
          'DeepwoodMemories',
          'SilkenMoonsSerenade',
          'ScrollOfTheHeroOfCinderCity',
          'SongOfDaysPast',
          'ArchaicPetra',
          'OceanHuedClam',
          'GladiatorsFinale',
          'ADayCarvedFromRisingWinds',
        ],
        erMin: 235,
        erWeapons: [
          {
            weapon: 'Favonius Lance',
            min: 195,
          },
        ],
      },
      {
        name: 'Stellar-Conduct Support Build',
        role: 'support',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['atk_pct'],
          circlet: ['atk_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'atk_pct', 'atk', 'crit_rate'],
        sets: [
          'NoblesseOblige',
          'HeartOfTheFurnace',
          'GladiatorsFinale',
          'ADayCarvedFromRisingWinds',
        ],
        erMin: 180,
      },
    ],
  },
  amber: {
    kqm: 'https://keqingmains.com/q/amber-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/amber',
    builds: [
      {
        name: 'Melt',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct', 'atk'],
        sets: [
          'ShimenawasReminiscence',
          'WanderersTroupe',
          'CrimsonWitchOfFlames',
          'DesertPavilionChronicle',
          'GildedDreams',
        ],
        erMin: 100,
      },
      {
        name: 'Burgeon',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em'],
        sets: ['FlowerOfParadiseLost', 'GildedDreams'],
      },
      {
        name: 'Burst Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'atk'],
        sets: [
          'Instructor',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
          'TheExile',
        ],
        erWeapons: [
          {
            weapon: 'Elegy for the End',
            min: 225,
          },
          {
            weapon: 'Favonius Warbow',
            min: 165,
          },
        ],
      },
    ],
  },
  arataki_itto: {
    kqm: 'https://keqingmains.com/q/itto-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/arataki_itto',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['def_pct'],
          goblet: ['elemental_dmg', 'def_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'def_pct', 'atk_pct'],
        sets: [
          'HuskOfOpulentDreams',
          'MarechausseeHunter',
          'RetracingBolide',
          'LongNightsOath',
          'DesertPavilionChronicle',
          'ArchaicPetra',
          'EmblemOfSeveredFate',
        ],
        erMin: 120,
      },
    ],
  },
  arlecchino: {
    kqm: 'https://keqingmains.com/q/arlecchino-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/arlecchino',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'FragmentOfHarmonicWhimsy',
          'NightOfTheSkysUnveiling',
          'UnfinishedReverie',
          'GladiatorsFinale',
          'EchoesOfAnOffering',
          'DesertPavilionChronicle',
          'RetracingBolide',
          'ShimenawasReminiscence',
          'CrimsonWitchOfFlames',
          'GildedDreams',
          'MarechausseeHunter',
        ],
      },
    ],
  },
  baizhu: {
    kqm: 'https://keqingmains.com/q/baizhu-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/baizhu',
    builds: [
      {
        name: 'Healer',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'healing', 'crit_rate'],
        },
        substats: ['er_pct', 'hp_pct', 'crit_rate'],
        sets: [
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
          'OceanHuedClam',
          'Instructor',
          'SilkenMoonsSerenade',
          'SongOfDaysPast',
          'TenacityOfTheMillelith',
          'VourukashasGlow',
          'EmblemOfSeveredFate',
        ],
        erMin: 320,
        erWeapons: [
          {
            weapon: 'Jadefall’s Splendor R1',
            min: 210,
          },
          {
            weapon: 'Prototype Amber R5',
            min: 250,
          },
          {
            weapon: 'Favonius Codex R5',
            min: 250,
          },
        ],
      },
    ],
  },
  barbara: {
    kqm: 'https://keqingmains.com/q/barbara-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/barbara',
    builds: [
      {
        name: 'Pure Healer/4OHC (Electro-Charged)',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['healing'],
        },
        substats: ['hp_pct', 'hp'],
        sets: [
          'MaidenBeloved',
          'OceanHuedClam',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
        ],
        erMin: 100,
      },
      {
        name: 'Vaporize',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: [
          'crit_rate',
          'crit_dmg',
          'em',
          'atk_pct',
          'hp_pct',
          'atk',
          'hp',
        ],
        sets: [
          'WanderersTroupe',
          'HeartOfDepth',
          'ShimenawasReminiscence',
          'GladiatorsFinale',
        ],
        erMin: 100,
      },
      {
        name: 'Bloom DPS',
        role: 'reaction_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em', 'er_pct'],
        sets: ['FlowerOfParadiseLost', 'GildedDreams', 'OceanHuedClam'],
      },
    ],
  },
  beidou: {
    kqm: 'https://keqingmains.com/q/beidou-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/beidou',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'EmblemOfSeveredFate',
          'Thundersoother',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
        ],
        erMin: 185,
      },
    ],
  },
  bennett: {
    kqm: 'https://keqingmains.com/q/bennett-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/bennett',
    builds: [
      {
        name: 'Healing Support',
        role: 'healer',
        sources: ['kqm'],
        accepts: {
          sands: ['er_pct', 'hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['healing', 'hp_pct'],
        },
        substats: [
          'er_pct',
          'hp_pct',
          'atk_pct',
          'em',
          'crit_rate',
          'crit_dmg',
        ],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
          'TheExile',
          'MaidenBeloved',
        ],
        erMin: 195,
      },
      {
        name: 'Invested Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct', 'er_pct', 'hp_pct'],
          goblet: ['elemental_dmg', 'hp_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'hp_pct', 'healing'],
        },
        substats: [
          'er_pct',
          'crit_rate',
          'crit_dmg',
          'em',
          'atk_pct',
          'hp_pct',
        ],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
          'DeepwoodMemories',
        ],
        erMin: 195,
      },
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: [
          'er_pct',
          'crit_rate',
          'crit_dmg',
          'em',
          'atk_pct',
          'hp_pct',
        ],
        sets: [
          'ThunderingFury',
          'CrimsonWitchOfFlames',
          'MarechausseeHunter',
          'LongNightsOath',
          'GildedDreams',
        ],
        erMin: 100,
      },
      {
        name: 'Burgeon / Overloaded Trigger',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: [
          'er_pct',
          'em',
          'crit_rate',
          'crit_dmg',
          'atk_pct',
          'hp_pct',
        ],
        sets: ['GildedDreams', 'FlowerOfParadiseLost'],
        erMin: 100,
      },
    ],
  },
  candace: {
    kqm: 'https://keqingmains.com/q/candace-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/candace',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct', 'elemental_dmg'],
          circlet: ['hp_pct', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'hp_pct', 'crit_dmg'],
        sets: [
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
          'SilkenMoonsSerenade',
          'EmblemOfSeveredFate',
          'Instructor',
        ],
        erMin: 260,
      },
      {
        name: 'Bloom DPS',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'hp_pct'],
        sets: [
          'FlowerOfParadiseLost',
          'GildedDreams',
          'SilkenMoonsSerenade',
          'DeepwoodMemories',
        ],
        erMin: 260,
      },
    ],
  },
  charlotte: {
    kqm: 'https://keqingmains.com/q/charlotte-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/charlotte',
    builds: [
      {
        name: 'Healer',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['atk_pct', 'elemental_dmg'],
          circlet: ['healing', 'crit_rate', 'atk_pct'],
        },
        substats: ['er_pct', 'atk_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'NoblesseOblige',
          'TenacityOfTheMillelith',
          'OceanHuedClam',
          'BlizzardStrayer',
          'GoldenTroupe',
          'MaidenBeloved',
          'ScrollOfTheHeroOfCinderCity',
          'SongOfDaysPast',
        ],
        erMin: 230,
        erWeapons: [
          {
            weapon: 'Prototype Amber R5',
            min: 185,
          },
        ],
      },
    ],
  },
  chasca: {
    kqm: 'https://keqingmains.com/q/chasca-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/chasca',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['atk_pct', 'elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'er_pct'],
        sets: [
          'ObsidianCodex',
          'MarechausseeHunter',
          'ShimenawasReminiscence',
          'ViridescentVenerer',
          'WanderersTroupe',
          'DesertPavilionChronicle',
        ],
        erMin: 100,
      },
    ],
  },
  chevreuse: {
    kqm: 'https://keqingmains.com/q/chevreuse-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/chevreuse',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'healing'],
        },
        substats: ['er_pct', 'hp_pct', 'hp', 'crit_rate', 'crit_dmg'],
        sets: [
          'NoblesseOblige',
          'SongOfDaysPast',
          'ScrollOfTheHeroOfCinderCity',
          'TenacityOfTheMillelith',
          'OceanHuedClam',
          'MaidenBeloved',
        ],
        erMin: 100,
      },
      {
        name: 'Quickswap DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'hp_pct'],
        sets: [
          'EmblemOfSeveredFate',
          'GoldenTroupe',
          'CrimsonWitchOfFlames',
          'NoblesseOblige',
        ],
        erMin: 100,
      },
    ],
  },
  chiori: {
    kqm: 'https://keqingmains.com/q/chiori-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/chiori',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['def_pct'],
          goblet: ['elemental_dmg', 'def_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'def_pct'],
        },
        substats: ['crit_rate', 'crit_dmg', 'def_pct', 'atk_pct', 'er_pct'],
        sets: ['GoldenTroupe', 'HuskOfOpulentDreams', 'ArchaicPetra'],
      },
    ],
  },
  chongyun: {
    kqm: 'https://keqingmains.com/q/chongyun-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/chongyun',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'NoblesseOblige',
          'EmblemOfSeveredFate',
          'GildedDreams',
          'BlizzardStrayer',
          'Lavawalker',
        ],
        erMin: 150,
      },
      {
        name: 'Infusion Support',
        role: 'support',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'er_pct'],
        sets: ['NoblesseOblige', 'ScrollOfTheHeroOfCinderCity', 'Instructor'],
      },
    ],
  },
  citlali: {
    kqm: 'https://keqingmains.com/q/citlali-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/citlali',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em', 'elemental_dmg'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'ScrollOfTheHeroOfCinderCity',
          'TenacityOfTheMillelith',
          'NoblesseOblige',
          'ArchaicPetra',
          'Instructor',
        ],
        erMin: 170,
      },
    ],
  },
  clorinde: {
    kqm: 'https://keqingmains.com/q/clorinde-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/clorinde',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'FragmentOfHarmonicWhimsy',
          'ThunderingFury',
          'EchoesOfAnOffering',
          'GladiatorsFinale',
        ],
        erMin: 200,
      },
    ],
  },
  collei: {
    kqm: 'https://keqingmains.com/q/collei-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/collei',
    builds: [
      {
        name: 'General Build',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'em', 'atk_pct'],
          goblet: ['elemental_dmg', 'em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
          'TenacityOfTheMillelith',
          'NoblesseOblige',
          'GildedDreams',
          'FlowerOfParadiseLost',
        ],
        erMin: 200,
        erWeapons: [
          {
            weapon: 'Favonius Warbow',
            min: 170,
          },
          {
            weapon: 'Sacrificial Bow',
            min: 160,
          },
        ],
      },
      {
        name: 'Pure Bloom Support',
        role: 'support',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_rate', 'em'],
        sets: [
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
          'TenacityOfTheMillelith',
          'NoblesseOblige',
          'GildedDreams',
          'FlowerOfParadiseLost',
        ],
        erMin: 200,
        erWeapons: [
          {
            weapon: 'Favonius Warbow',
            min: 170,
          },
          {
            weapon: 'Sacrificial Bow',
            min: 160,
          },
        ],
      },
    ],
  },
  columbina: {
    kqm: 'https://keqingmains.com/q/columbina-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/columbina',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'hp_pct'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'hp_pct', 'em', 'hp'],
        sets: [
          'SilkenMoonsSerenade',
          'AubadeOfMorningstarAndMoon',
          'NightOfTheSkysUnveiling',
          'GildedDreams',
          'FlowerOfParadiseLost',
          'TenacityOfTheMillelith',
          'DeepwoodMemories',
          'GoldenTroupe',
        ],
        erMin: 235,
        erWeapons: [
          {
            weapon: 'Prototype Amber / Nocturne’s Curtain Call',
            min: 165,
          },
          {
            weapon: 'Favonius Codex',
            min: 190,
          },
        ],
      },
      {
        name: 'Low Energy Requirement - Off-Field DPS & Buff Support',
        role: 'off_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'hp_pct', 'em'],
        sets: ['SilkenMoonsSerenade', 'AubadeOfMorningstarAndMoon'],
      },
    ],
  },
  cyno: {
    kqm: 'https://keqingmains.com/q/cyno-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/cyno',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct', 'er_pct'],
          goblet: ['elemental_dmg', 'em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'ThunderingFury',
          'GildedDreams',
          'GladiatorsFinale',
          'FlowerOfParadiseLost',
          'MarechausseeHunter',
        ],
        erMin: 140,
      },
      {
        name: 'Aggravate DPS',
        role: 'on_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ThunderingFury',
          'GladiatorsFinale',
          'GildedDreams',
          'Thundersoother',
        ],
      },
    ],
  },
  dahlia: {
    kqm: 'https://keqingmains.com/q/dahlia-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/dahlia',
    builds: [
      {
        name: 'Shield',
        role: 'shield',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_rate', 'hp_pct', 'hp'],
        sets: ['NoblesseOblige', 'ScrollOfTheHeroOfCinderCity', 'ArchaicPetra'],
        erMin: 240,
      },
    ],
  },
  dehya: {
    kqm: 'https://keqingmains.com/q/dehya-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/dehya',
    builds: [
      {
        name: 'Off-Field Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'hp_pct'],
          goblet: ['em', 'hp_pct'],
          circlet: ['crit_rate', 'em', 'hp_pct', 'healing'],
        },
        substats: ['crit_rate', 'em', 'hp_pct'],
        sets: [
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
          'SilkenMoonsSerenade',
          'DeepwoodMemories',
        ],
      },
      {
        name: 'Burgeon',
        role: 'reaction_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em', 'crit_rate', 'hp_pct'],
        sets: [
          'FlowerOfParadiseLost',
          'GildedDreams',
          'DeepwoodMemories',
          'SilkenMoonsSerenade',
          'CrimsonWitchOfFlames',
          'TenacityOfTheMillelith',
        ],
      },
      {
        name: 'On-Field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'em', 'atk_pct', 'hp_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: [
          'er_pct',
          'crit_rate',
          'crit_dmg',
          'em',
          'atk_pct',
          'hp_pct',
        ],
        sets: [
          'MarechausseeHunter',
          'VourukashasGlow',
          'EmblemOfSeveredFate',
          'NightOfTheSkysUnveiling',
          'UnfinishedReverie',
          'LongNightsOath',
        ],
        erMin: 160,
      },
    ],
  },
  diluc: {
    kqm: 'https://keqingmains.com/q/diluc-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/diluc',
    builds: [
      {
        name: 'Vaporize / Melt',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'CrimsonWitchOfFlames',
          'GildedDreams',
          'GladiatorsFinale',
          'MarechausseeHunter',
        ],
        erMin: 120,
      },
      {
        name: 'Mono Pyro',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct'],
        sets: ['Lavawalker', 'CrimsonWitchOfFlames', 'GladiatorsFinale'],
        erMin: 115,
      },
      {
        name: 'Burgeon',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['em', 'elemental_dmg'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['em', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: ['CrimsonWitchOfFlames', 'FlowerOfParadiseLost', 'GildedDreams'],
        erMin: 120,
      },
    ],
  },
  diona: {
    kqm: 'https://keqingmains.com/q/diona-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/diona',
    builds: [
      {
        name: 'Shield',
        role: 'shield',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'healing', 'crit_rate'],
        },
        substats: ['er_pct', 'hp_pct', 'crit_rate', 'hp'],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'SongOfDaysPast',
          'TenacityOfTheMillelith',
          'DeepwoodMemories',
          'Instructor',
          'MaidenBeloved',
          'OceanHuedClam',
        ],
        erMin: 180,
        erWeapons: [
          {
            weapon: 'Sacrificial Bow',
            min: 145,
          },
          {
            weapon: 'Favonius Warbow',
            min: 160,
          },
        ],
      },
    ],
  },
  dori: {
    kqm: 'https://keqingmains.com/q/dori-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/dori',
    builds: [
      {
        name: 'Aggravate',
        role: 'off_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['elemental_dmg', 'em'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: [
          'er_pct',
          'crit_rate',
          'crit_dmg',
          'em',
          'atk_pct',
          'hp_pct',
        ],
        sets: [
          'GildedDreams',
          'ThunderingFury',
          'Thundersoother',
          'NoblesseOblige',
          'DeepwoodMemories',
          'OceanHuedClam',
          'Instructor',
          'TheExile',
        ],
        erMin: 210,
        erWeapons: [
          {
            weapon: 'Favonius (w/ Favonius column)',
            min: 180,
          },
        ],
      },
      {
        name: 'Hyperbloom',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'hp_pct'],
        sets: [
          'GildedDreams',
          'FlowerOfParadiseLost',
          'NoblesseOblige',
          'DeepwoodMemories',
          'OceanHuedClam',
          'Instructor',
          'TheExile',
        ],
        erMin: 210,
        erWeapons: [
          {
            weapon: 'Favonius (w/ Favonius column)',
            min: 180,
          },
        ],
      },
      {
        name: 'Heal Support',
        role: 'healer',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'hp_pct', 'em'],
          goblet: ['hp_pct', 'em'],
          circlet: ['healing', 'hp_pct', 'em'],
        },
        substats: ['crit_rate', 'er_pct', 'hp_pct', 'em'],
        sets: ['NoblesseOblige', 'DeepwoodMemories', 'Instructor', 'TheExile'],
      },
    ],
  },
  durin: {
    kqm: 'https://keqingmains.com/q/durin-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/durin',
    builds: [
      {
        name: 'Support Sets',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'CelestialGift',
          'NoblesseOblige',
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
          'SilkenMoonsSerenade',
          'ADayCarvedFromRisingWinds',
          'EmblemOfSeveredFate',
        ],
        erMin: 120,
      },
      {
        name: 'DPS Sets',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'ADayCarvedFromRisingWinds',
          'NoblesseOblige',
          'CrimsonWitchOfFlames',
          'GildedDreams',
          'FlowerOfParadiseLost',
          'EmblemOfSeveredFate',
          'MarechausseeHunter',
        ],
        erMin: 120,
      },
    ],
  },
  emilie: {
    kqm: 'https://keqingmains.com/q/emilie-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/emilie',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'er_pct'],
        sets: ['UnfinishedReverie', 'DeepwoodMemories', 'GoldenTroupe'],
        erMin: 180,
        erWeapons: [
          {
            weapon: 'Lumidouce Elegy',
            min: 135,
          },
        ],
      },
    ],
  },
  escoffier: {
    kqm: 'https://keqingmains.com/q/escoffier-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/escoffier',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'GoldenTroupe',
          'BlizzardStrayer',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
        ],
        erMin: 120,
      },
    ],
  },
  eula: {
    kqm: 'https://keqingmains.com/q/eula-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/eula',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['physical_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'atk'],
        sets: [
          'PaleFlame',
          'EmblemOfSeveredFate',
          'BloodstainedChivalry',
          'GladiatorsFinale',
        ],
        erMin: 140,
      },
    ],
  },
  faruzan: {
    kqm: 'https://keqingmains.com/q/faruzan-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/faruzan',
    builds: [
      {
        name: 'C6',
        role: 'support',
        constellation: 'C6',
        sources: ['kqm'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'TenacityOfTheMillelith',
          'GoldenTroupe',
          'NoblesseOblige',
          'ViridescentVenerer',
          'TheExile',
          'EmblemOfSeveredFate',
        ],
        erMin: 175,
      },
      {
        name: 'Buff Support',
        role: 'support',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'ViridescentVenerer',
          'EmblemOfSeveredFate',
          'GoldenTroupe',
          'TenacityOfTheMillelith',
        ],
      },
    ],
    unscored: [
      {
        name: 'Pre-C6',
        source: 'kqm',
        reason: 'the guide gives no goblet main stat',
      },
    ],
  },
  fischl: {
    kqm: 'https://keqingmains.com/q/fischl-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/fischl',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'GoldenTroupe',
          'Thundersoother',
          'GildedDreams',
          'TenacityOfTheMillelith',
          'ADayCarvedFromRisingWinds',
          'ThunderingFury',
        ],
        erMin: 120,
      },
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'physical_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: ['GoldenTroupe', 'PaleFlame'],
        erMin: 110,
      },
      {
        name: 'Off-Field Aggravate DPS',
        role: 'off_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'GoldenTroupe',
          'ADayCarvedFromRisingWinds',
          'GildedDreams',
          'ThunderingFury',
          'Thundersoother',
        ],
      },
    ],
  },
  flins: {
    kqm: 'https://keqingmains.com/q/flins-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/flins',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['atk_pct', 'em'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'NightOfTheSkysUnveiling',
          'MarechausseeHunter',
          'ThunderingFury',
          'GildedDreams',
        ],
        erMin: 100,
      },
    ],
  },
  freminet: {
    kqm: 'https://keqingmains.com/q/freminet-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/freminet',
    builds: [
      {
        name: 'Cryo Skill DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg', 'atk_pct', 'physical_dmg'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'BlizzardStrayer',
          'GoldenTroupe',
          'MarechausseeHunter',
          'PaleFlame',
          'EmblemOfSeveredFate',
          'GladiatorsFinale',
        ],
        erMin: 150,
      },
      {
        name: 'Physical Skill DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['physical_dmg', 'atk_pct', 'elemental_dmg'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'PaleFlame',
          'MarechausseeHunter',
          'BlizzardStrayer',
          'GoldenTroupe',
        ],
        erMin: 150,
      },
      {
        name: 'Plunging Attack DPS',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['physical_dmg', 'elemental_dmg', 'atk_pct'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: ['LongNightsOath', 'PaleFlame', 'MarechausseeHunter'],
      },
    ],
  },
  furina: {
    kqm: 'https://keqingmains.com/q/furina-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/furina',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct', 'elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_dmg', 'crit_rate', 'hp_pct'],
        sets: [
          'GoldenTroupe',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'SilkenMoonsSerenade',
          'MarechausseeHunter',
        ],
        erMin: 200,
      },
    ],
  },
  gaming: {
    kqm: 'https://keqingmains.com/q/gaming-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/gaming',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'CrimsonWitchOfFlames',
          'LongNightsOath',
          'GildedDreams',
          'MarechausseeHunter',
          'VermillionHereafter',
        ],
        erMin: 150,
      },
    ],
  },
  ganyu: {
    kqm: 'https://keqingmains.com/q/ganyu-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/ganyu',
    builds: [
      {
        name: 'Freeze',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg', 'atk_pct'],
        },
        substats: ['er_pct', 'crit_dmg', 'atk_pct', 'crit_rate'],
        sets: [
          'BlizzardStrayer',
          'MarechausseeHunter',
          'WanderersTroupe',
          'ShimenawasReminiscence',
          'GildedDreams',
          'UnfinishedReverie',
        ],
        erMin: 110,
      },
      {
        name: 'Melt',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['em', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'WanderersTroupe',
          'ShimenawasReminiscence',
          'UnfinishedReverie',
          'BlizzardStrayer',
          'MarechausseeHunter',
        ],
      },
      {
        name: 'Support',
        role: 'off_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg', 'atk_pct'],
        },
        substats: ['er_pct', 'crit_dmg', 'atk_pct', 'crit_rate'],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'EmblemOfSeveredFate',
        ],
        erMin: 105,
      },
      {
        name: 'Mono Cryo DPS',
        role: 'on_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'er_pct'],
        sets: ['BlizzardStrayer'],
      },
    ],
  },
  gorou: {
    kqm: 'https://keqingmains.com/q/gorou-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/gorou',
    builds: [
      {
        name: 'Buff Support',
        role: 'support',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['er_pct'],
          goblet: ['elemental_dmg', 'def_pct'],
          circlet: ['crit_rate', 'def_pct', 'healing'],
        },
        substats: ['er_pct', 'def_pct', 'crit_rate'],
        sets: [
          'TheExile',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'EmblemOfSeveredFate',
          'SilkenMoonsSerenade',
          'Instructor',
        ],
      },
    ],
    unscored: [
      {
        name: 'Support',
        source: 'kqm',
        reason: 'the guide gives no goblet main stat',
      },
    ],
  },
  hu_tao: {
    kqm: 'https://keqingmains.com/q/hu-tao-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/hu_tao',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'hp_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: [
          'em',
          'crit_rate',
          'crit_dmg',
          'hp_pct',
          'atk_pct',
          'hp',
          'atk',
          'er_pct',
        ],
        sets: [
          'CrimsonWitchOfFlames',
          'ShimenawasReminiscence',
          'GildedDreams',
          'MarechausseeHunter',
        ],
      },
    ],
  },
  iansan: {
    kqm: 'https://keqingmains.com/q/iansan-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/iansan',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['atk_pct'],
          circlet: ['atk_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'atk_pct', 'crit_rate'],
        sets: ['ScrollOfTheHeroOfCinderCity', 'NoblesseOblige'],
        erMin: 220,
        erWeapons: [
          {
            weapon: 'Favonius Lance',
            min: 180,
          },
        ],
      },
    ],
  },
  ifa: {
    kqm: 'https://keqingmains.com/q/ifa-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/ifa',
    builds: [
      {
        name: 'Healer / On-Field Swirl DPS',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em', 'healing'],
        },
        substats: ['er_pct', 'em', 'crit_rate'],
        sets: [
          'ViridescentVenerer',
          'ScrollOfTheHeroOfCinderCity',
          'GildedDreams',
        ],
        erMin: 160,
        erWeapons: [
          {
            weapon: 'Prototype Amber',
            min: 105,
          },
        ],
      },
      {
        name: 'Anemo DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ViridescentVenerer',
          'ObsidianCodex',
          'MarechausseeHunter',
          'NightOfTheSkysUnveiling',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 160,
        erWeapons: [
          {
            weapon: 'Prototype Amber',
            min: 105,
          },
        ],
      },
    ],
  },
  illuga: {
    kqm: 'https://keqingmains.com/q/illuga-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/illuga',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em', 'crit_rate'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'def_pct', 'def'],
        sets: [
          'SilkenMoonsSerenade',
          'Instructor',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
          'TheExile',
          'TenacityOfTheMillelith',
        ],
        erMin: 165,
      },
    ],
  },
  ineffa: {
    kqm: 'https://keqingmains.com/q/ineffa-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/ineffa',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em', 'er_pct'],
          goblet: ['atk_pct', 'em'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'AubadeOfMorningstarAndMoon',
          'SilkenMoonsSerenade',
          'GildedDreams',
          'NightOfTheSkysUnveiling',
          'ThunderingFury',
          'TenacityOfTheMillelith',
          'NoblesseOblige',
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'GoldenTroupe',
          'FlowerOfParadiseLost',
          'ADayCarvedFromRisingWinds',
        ],
        erMin: 100,
      },
    ],
  },
  jahoda: {
    kqm: 'https://keqingmains.com/q/jahoda-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/jahoda',
    builds: [
      {
        name: 'Healer',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['atk_pct'],
          circlet: ['crit_rate', 'healing', 'atk_pct'],
        },
        substats: ['er_pct', 'atk_pct', 'crit_rate', 'crit_dmg', 'em'],
        sets: [
          'ViridescentVenerer',
          'SilkenMoonsSerenade',
          'TenacityOfTheMillelith',
          'Instructor',
          'DeepwoodMemories',
        ],
        erMin: 225,
        erWeapons: [
          {
            weapon: 'Favonius Warbow',
            min: 190,
          },
        ],
      },
    ],
  },
  jean: {
    kqm: 'https://keqingmains.com/q/jean-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/jean',
    builds: [
      {
        name: 'Support',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'healing'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ViridescentVenerer',
          'NoblesseOblige',
          'OceanHuedClam',
          'EmblemOfSeveredFate',
        ],
        erMin: 160,
      },
      {
        name: 'Sunfire',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: ['ViridescentVenerer'],
        erMin: 160,
      },
    ],
  },
  kachina: {
    kqm: 'https://keqingmains.com/q/kachina-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kachina',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['def_pct', 'er_pct'],
          goblet: ['elemental_dmg', 'def_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'def_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
          'NoblesseOblige',
          'TenacityOfTheMillelith',
          'ObsidianCodex',
        ],
        erMin: 280,
        erWeapons: [
          {
            weapon: 'Favonius Lance',
            min: 210,
          },
        ],
      },
    ],
  },
  kaedehara_kazuha: {
    kqm: 'https://keqingmains.com/q/kazuha-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kaedehara_kazuha',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em', 'atk_pct', 'crit_rate', 'crit_dmg'],
        sets: ['ViridescentVenerer', 'ThunderingFury'],
        erMin: 190,
        erWeapons: [
          {
            weapon: 'Favonius Sword',
            min: 160,
          },
        ],
      },
    ],
  },
  kaeya: {
    kqm: 'https://keqingmains.com/q/kaeya-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kaeya',
    builds: [
      {
        name: 'DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'BlizzardStrayer',
          'EmblemOfSeveredFate',
          'GildedDreams',
          'MarechausseeHunter',
          'UnfinishedReverie',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 230,
      },
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm'],
        accepts: {
          sands: ['er_pct', 'atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate'],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
          'Instructor',
        ],
        erMin: 230,
      },
      {
        name: 'Reverse Melt',
        role: 'off_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'EmblemOfSeveredFate',
          'GildedDreams',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
        ],
      },
    ],
  },
  kamisato_ayaka: {
    kqm: 'https://keqingmains.com/q/ayaka-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kamisato_ayaka',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'atk_pct'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: ['BlizzardStrayer', 'MarechausseeHunter', 'NoblesseOblige'],
        erMin: 130,
      },
    ],
  },
  kamisato_ayato: {
    kqm: 'https://keqingmains.com/q/ayato-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kamisato_ayato',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'hp_pct'],
        sets: [
          'HeartOfDepth',
          'GladiatorsFinale',
          'NymphsDream',
          'EchoesOfAnOffering',
          'MarechausseeHunter',
          'BlizzardStrayer',
          'ThunderingFury',
          'NightOfTheSkysUnveiling',
          'UnfinishedReverie',
          'EmblemOfSeveredFate',
        ],
        erMin: 130,
      },
    ],
  },
  kaveh: {
    kqm: 'https://keqingmains.com/q/kaveh-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kaveh',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm'],
        accepts: {
          sands: ['er_pct', 'em'],
          goblet: ['em'],
          circlet: ['em', 'crit_rate', 'healing'],
        },
        substats: ['er_pct', 'crit_rate', 'em', 'atk_pct', 'crit_dmg'],
        sets: [
          'DeepwoodMemories',
          'OceanHuedClam',
          'Instructor',
          'FlowerOfParadiseLost',
          'GildedDreams',
        ],
        erMin: 210,
        erWeapons: [
          {
            weapon: 'Favonius Greatsword',
            min: 160,
          },
        ],
      },
      {
        name: 'Bloom / Burgeon Driver',
        role: 'reaction_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'em'],
          goblet: ['em'],
          circlet: ['em', 'crit_rate'],
        },
        substats: ['er_pct', 'em', 'crit_rate'],
        sets: [
          'DeepwoodMemories',
          'OceanHuedClam',
          'FlowerOfParadiseLost',
          'Instructor',
          'GildedDreams',
        ],
      },
    ],
  },
  keqing: {
    kqm: 'https://keqingmains.com/q/keqing-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/keqing',
    builds: [
      {
        name: 'Dendro',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ThunderingFury',
          'GildedDreams',
          'Thundersoother',
          'MarechausseeHunter',
          'UnfinishedReverie',
          'NightOfTheSkysUnveiling',
          'FlowerOfParadiseLost',
        ],
      },
      {
        name: 'Overload',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'ThunderingFury',
          'MarechausseeHunter',
          'Thundersoother',
          'FragmentOfHarmonicWhimsy',
          'GildedDreams',
        ],
      },
      {
        name: 'Lunar-Charged',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'MarechausseeHunter',
          'NightOfTheSkysUnveiling',
          'Thundersoother',
          'ThunderingFury',
          'GildedDreams',
          'FragmentOfHarmonicWhimsy',
        ],
      },
    ],
  },
  kinich: {
    kqm: 'https://keqingmains.com/q/kinich-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kinich',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'er_pct'],
        sets: [
          'ObsidianCodex',
          'UnfinishedReverie',
          'MarechausseeHunter',
          'GoldenTroupe',
          'DeepwoodMemories',
        ],
        erMin: 100,
      },
    ],
  },
  kirara: {
    kqm: 'https://keqingmains.com/q/kirara-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kirara',
    builds: [
      {
        name: 'Shield',
        role: 'shield',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'hp_pct', 'crit_rate'],
        sets: [
          'Instructor',
          'TenacityOfTheMillelith',
          'DeepwoodMemories',
          'NoblesseOblige',
          'VourukashasGlow',
        ],
        erMin: 160,
      },
    ],
  },
  klee: {
    kqm: 'https://keqingmains.com/q/klee-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/klee',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'ADayCarvedFromRisingWinds',
          'CrimsonWitchOfFlames',
          'MarechausseeHunter',
          'NightOfTheSkysUnveiling',
          'UnfinishedReverie',
          'GildedDreams',
          'WanderersTroupe',
          'FragmentOfHarmonicWhimsy',
          'Lavawalker',
          'EchoesOfAnOffering',
          'DesertPavilionChronicle',
        ],
        erMin: 125,
      },
    ],
  },
  kujou_sara: {
    kqm: 'https://keqingmains.com/q/sara-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kujou_sara',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'atk'],
        sets: [
          'EmblemOfSeveredFate',
          'NoblesseOblige',
          'TenacityOfTheMillelith',
        ],
        erMin: 140,
      },
    ],
  },
  kuki_shinobu: {
    kqm: 'https://keqingmains.com/q/shinobu-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/kuki_shinobu',
    builds: [
      {
        name: 'Hyperbloom',
        role: 'reaction_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em', 'er_pct', 'hp_pct'],
        sets: [
          'FlowerOfParadiseLost',
          'GildedDreams',
          'ThunderingFury',
          'DeepwoodMemories',
        ],
        erMin: 135,
      },
      {
        name: 'Quicken',
        role: 'off_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['elemental_dmg', 'em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'hp_pct'],
        sets: [
          'Instructor',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'DeepwoodMemories',
          'NoblesseOblige',
          'GoldenTroupe',
          'EmblemOfSeveredFate',
          'ThunderingFury',
          'GildedDreams',
        ],
        erMin: 160,
      },
      {
        name: 'Pure Healer',
        role: 'healer',
        sources: ['kqm'],
        accepts: {
          sands: ['hp_pct', 'em'],
          goblet: ['hp_pct', 'em'],
          circlet: ['healing', 'hp_pct', 'em'],
        },
        substats: ['hp_pct', 'em', 'er_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'TenacityOfTheMillelith',
          'NoblesseOblige',
          'OceanHuedClam',
          'SongOfDaysPast',
          'ScrollOfTheHeroOfCinderCity',
        ],
      },
    ],
  },
  lan_yan: {
    kqm: 'https://keqingmains.com/q/lan-yan-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/lan_yan',
    builds: [
      {
        name: 'Off-Field Shield Support',
        role: 'shield',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct', 'em'],
          goblet: ['atk_pct', 'elemental_dmg'],
          circlet: ['atk_pct', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ViridescentVenerer',
          'ScrollOfTheHeroOfCinderCity',
          'GoldenTroupe',
        ],
        erMin: 215,
      },
      {
        name: 'On-Field-Reaction Driver',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em', 'atk_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'ViridescentVenerer',
          'ScrollOfTheHeroOfCinderCity',
          'GoldenTroupe',
        ],
        erMin: 215,
      },
    ],
  },
  lauma: {
    kqm: 'https://keqingmains.com/q/lauma-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/lauma',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg'],
        sets: [
          'SilkenMoonsSerenade',
          'DeepwoodMemories',
          'GildedDreams',
          'NightOfTheSkysUnveiling',
        ],
        erMin: 170,
      },
    ],
  },
  layla: {
    kqm: 'https://keqingmains.com/q/layla-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/layla',
    builds: [
      {
        name: 'Shield',
        role: 'shield',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct', 'elemental_dmg'],
          circlet: ['hp_pct', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'hp_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'TenacityOfTheMillelith',
          'BlizzardStrayer',
          'EmblemOfSeveredFate',
          'NoblesseOblige',
          'VourukashasGlow',
          'Instructor',
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 220,
      },
      {
        name: 'Shield Support And Damage',
        role: 'shield',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['elemental_dmg', 'hp_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'hp_pct'],
        },
        substats: [
          'er_pct',
          'crit_rate',
          'crit_dmg',
          'hp_pct',
          'atk_pct',
          'hp',
        ],
        sets: [
          'TenacityOfTheMillelith',
          'BlizzardStrayer',
          'NoblesseOblige',
          'EmblemOfSeveredFate',
        ],
      },
    ],
  },
  linnea: {
    kqm: 'https://keqingmains.com/q/linnea-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/linnea',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['def_pct', 'er_pct'],
          goblet: ['def_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'def_pct'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'def_pct', 'em'],
        sets: [
          'HuskOfOpulentDreams',
          'AubadeOfMorningstarAndMoon',
          'SilkenMoonsSerenade',
          'Instructor',
          'TenacityOfTheMillelith',
        ],
      },
    ],
  },
  lisa: {
    kqm: 'https://keqingmains.com/q/lisa-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/lisa',
    builds: [
      {
        name: 'On-Field Electro DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'er_pct', 'atk_pct', 'em', 'atk'],
        sets: [
          'ThunderingFury',
          'GildedDreams',
          'MarechausseeHunter',
          'Thundersoother',
        ],
        erMin: 100,
      },
      {
        name: 'Off-Field Electro DPS / Support',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'EmblemOfSeveredFate',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
          'GildedDreams',
          'Thundersoother',
        ],
        erMin: 170,
      },
    ],
  },
  lohen: {
    kqm: 'https://keqingmains.com/q/lohen-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/lohen',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ADayCarvedFromRisingWinds',
          'ShimenawasReminiscence',
          'UnfinishedReverie',
          'MarechausseeHunter',
          'BlizzardStrayer',
          'DesertPavilionChronicle',
        ],
      },
    ],
  },
  lynette: {
    kqm: 'https://keqingmains.com/q/lynette-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/lynette',
    builds: [
      {
        name: 'General Support / Damage Dealer',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'ViridescentVenerer',
          'EmblemOfSeveredFate',
          'NoblesseOblige',
          'MarechausseeHunter',
          'DesertPavilionChronicle',
        ],
        erMin: 140,
        erWeapons: [
          {
            weapon: 'Favonius Sword',
            min: 115,
          },
        ],
      },
      {
        name: 'Transformative Reaction–Focused',
        role: 'reaction_dps',
        constellation: 'C6',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em'],
        sets: ['ViridescentVenerer', 'GildedDreams', 'FlowerOfParadiseLost'],
        erMin: 140,
        erWeapons: [
          {
            weapon: 'Favonius Sword',
            min: 115,
          },
        ],
      },
    ],
  },
  lyney: {
    kqm: 'https://keqingmains.com/q/lyney-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/lyney',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'atk', 'er_pct'],
        sets: [
          'MarechausseeHunter',
          'Lavawalker',
          'VermillionHereafter',
          'ShimenawasReminiscence',
          'WanderersTroupe',
          'RetracingBolide',
          'DesertPavilionChronicle',
        ],
        erMin: 125,
      },
    ],
  },
  mavuika: {
    kqm: 'https://keqingmains.com/q/mavuika-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/mavuika',
    builds: [
      {
        name: 'On-Field',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'em', 'atk_pct', 'atk'],
        sets: [
          'ObsidianCodex',
          'MarechausseeHunter',
          'GildedDreams',
          'UnfinishedReverie',
          'CrimsonWitchOfFlames',
          'ScrollOfTheHeroOfCinderCity',
          'DeepwoodMemories',
        ],
      },
      {
        name: 'Off-Field',
        role: 'off_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'em', 'atk_pct', 'atk'],
        sets: [
          'ScrollOfTheHeroOfCinderCity',
          'TenacityOfTheMillelith',
          'ArchaicPetra',
          'Instructor',
          'DeepwoodMemories',
          'ObsidianCodex',
          'GoldenTroupe',
        ],
      },
    ],
  },
  mika: {
    kqm: 'https://keqingmains.com/q/mika-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/mika',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['crit_rate', 'healing', 'hp_pct'],
        },
        substats: ['er_pct', 'crit_rate', 'hp_pct'],
        sets: [
          'NoblesseOblige',
          'OceanHuedClam',
          'SongOfDaysPast',
          'TheExile',
          'MaidenBeloved',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 190,
        erWeapons: [
          {
            weapon: 'Dialogues of the Desert Sages R5',
            min: 105,
          },
          {
            weapon: 'Rightful Reward R3',
            min: 160,
          },
          {
            weapon: 'Favonius Lance',
            min: 175,
          },
        ],
      },
    ],
  },
  mona: {
    kqm: 'https://keqingmains.com/q/mona-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/mona',
    builds: [
      {
        name: 'Support Mona',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'CelestialGift',
          'NoblesseOblige',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'DeepwoodMemories',
          'SilkenMoonsSerenade',
          'Instructor',
        ],
        erMin: 260,
        erWeapons: [
          {
            weapon: 'Favonius Codex',
            min: 210,
          },
          {
            weapon: 'Prototype Amber',
            min: 150,
          },
        ],
      },
    ],
  },
  mualani: {
    kqm: 'https://keqingmains.com/q/mualani-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/mualani',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'em'],
          goblet: ['elemental_dmg', 'hp_pct'],
          circlet: ['crit_dmg', 'hp_pct', 'crit_rate', 'em'],
        },
        substats: ['crit_rate', 'crit_dmg', 'hp_pct', 'em'],
        sets: [
          'ObsidianCodex',
          'UnfinishedReverie',
          'HeartOfDepth',
          'MarechausseeHunter',
        ],
      },
    ],
  },
  nahida: {
    kqm: 'https://keqingmains.com/q/nahida-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/nahida',
    builds: [
      {
        name: 'Off-Field',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em'],
          goblet: ['em', 'elemental_dmg'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg'],
        sets: [
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'TenacityOfTheMillelith',
          'GoldenTroupe',
          'GildedDreams',
          'Instructor',
          'FlowerOfParadiseLost',
        ],
        erMin: 100,
      },
      {
        name: 'On-Field',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em', 'elemental_dmg'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'TenacityOfTheMillelith',
          'GoldenTroupe',
          'GildedDreams',
          'Instructor',
        ],
        erMin: 100,
      },
      {
        name: 'Nilou Bloom',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em', 'elemental_dmg'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg'],
        sets: [
          'DeepwoodMemories',
          'ScrollOfTheHeroOfCinderCity',
          'TenacityOfTheMillelith',
          'GoldenTroupe',
          'GildedDreams',
          'Instructor',
        ],
        erMin: 120,
      },
    ],
  },
  navia: {
    kqm: 'https://keqingmains.com/q/navia-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/navia',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'NighttimeWhispersInTheEchoingWoods',
          'MarechausseeHunter',
          'GoldenTroupe',
        ],
        erMin: 100,
      },
    ],
  },
  nefer: {
    kqm: 'https://keqingmains.com/q/nefer-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/nefer',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em'],
        sets: ['NightOfTheSkysUnveiling', 'GildedDreams'],
        erMin: 100,
      },
    ],
  },
  neuvillette: {
    kqm: 'https://keqingmains.com/q/neuvillette-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/neuvillette',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct'],
          goblet: ['elemental_dmg', 'hp_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'hp_pct'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'hp_pct', 'hp'],
        sets: [
          'MarechausseeHunter',
          'HeartOfDepth',
          'NightOfTheSkysUnveiling',
          'RetracingBolide',
          'WanderersTroupe',
          'NymphsDream',
        ],
        erMin: 100,
        erWeapons: [
          {
            weapon: 'Prototype Amber R5',
            min: 100,
          },
          {
            weapon: 'Tome of the Eternal Flow R1',
            min: 100,
          },
        ],
      },
    ],
  },
  nicole: {
    kqm: 'https://keqingmains.com/q/nicole-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/nicole',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['atk_pct'],
          circlet: ['atk_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'atk_pct', 'atk'],
        sets: [
          'CelestialGift',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
        ],
      },
    ],
  },
  nilou: {
    kqm: 'https://keqingmains.com/q/nilou-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/nilou',
    builds: [
      {
        name: 'Bountiful Bloom',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct'],
        },
        substats: ['er_pct', 'hp_pct', 'em', 'hp', 'crit_rate', 'crit_dmg'],
        sets: [
          'TenacityOfTheMillelith',
          'VourukashasGlow',
          'FlowerOfParadiseLost',
          'DeepwoodMemories',
        ],
      },
      {
        name: 'Lunar-Bloom',
        role: 'support',
        sources: ['kqm'],
        accepts: {
          sands: ['hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct'],
        },
        substats: ['er_pct', 'hp_pct', 'em', 'hp', 'crit_rate', 'crit_dmg'],
        sets: ['SilkenMoonsSerenade', 'Instructor', 'DeepwoodMemories'],
      },
    ],
  },
  ningguang: {
    kqm: 'https://keqingmains.com/q/ningguang-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/ningguang',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'NighttimeWhispersInTheEchoingWoods',
          'MarechausseeHunter',
          'UnfinishedReverie',
          'Thundersoother',
          'Lavawalker',
          'EmblemOfSeveredFate',
          'HuskOfOpulentDreams',
          'ArchaicPetra',
        ],
        erMin: 110,
      },
    ],
  },
  noelle: {
    kqm: 'https://keqingmains.com/q/noelle-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/noelle',
    builds: [
      {
        name: 'C0–C5 and Burst Talent Level 9',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'def_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'def_pct'],
        sets: [
          'HuskOfOpulentDreams',
          'NightOfTheSkysUnveiling',
          'MarechausseeHunter',
          'GladiatorsFinale',
          'RetracingBolide',
          'ArchaicPetra',
        ],
        erMin: 200,
      },
      {
        name: 'C6 or Burst Talent Level 10+',
        role: 'on_field_dps',
        constellation: 'C6',
        sources: ['kqm'],
        accepts: {
          sands: ['def_pct'],
          goblet: ['elemental_dmg', 'def_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'def_pct'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'def_pct', 'atk_pct'],
        sets: [
          'HuskOfOpulentDreams',
          'NightOfTheSkysUnveiling',
          'MarechausseeHunter',
          'GladiatorsFinale',
          'RetracingBolide',
          'ArchaicPetra',
        ],
        erMin: 200,
      },
      {
        name: 'Driver',
        role: 'on_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['def_pct'],
          goblet: ['elemental_dmg', 'def_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'def_pct'],
        },
        substats: ['crit_rate', 'crit_dmg', 'er_pct', 'def_pct'],
        sets: ['ArchaicPetra'],
      },
    ],
  },
  odette: {
    kqm: 'https://keqingmains.com/q/odette-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/odette',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'HeartOfTheFurnace',
          'DisenchantmentInDeepShadow',
          'ADayCarvedFromRisingWinds',
          'BlizzardStrayer',
          'TenacityOfTheMillelith',
        ],
      },
      {
        name: 'Stellar Support / Enabler',
        role: 'support',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_dmg', 'crit_rate', 'atk_pct', 'er_pct', 'em'],
        sets: [
          'HeartOfTheFurnace',
          'DisenchantmentInDeepShadow',
          'GladiatorsFinale',
          'ADayCarvedFromRisingWinds',
        ],
      },
    ],
  },
  ororon: {
    kqm: 'https://keqingmains.com/q/ororon-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/ororon',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct', 'em'],
          goblet: ['elemental_dmg', 'atk_pct', 'em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
          'Instructor',
          'EmblemOfSeveredFate',
        ],
        erMin: 160,
      },
    ],
  },
  prune: {
    kqm: 'https://keqingmains.com/q/prune-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/prune',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['atk_pct'],
          circlet: ['atk_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'atk_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'ViridescentVenerer',
          'CelestialGift',
          'ScrollOfTheHeroOfCinderCity',
          'NoblesseOblige',
        ],
        erMin: 185,
      },
    ],
  },
  qiqi: {
    kqm: 'https://keqingmains.com/q/qiqi-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/qiqi',
    builds: [
      {
        name: 'Healer',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['atk_pct'],
          circlet: ['crit_rate', 'atk_pct', 'healing'],
        },
        substats: ['er_pct', 'atk_pct', 'crit_rate', 'atk'],
        sets: [
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
          'NoblesseOblige',
          'OceanHuedClam',
          'SongOfDaysPast',
        ],
      },
    ],
  },
  raiden_shogun: {
    kqm: 'https://keqingmains.com/q/raiden-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/raiden_shogun',
    builds: [
      {
        name: 'On-Field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct', 'em'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'EmblemOfSeveredFate',
          'MarechausseeHunter',
          'GildedDreams',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 200,
      },
      {
        name: 'Hyperbloom / Overloaded Trigger',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em'],
        sets: [
          'FlowerOfParadiseLost',
          'GildedDreams',
          'DeepwoodMemories',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
        ],
      },
    ],
  },
  razor: {
    kqm: 'https://keqingmains.com/q/razor-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/razor',
    builds: [
      {
        name: 'Physical',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['physical_dmg', 'atk_pct', 'elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'PaleFlame',
          'ThunderingFury',
          'GildedDreams',
          'Thundersoother',
          'GladiatorsFinale',
          'MarechausseeHunter',
          'ADayCarvedFromRisingWinds',
          'EchoesOfAnOffering',
          'EmblemOfSeveredFate',
        ],
        erMin: 100,
      },
      {
        name: 'Aggravate',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'PaleFlame',
          'ThunderingFury',
          'GildedDreams',
          'Thundersoother',
          'GladiatorsFinale',
          'MarechausseeHunter',
        ],
        erMin: 100,
      },
      {
        name: 'Transformative Reaction',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em', 'crit_rate'],
        },
        substats: ['er_pct', 'em', 'crit_rate'],
        sets: ['GildedDreams', 'ThunderingFury', 'FlowerOfParadiseLost'],
        erMin: 100,
      },
    ],
  },
  rosaria: {
    kqm: 'https://keqingmains.com/q/rosaria-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/rosaria',
    builds: [
      {
        name: 'Reverse Melt',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'GildedDreams',
          'Lavawalker',
          'UnfinishedReverie',
          'EmblemOfSeveredFate',
        ],
        erMin: 200,
      },
      {
        name: 'Freeze / Mono Cryo',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_dmg', 'crit_rate', 'atk_pct'],
        sets: [
          'BlizzardStrayer',
          'MarechausseeHunter',
          'EmblemOfSeveredFate',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
        ],
        erMin: 195,
      },
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'EmblemOfSeveredFate',
          'ArchaicPetra',
          'Instructor',
        ],
      },
    ],
  },
  sandrone: {
    kqm: 'https://keqingmains.com/q/sandrone-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/sandrone',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['atk_pct', 'em'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'DisenchantmentInDeepShadow',
          'GildedDreams',
          'ADayCarvedFromRisingWinds',
          'GladiatorsFinale',
        ],
        erMin: 130,
      },
      {
        name: 'Sandrone DPS Build',
        role: 'on_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['atk_pct', 'em'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_dmg', 'crit_rate', 'atk', 'em'],
        sets: [
          'DisenchantmentInDeepShadow',
          'GildedDreams',
          'GladiatorsFinale',
          'ADayCarvedFromRisingWinds',
        ],
        erMin: 125,
      },
      {
        name: 'Stellar-Conduct Build',
        role: 'on_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['atk_pct', 'em'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['er_pct', 'crit_dmg', 'crit_rate', 'atk_pct', 'em'],
        sets: [
          'DisenchantmentInDeepShadow',
          'GildedDreams',
          'GladiatorsFinale',
          'ADayCarvedFromRisingWinds',
        ],
        erMin: 125,
      },
    ],
  },
  sangonomiya_kokomi: {
    kqm: 'https://keqingmains.com/q/kokomi-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/sangonomiya_kokomi',
    builds: [
      {
        name: 'On-Field Healer / Enabler',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['elemental_dmg', 'hp_pct'],
          circlet: ['healing', 'hp_pct'],
        },
        substats: ['er_pct', 'hp_pct', 'hp'],
        sets: [
          'OceanHuedClam',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'DeepwoodMemories',
          'SilkenMoonsSerenade',
          'SongOfDaysPast',
          'MaidenBeloved',
        ],
        erMin: 195,
        erWeapons: [
          {
            weapon: 'Prototype Amber R1',
            min: 160,
          },
          {
            weapon: 'Prototype Amber R5',
            min: 145,
          },
        ],
      },
      {
        name: 'Off-Field Support',
        role: 'healer',
        sources: ['kqm'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct'],
          circlet: ['healing'],
        },
        substats: ['er_pct', 'hp_pct', 'hp'],
        sets: [
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'SongOfDaysPast',
          'DeepwoodMemories',
          'SilkenMoonsSerenade',
          'Instructor',
          'OceanHuedClam',
        ],
        erMin: 260,
        erWeapons: [
          {
            weapon: 'Prototype Amber R1',
            min: 215,
          },
          {
            weapon: 'Prototype Amber R5',
            min: 195,
          },
        ],
      },
      {
        name: 'Bloom DPS',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct', 'hp_pct'],
          goblet: ['em', 'hp_pct'],
          circlet: ['em', 'healing'],
        },
        substats: ['er_pct', 'em', 'hp_pct', 'hp'],
        sets: [
          'FlowerOfParadiseLost',
          'GildedDreams',
          'DeepwoodMemories',
          'OceanHuedClam',
        ],
      },
    ],
  },
  sayu: {
    kqm: 'https://keqingmains.com/q/sayu-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/sayu',
    builds: [
      {
        name: 'Off-Field Burst Support',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct', 'em'],
          goblet: ['atk_pct', 'em'],
          circlet: ['healing', 'atk_pct', 'em', 'crit_rate'],
        },
        substats: ['er_pct', 'atk_pct', 'em'],
        sets: [
          'ViridescentVenerer',
          'DeepwoodMemories',
          'NoblesseOblige',
          'OceanHuedClam',
        ],
        erMin: 200,
      },
      {
        name: 'On-Field Driver (ADC)',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'ViridescentVenerer',
          'DeepwoodMemories',
          'NoblesseOblige',
          'OceanHuedClam',
        ],
        erMin: 160,
      },
      {
        name: 'On-Field Driver (triple EM)',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'ViridescentVenerer',
          'DeepwoodMemories',
          'NoblesseOblige',
          'OceanHuedClam',
        ],
        erMin: 160,
      },
    ],
  },
  sethos: {
    kqm: 'https://keqingmains.com/q/sethos-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/sethos',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: ['WanderersTroupe', 'GildedDreams', 'DesertPavilionChronicle'],
        erMin: 100,
      },
    ],
  },
  shenhe: {
    kqm: 'https://keqingmains.com/q/shenhe-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/shenhe',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['atk_pct'],
          circlet: ['atk_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'atk_pct', 'crit_rate', 'atk'],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'BlizzardStrayer',
        ],
        erMin: 180,
        erWeapons: [
          {
            weapon: 'Favonius Lance',
            min: 165,
          },
        ],
      },
    ],
  },
  shikanoin_heizou: {
    kqm: 'https://keqingmains.com/q/heizou-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/shikanoin_heizou',
    builds: [
      {
        name: 'ADC Build',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ViridescentVenerer',
          'Lavawalker',
          'Thundersoother',
          'GoldenTroupe',
          'DesertPavilionChronicle',
        ],
        erMin: 200,
      },
      {
        name: 'EM Build',
        role: 'reaction_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em', 'atk_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'ViridescentVenerer',
          'Lavawalker',
          'Thundersoother',
          'NoblesseOblige',
        ],
        erMin: 170,
      },
    ],
  },
  sigewinne: {
    kqm: 'https://keqingmains.com/q/sigewinne-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/sigewinne',
    builds: [
      {
        name: 'Healer',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct', 'elemental_dmg'],
          circlet: ['hp_pct', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'hp_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'OceanHuedClam',
          'SongOfDaysPast',
          'EmblemOfSeveredFate',
          'TenacityOfTheMillelith',
          'NoblesseOblige',
          'FragmentOfHarmonicWhimsy',
          'ScrollOfTheHeroOfCinderCity',
          'VourukashasGlow',
        ],
        erMin: 115,
        erWeapons: [
          {
            weapon: 'Favonius Bow (1 proc, funneled)',
            min: 105,
          },
        ],
      },
    ],
  },
  skirk: {
    kqm: 'https://keqingmains.com/q/skirk-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/skirk',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'atk_pct'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'atk'],
        sets: [
          'MarechausseeHunter',
          'FinaleOfTheDeepGalleries',
          'BlizzardStrayer',
          'GladiatorsFinale',
          'DesertPavilionChronicle',
        ],
      },
    ],
  },
  sucrose: {
    kqm: 'https://keqingmains.com/q/sucrose-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/sucrose',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em', 'er_pct', 'crit_rate'],
        sets: [
          'ViridescentVenerer',
          'ScrollOfTheHeroOfCinderCity',
          'DeepwoodMemories',
          'Instructor',
          'SilkenMoonsSerenade',
        ],
        erMin: 160,
      },
    ],
  },
  tartaglia: {
    kqm: 'https://keqingmains.com/q/tartaglia-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/tartaglia',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'er_pct'],
        sets: ['NymphsDream', 'HeartOfDepth', 'ShimenawasReminiscence'],
        erMin: 100,
      },
    ],
  },
  thoma: {
    kqm: 'https://keqingmains.com/q/thoma-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/thoma',
    builds: [
      {
        name: 'Burgeon Thoma (EM)',
        role: 'reaction_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em'],
        sets: ['FlowerOfParadiseLost', 'GildedDreams', 'CrimsonWitchOfFlames'],
        erMin: 240,
        erWeapons: [
          {
            weapon: 'Kitain Cross Spear R3',
            min: 240,
          },
        ],
      },
      {
        name: 'Burgeon Thoma (HP%)',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct'],
        },
        substats: ['er_pct', 'em'],
        sets: ['FlowerOfParadiseLost', 'GildedDreams', 'CrimsonWitchOfFlames'],
        erMin: 240,
        erWeapons: [
          {
            weapon: 'Kitain Cross Spear R3',
            min: 240,
          },
        ],
      },
      {
        name: 'Shield Support Thoma',
        role: 'shield',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'hp_pct', 'crit_rate', 'hp'],
        sets: [
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'Instructor',
          'DeepwoodMemories',
        ],
        erMin: 210,
        erWeapons: [
          {
            weapon: 'Favonius Lance R3',
            min: 210,
          },
          {
            weapon: 'Kitain Cross Spear R3',
            min: 220,
          },
        ],
      },
    ],
  },
  tighnari: {
    kqm: 'https://keqingmains.com/q/tighnari-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/tighnari',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
        sets: [
          'DeepwoodMemories',
          'WanderersTroupe',
          'GildedDreams',
          'EmblemOfSeveredFate',
        ],
        erMin: 100,
      },
    ],
  },
  varesa: {
    kqm: 'https://keqingmains.com/q/varesa-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/varesa',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'atk'],
        sets: [
          'LongNightsOath',
          'ObsidianCodex',
          'MarechausseeHunter',
          'DesertPavilionChronicle',
        ],
        erMin: 120,
      },
    ],
  },
  varka: {
    kqm: 'https://keqingmains.com/q/varka-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/varka',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'ADayCarvedFromRisingWinds',
          'MarechausseeHunter',
          'ScarletProof',
          'ShimenawasReminiscence',
          'DesertPavilionChronicle',
          'BlizzardStrayer',
          'HeartOfDepth',
          'NymphsDream',
          'Lavawalker',
          'Thundersoother',
          'GladiatorsFinale',
        ],
      },
    ],
  },
  venti: {
    kqm: 'https://keqingmains.com/q/venti-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/venti',
    builds: [
      {
        name: 'Off-Field Support (EM Build)',
        role: 'support',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'ViridescentVenerer',
          'ScrollOfTheHeroOfCinderCity',
          'GildedDreams',
        ],
        erMin: 175,
      },
      {
        name: 'Off-Field Support (CRIT Build)',
        role: 'support',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct', 'em', 'er_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'ViridescentVenerer',
          'ScrollOfTheHeroOfCinderCity',
          'GildedDreams',
        ],
        erMin: 175,
      },
      {
        name: 'Off-Field Support (Lunar-Charged)',
        role: 'support',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em'],
        sets: [
          'ViridescentVenerer',
          'ScrollOfTheHeroOfCinderCity',
          'GildedDreams',
        ],
        erMin: 175,
      },
      {
        name: 'On-Field DPS',
        role: 'on_field_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'ADayCarvedFromRisingWinds',
          'EchoesOfAnOffering',
          'ViridescentVenerer',
        ],
        erMin: 135,
      },
      {
        name: 'On-Field Driver',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em', 'crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: ['ViridescentVenerer'],
        erMin: 125,
      },
      {
        name: 'Off-Field DPS',
        role: 'off_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'er_pct'],
        sets: [
          'ViridescentVenerer',
          'ADayCarvedFromRisingWinds',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'GildedDreams',
          'EmblemOfSeveredFate',
        ],
      },
    ],
    unscored: [
      {
        name: 'On-Field DPS',
        source: 'genshinBuilds',
        reason: 'the guide gives no circlet main stat',
      },
    ],
  },
  vesna: {
    genshinBuilds: 'https://genshin-builds.com/en/character/vesna',
    builds: [
      {
        name: 'Best Stellar-Swirl DPS Build',
        role: 'on_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_dmg', 'crit_rate', 'atk_pct', 'em'],
        sets: [
          'ScarletProof',
          'ViridescentVenerer',
          'GladiatorsFinale',
          'ADayCarvedFromRisingWinds',
        ],
        erMin: 100,
      },
    ],
  },
  vodyanitsa: {
    kqm: 'https://keqingmains.com/q/vodyanitsa-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/vodyanitsa',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct'],
        },
        substats: ['hp_pct', 'er_pct', 'crit_rate', 'crit_dmg', 'hp'],
        sets: [
          'TenacityOfTheMillelith',
          'VourukashasGlow',
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
          'OceanHuedClam',
          'SongOfDaysPast',
        ],
        erMin: 210,
        erWeapons: [
          {
            weapon: 'Prototype Amber',
            min: 145,
          },
        ],
      },
    ],
  },
  wanderer: {
    kqm: 'https://keqingmains.com/q/wanderer-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/wanderer',
    builds: [
      {
        name: 'DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'DesertPavilionChronicle',
          'ShimenawasReminiscence',
          'MarechausseeHunter',
          'EchoesOfAnOffering',
          'ViridescentVenerer',
          'BlizzardStrayer',
          'Lavawalker',
        ],
        erMin: 105,
      },
      {
        name: 'Driver Build',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['er_pct', 'em'],
        sets: ['ViridescentVenerer'],
        erMin: 105,
      },
    ],
  },
  wriothesley: {
    kqm: 'https://keqingmains.com/q/wriothesley-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/wriothesley',
    builds: [
      {
        name: 'Stellar-Conduct DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['atk_pct', 'em', 'elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'DisenchantmentInDeepShadow',
          'MarechausseeHunter',
          'GildedDreams',
          'BlizzardStrayer',
          'ShimenawasReminiscence',
          'EchoesOfAnOffering',
        ],
      },
      {
        name: 'Non-Stellar-Conduct DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_dmg', 'crit_rate'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'MarechausseeHunter',
          'UnfinishedReverie',
          'BlizzardStrayer',
          'ShimenawasReminiscence',
        ],
        erMin: 100,
      },
    ],
  },
  xiangling: {
    kqm: 'https://keqingmains.com/q/xiangling-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/xiangling',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
        sets: [
          'EmblemOfSeveredFate',
          'CrimsonWitchOfFlames',
          'GildedDreams',
          'FlowerOfParadiseLost',
          'NoblesseOblige',
          'DeepwoodMemories',
        ],
        erMin: 220,
        erWeapons: [
          {
            weapon: 'Favonius Lance',
            min: 200,
          },
          {
            weapon: 'Kitain Cross Spear R5',
            min: 185,
          },
        ],
      },
    ],
  },
  xianyun: {
    kqm: 'https://keqingmains.com/q/xianyun-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/xianyun',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['atk_pct'],
          circlet: ['atk_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'atk_pct', 'atk', 'em', 'crit_rate'],
        sets: [
          'ViridescentVenerer',
          'OceanHuedClam',
          'NoblesseOblige',
          'SongOfDaysPast',
          'EmblemOfSeveredFate',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 220,
        erWeapons: [
          {
            weapon: "Crane's Echoing Call R1 (5 Plunge procs)",
            min: 190,
          },
          {
            weapon: "Crane's Echoing Call R1 (8 Plunge procs)",
            min: 165,
          },
        ],
      },
    ],
  },
  xiao: {
    kqm: 'https://keqingmains.com/q/xiao-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/xiao',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct'],
          goblet: ['elemental_dmg', 'atk_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'VermillionHereafter',
          'MarechausseeHunter',
          'DesertPavilionChronicle',
          'LongNightsOath',
        ],
        erMin: 100,
      },
    ],
  },
  xilonen: {
    kqm: 'https://keqingmains.com/q/xilonen-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/xilonen',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'def_pct'],
          goblet: ['def_pct'],
          circlet: ['def_pct', 'crit_rate', 'healing'],
        },
        substats: ['er_pct', 'crit_rate', 'def_pct', 'def'],
        sets: [
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
          'Instructor',
          'NoblesseOblige',
        ],
        erMin: 170,
      },
    ],
  },
  xingqiu: {
    kqm: 'https://keqingmains.com/q/xingqiu-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/xingqiu',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
        sets: [
          'EmblemOfSeveredFate',
          'MarechausseeHunter',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
          'DeepwoodMemories',
          'NymphsDream',
          'ADayCarvedFromRisingWinds',
          'BlizzardStrayer',
        ],
        erMin: 220,
        erWeapons: [
          {
            weapon: 'Favonius Sword',
            min: 190,
          },
          {
            weapon: 'Sacrificial Sword (R3+)',
            min: 150,
          },
          {
            weapon: 'Amenoma Kageuchi (R3)',
            min: 190,
          },
        ],
      },
    ],
  },
  xinyan: {
    kqm: 'https://keqingmains.com/xinyan/',
    genshinBuilds: 'https://genshin-builds.com/en/character/xinyan',
    builds: [
      {
        name: 'Physical DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'def_pct', 'er_pct'],
          goblet: ['physical_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: [
          'er_pct',
          'crit_dmg',
          'crit_rate',
          'atk_pct',
          'def_pct',
          'atk',
          'def',
          'em',
        ],
        sets: [
          'PaleFlame',
          'BloodstainedChivalry',
          'EmblemOfSeveredFate',
          'NoblesseOblige',
          'HuskOfOpulentDreams',
          'RetracingBolide',
        ],
        erMin: 200,
      },
      {
        name: 'Pyro DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'def_pct', 'er_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: [
          'er_pct',
          'crit_dmg',
          'crit_rate',
          'atk_pct',
          'def_pct',
          'atk',
          'def',
          'em',
        ],
        sets: [
          'Lavawalker',
          'EmblemOfSeveredFate',
          'CrimsonWitchOfFlames',
          'RetracingBolide',
          'HuskOfOpulentDreams',
        ],
        erMin: 200,
      },
      {
        name: 'Shield Support',
        role: 'shield',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['def_pct', 'er_pct'],
          goblet: ['def_pct'],
          circlet: ['def_pct'],
        },
        substats: ['er_pct', 'atk_pct', 'def_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'HuskOfOpulentDreams',
        ],
      },
    ],
  },
  yae_miko: {
    kqm: 'https://keqingmains.com/q/yae-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/yae_miko',
    builds: [
      {
        name: 'Stellar-Conduct DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em', 'er_pct'],
          goblet: ['atk_pct', 'em', 'elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'DisenchantmentInDeepShadow',
          'GildedDreams',
          'HeartOfTheFurnace',
          'GoldenTroupe',
          'EmblemOfSeveredFate',
          'Thundersoother',
          'TenacityOfTheMillelith',
        ],
      },
      {
        name: 'Non Stellar-Conduct DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em', 'er_pct'],
          goblet: ['elemental_dmg', 'em'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em', 'atk'],
        sets: [
          'GoldenTroupe',
          'GildedDreams',
          'UnfinishedReverie',
          'NightOfTheSkysUnveiling',
          'SilkenMoonsSerenade',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
          'EmblemOfSeveredFate',
          'Thundersoother',
        ],
        erMin: 140,
      },
    ],
  },
  yanfei: {
    kqm: 'https://keqingmains.com/q/yanfei-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/yanfei',
    builds: [
      {
        name: 'Pyro DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'atk_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'em', 'atk_pct', 'er_pct'],
        sets: [
          'CrimsonWitchOfFlames',
          'MarechausseeHunter',
          'WanderersTroupe',
          'GildedDreams',
          'ShimenawasReminiscence',
          'Lavawalker',
        ],
        erMin: 120,
      },
      {
        name: 'Reaction DPS',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em', 'er_pct'],
        sets: ['GildedDreams', 'FlowerOfParadiseLost', 'CrimsonWitchOfFlames'],
      },
      {
        name: 'Shield Support (C4+)',
        role: 'shield',
        constellation: 'C4',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'hp_pct', 'hp', 'crit_rate'],
        sets: [
          'NoblesseOblige',
          'EmblemOfSeveredFate',
          'TenacityOfTheMillelith',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 250,
        erWeapons: [
          {
            weapon: 'Prototype Amber R5',
            min: 250,
          },
        ],
      },
    ],
  },
  yaoyao: {
    kqm: 'https://keqingmains.com/q/yaoyao-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/yaoyao',
    builds: [
      {
        name: 'Pure Healer',
        role: 'healer',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['er_pct', 'hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'healing'],
        },
        substats: ['er_pct', 'crit_rate', 'hp_pct'],
        sets: [
          'DeepwoodMemories',
          'Instructor',
          'TenacityOfTheMillelith',
          'MaidenBeloved',
          'GildedDreams',
          'TheExile',
          'OceanHuedClam',
          'FlowerOfParadiseLost',
        ],
        erMin: 260,
      },
      {
        name: 'Reaction-Focused (Nilou Bloom)',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['elemental_dmg', 'em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: ['er_pct', 'crit_rate', 'hp_pct', 'em'],
        sets: [
          'DeepwoodMemories',
          'Instructor',
          'TenacityOfTheMillelith',
          'MaidenBeloved',
          'GildedDreams',
          'TheExile',
        ],
        erMin: 260,
      },
      {
        name: 'Reaction-Focused (Spread)',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em'],
          goblet: ['elemental_dmg', 'em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: [
          'crit_rate',
          'crit_dmg',
          'em',
          'atk_pct',
          'er_pct',
          'hp_pct',
        ],
        sets: [
          'DeepwoodMemories',
          'Instructor',
          'TenacityOfTheMillelith',
          'MaidenBeloved',
          'GildedDreams',
          'TheExile',
        ],
        erMin: 260,
      },
    ],
  },
  yelan: {
    kqm: 'https://keqingmains.com/q/yelan-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/yelan',
    builds: [
      {
        name: 'Off-field DPS',
        role: 'off_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct', 'er_pct'],
          goblet: ['elemental_dmg', 'hp_pct'],
          circlet: ['crit_rate', 'crit_dmg', 'hp_pct'],
        },
        substats: ['er_pct', 'hp_pct', 'crit_rate', 'crit_dmg'],
        sets: [
          'EmblemOfSeveredFate',
          'MarechausseeHunter',
          'NymphsDream',
          'NoblesseOblige',
          'ScrollOfTheHeroOfCinderCity',
          'ArchaicPetra',
          'DeepwoodMemories',
        ],
        erMin: 265,
        erWeapons: [
          {
            weapon: 'Favonius Warbow',
            min: 215,
          },
        ],
      },
    ],
  },
  yoimiya: {
    kqm: 'https://keqingmains.com/q/yoimiya-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/yoimiya',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'em'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em', 'er_pct'],
        sets: [
          'ShimenawasReminiscence',
          'EchoesOfAnOffering',
          'MarechausseeHunter',
          'NightOfTheSkysUnveiling',
          'CrimsonWitchOfFlames',
          'GildedDreams',
        ],
      },
    ],
  },
  yumemizuki_mizuki: {
    kqm: 'https://keqingmains.com/q/mizuki-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/yumemizuki_mizuki',
    builds: [
      {
        name: 'Stellar Swirl',
        role: 'reaction_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['crit_rate', 'crit_dmg', 'em'],
        },
        substats: ['crit_rate', 'crit_dmg', 'em', 'er_pct'],
        sets: ['GildedDreams', 'ScarletProof', 'ViridescentVenerer'],
        erMin: 100,
      },
      {
        name: 'Outside Stellar Swirl',
        role: 'reaction_dps',
        sources: ['kqm'],
        accepts: {
          sands: ['em', 'er_pct'],
          goblet: ['em'],
          circlet: ['em'],
        },
        substats: ['em', 'er_pct'],
        sets: ['ViridescentVenerer'],
        erMin: 100,
      },
    ],
  },
  yun_jin: {
    kqm: 'https://keqingmains.com/yunjin/',
    genshinBuilds: 'https://genshin-builds.com/en/character/yun_jin',
    builds: [
      {
        name: 'Support',
        role: 'support',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['def_pct', 'er_pct'],
          goblet: ['def_pct'],
          circlet: ['def_pct', 'crit_rate'],
        },
        substats: ['er_pct', 'def_pct', 'crit_rate', 'def'],
        sets: [
          'HuskOfOpulentDreams',
          'EmblemOfSeveredFate',
          'NoblesseOblige',
          'ArchaicPetra',
          'ScrollOfTheHeroOfCinderCity',
        ],
        erMin: 140,
      },
    ],
  },
  zhongli: {
    kqm: 'https://keqingmains.com/q/zhongli-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/zhongli',
    builds: [
      {
        name: 'Shielder',
        role: 'shield',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['hp_pct'],
          goblet: ['hp_pct'],
          circlet: ['hp_pct', 'crit_rate'],
        },
        substats: ['hp_pct', 'crit_rate', 'hp'],
        sets: [
          'TenacityOfTheMillelith',
          'ArchaicPetra',
          'DeepwoodMemories',
          'Instructor',
          'SilkenMoonsSerenade',
          'ScrollOfTheHeroOfCinderCity',
          'VourukashasGlow',
        ],
      },
      {
        name: 'Burst Support',
        role: 'off_field_dps',
        sources: ['genshinBuilds'],
        accepts: {
          sands: ['atk_pct', 'hp_pct'],
          goblet: ['elemental_dmg'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'hp_pct', 'er_pct'],
        sets: [
          'EmblemOfSeveredFate',
          'NoblesseOblige',
          'ArchaicPetra',
          'TenacityOfTheMillelith',
        ],
      },
    ],
  },
  zibai: {
    kqm: 'https://keqingmains.com/q/zibai-quickguide/',
    genshinBuilds: 'https://genshin-builds.com/en/character/zibai',
    builds: [
      {
        name: 'On-field DPS',
        role: 'on_field_dps',
        sources: ['kqm', 'genshinBuilds'],
        accepts: {
          sands: ['def_pct'],
          goblet: ['def_pct'],
          circlet: ['crit_rate', 'crit_dmg'],
        },
        substats: ['crit_rate', 'crit_dmg', 'def_pct', 'em', 'er_pct'],
        sets: ['NightOfTheSkysUnveiling', 'HuskOfOpulentDreams'],
        erMin: 100,
      },
    ],
  },
};
