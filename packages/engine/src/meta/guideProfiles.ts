/**
 * Guide profiles (ADR-0058): what the build guides say a character without
 * curated targets uses, for the artifact score only. They never become
 * optimizer defaults: `META_TARGETS` stays the only source of those.
 *
 * Checked on 2026-10-07 against the KQM quick guides and genshin-builds.com
 * (Game8 is links only). Each profile is KQM's first build, or
 * genshin-builds' where KQM has no guide:
 * - `accepts`: the main stats either guide names for the sands, goblet and
 *   circlet. Where the guides build the character for different roles,
 *   KQM's alone, with genshin-builds' build kept as `alternative`.
 * - `substats`: KQM's substat list (flat stats are added at 0.4 by the
 *   score). CRIT and Energy Recharge count for everyone anyway, apart from
 *   the exceptions in `artifactQuality.ts`.
 * - `sets`: every set either guide names, for the recommended-set mark.
 * - `erMin`: the lower bound of the first scenario KQM lists, shown beside
 *   their Energy Recharge; it never limits the score.
 *
 * Varka's KQM goblet is a Pyro, Hydro, Electro or Cryo DMG one over his own
 * Anemo; the score accepts only an Anemo one until a goblet can name an
 * element.
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';

export interface GuideProfile {
  accepts: Record<'sands' | 'goblet' | 'circlet', StatKey[]>;
  substats: StatKey[];
  sets: string[];
  erMin?: number;
  sources: string[];
  /** The other guide's build, where the two build the character for
   *  different roles. Not scored. */
  alternative?: string;
}

export const GUIDE_PROFILES: Record<string, GuideProfile> = {
  aino: {
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
    sources: [
      'https://keqingmains.com/q/aino-quickguide/',
      'https://genshin-builds.com/en/character/aino',
    ],
  },
  aloy: {
    accepts: {
      sands: ['em', 'er_pct', 'atk_pct'],
      goblet: ['elemental_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
    sets: ['EmblemOfSeveredFate', 'GildedDreams', 'Lavawalker'],
    erMin: 140,
    sources: [
      'https://keqingmains.com/q/aloy-quickguide/',
      'https://genshin-builds.com/en/character/aloy',
    ],
    alternative:
      'genshin-builds: Freeze burst support (Blizzard Strayer, ATK% sands).',
  },
  alyosha: {
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
      'GladiatorsFinale',
      'ADayCarvedFromRisingWinds',
    ],
    erMin: 180,
    sources: [
      'https://keqingmains.com/q/alyosha-quickguide/',
      'https://genshin-builds.com/en/character/alyosha',
    ],
  },
  amber: {
    accepts: {
      sands: ['em', 'atk_pct'],
      goblet: ['elemental_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
    sets: [
      'ShimenawasReminiscence',
      'WanderersTroupe',
      'DesertPavilionChronicle',
      'CrimsonWitchOfFlames',
      'MarechausseeHunter',
      'GildedDreams',
    ],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/amber-quickguide/',
      'https://genshin-builds.com/en/character/amber',
    ],
  },
  barbara: {
    accepts: { sands: ['hp_pct'], goblet: ['hp_pct'], circlet: ['healing'] },
    substats: ['hp_pct'],
    sets: [
      'MaidenBeloved',
      'OceanHuedClam',
      'TenacityOfTheMillelith',
      'ScrollOfTheHeroOfCinderCity',
      'Instructor',
    ],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/barbara-quickguide/',
      'https://genshin-builds.com/en/character/barbara',
    ],
  },
  beidou: {
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
      'ThunderingFury',
    ],
    sources: [
      'https://keqingmains.com/q/beidou-quickguide/',
      'https://genshin-builds.com/en/character/beidou',
    ],
  },
  candace: {
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
    erMin: 230,
    sources: [
      'https://keqingmains.com/q/candace-quickguide/',
      'https://genshin-builds.com/en/character/candace',
    ],
  },
  chongyun: {
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
      'Lavawalker',
      'BlizzardStrayer',
    ],
    erMin: 150,
    sources: [
      'https://keqingmains.com/q/chongyun-quickguide/',
      'https://genshin-builds.com/en/character/chongyun',
    ],
  },
  collei: {
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
    sources: [
      'https://keqingmains.com/q/collei-quickguide/',
      'https://genshin-builds.com/en/character/collei',
    ],
  },
  columbina: {
    accepts: {
      sands: ['er_pct', 'hp_pct'],
      goblet: ['hp_pct'],
      circlet: ['crit_rate', 'crit_dmg', 'hp_pct'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'hp_pct', 'em'],
    sets: [
      'SilkenMoonsSerenade',
      'AubadeOfMorningstarAndMoon',
      'NightOfTheSkysUnveiling',
      'TenacityOfTheMillelith',
    ],
    sources: [
      'https://keqingmains.com/q/columbina-quickguide/',
      'https://genshin-builds.com/en/character/columbina',
    ],
  },
  dahlia: {
    accepts: {
      sands: ['hp_pct', 'er_pct'],
      goblet: ['hp_pct'],
      circlet: ['hp_pct', 'crit_rate'],
    },
    substats: ['er_pct', 'crit_rate', 'hp_pct'],
    sets: [
      'NoblesseOblige',
      'ScrollOfTheHeroOfCinderCity',
      'ArchaicPetra',
      'TenacityOfTheMillelith',
      'VourukashasGlow',
    ],
    erMin: 240,
    sources: [
      'https://keqingmains.com/q/dahlia-quickguide/',
      'https://genshin-builds.com/en/character/dahlia',
    ],
  },
  dehya: {
    accepts: {
      sands: ['em', 'hp_pct'],
      goblet: ['em', 'hp_pct'],
      circlet: ['crit_rate', 'em', 'hp_pct'],
    },
    substats: ['crit_rate', 'em', 'hp_pct'],
    sets: [
      'TenacityOfTheMillelith',
      'ScrollOfTheHeroOfCinderCity',
      'Instructor',
      'SilkenMoonsSerenade',
      'DeepwoodMemories',
    ],
    sources: [
      'https://keqingmains.com/q/dehya-quickguide/',
      'https://genshin-builds.com/en/character/dehya',
    ],
    alternative:
      'genshin-builds: on-field Pyro DPS (Emblem, ATK%/EM sands, Pyro goblet, crit circlet).',
  },
  diluc: {
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
    sources: [
      'https://keqingmains.com/q/diluc-quickguide/',
      'https://genshin-builds.com/en/character/diluc',
    ],
  },
  diona: {
    accepts: {
      sands: ['hp_pct', 'er_pct'],
      goblet: ['hp_pct'],
      circlet: ['hp_pct', 'healing', 'crit_rate'],
    },
    substats: ['er_pct', 'hp_pct', 'crit_rate'],
    sets: [
      'NoblesseOblige',
      'TenacityOfTheMillelith',
      'ScrollOfTheHeroOfCinderCity',
      'SongOfDaysPast',
      'DeepwoodMemories',
      'Instructor',
      'MaidenBeloved',
      'OceanHuedClam',
    ],
    sources: [
      'https://keqingmains.com/q/diona-quickguide/',
      'https://genshin-builds.com/en/character/diona',
    ],
  },
  dori: {
    accepts: {
      sands: ['em', 'er_pct'],
      goblet: ['elemental_dmg', 'em'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct', 'hp_pct'],
    sets: ['ThunderingFury', 'GildedDreams', 'Thundersoother'],
    sources: [
      'https://keqingmains.com/q/dori-quickguide/',
      'https://genshin-builds.com/en/character/dori',
    ],
    alternative:
      'genshin-builds: healing support (Noblesse, HP%/ER sands, HP% goblet, Healing circlet).',
  },
  durin: {
    accepts: {
      sands: ['atk_pct', 'em'],
      goblet: ['elemental_dmg', 'atk_pct'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: ['CelestialGift', 'NoblesseOblige', 'DeepwoodMemories'],
    erMin: 120,
    sources: [
      'https://keqingmains.com/q/durin-quickguide/',
      'https://genshin-builds.com/en/character/durin',
    ],
    alternative:
      'genshin-builds: off-field Vaporize/Melt DPS (A Day Carved from Rising Winds).',
  },
  eula: {
    accepts: {
      sands: ['atk_pct', 'er_pct'],
      goblet: ['physical_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
    sets: [
      'PaleFlame',
      'EmblemOfSeveredFate',
      'BloodstainedChivalry',
      'GladiatorsFinale',
    ],
    erMin: 140,
    sources: [
      'https://keqingmains.com/q/eula-quickguide/',
      'https://genshin-builds.com/en/character/eula',
    ],
  },
  flins: {
    accepts: {
      sands: ['atk_pct', 'em'],
      goblet: ['atk_pct', 'em'],
      circlet: ['crit_dmg', 'crit_rate'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: [
      'NightOfTheSkysUnveiling',
      'MarechausseeHunter',
      'ThunderingFury',
      'GildedDreams',
    ],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/flins-quickguide/',
      'https://genshin-builds.com/en/character/flins',
    ],
  },
  freminet: {
    accepts: {
      sands: ['atk_pct', 'em'],
      goblet: ['elemental_dmg', 'atk_pct'],
      circlet: ['crit_dmg', 'crit_rate'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: [
      'BlizzardStrayer',
      'GoldenTroupe',
      'MarechausseeHunter',
      'PaleFlame',
    ],
    erMin: 150,
    sources: [
      'https://keqingmains.com/q/freminet-quickguide/',
      'https://genshin-builds.com/en/character/freminet',
    ],
    alternative: 'genshin-builds: Physical DPS (Pale Flame, Physical goblet).',
  },
  gaming: {
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
    erMin: 170,
    sources: [
      'https://keqingmains.com/q/gaming-quickguide/',
      'https://genshin-builds.com/en/character/gaming',
    ],
  },
  iansan: {
    accepts: {
      sands: ['atk_pct', 'er_pct'],
      goblet: ['atk_pct'],
      circlet: ['atk_pct', 'crit_rate'],
    },
    substats: ['er_pct', 'atk_pct', 'crit_rate'],
    sets: ['ScrollOfTheHeroOfCinderCity', 'NoblesseOblige'],
    sources: [
      'https://keqingmains.com/q/iansan-quickguide/',
      'https://genshin-builds.com/en/character/iansan',
    ],
  },
  ifa: {
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
      'ObsidianCodex',
    ],
    sources: [
      'https://keqingmains.com/q/ifa-quickguide/',
      'https://genshin-builds.com/en/character/ifa',
    ],
  },
  illuga: {
    accepts: {
      sands: ['em', 'er_pct'],
      goblet: ['em'],
      circlet: ['em', 'crit_rate'],
    },
    substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'def_pct'],
    sets: [
      'SilkenMoonsSerenade',
      'Instructor',
      'ScrollOfTheHeroOfCinderCity',
      'NoblesseOblige',
      'TheExile',
    ],
    erMin: 165,
    sources: [
      'https://keqingmains.com/q/illuga-quickguide/',
      'https://genshin-builds.com/en/character/illuga',
    ],
  },
  ineffa: {
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
      'ADayCarvedFromRisingWinds',
      'TenacityOfTheMillelith',
    ],
    erMin: 120,
    sources: [
      'https://keqingmains.com/q/ineffa-quickguide/',
      'https://genshin-builds.com/en/character/ineffa',
    ],
  },
  jahoda: {
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
    erMin: 190,
    sources: [
      'https://keqingmains.com/q/jahoda-quickguide/',
      'https://genshin-builds.com/en/character/jahoda',
    ],
  },
  jean: {
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
    sources: [
      'https://keqingmains.com/q/jean-quickguide/',
      'https://genshin-builds.com/en/character/jean',
    ],
  },
  kachina: {
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
    ],
    sources: [
      'https://keqingmains.com/q/kachina-quickguide/',
      'https://genshin-builds.com/en/character/kachina',
    ],
  },
  kaeya: {
    accepts: {
      sands: ['er_pct', 'atk_pct', 'em'],
      goblet: ['elemental_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: ['EmblemOfSeveredFate', 'BlizzardStrayer', 'NoblesseOblige'],
    erMin: 155,
    sources: [
      'https://keqingmains.com/q/kaeya-quickguide/',
      'https://genshin-builds.com/en/character/kaeya',
    ],
    alternative:
      'genshin-builds: on-field Freeze DPS (Blizzard Strayer, ATK% sands).',
  },
  kaveh: {
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
    sources: [
      'https://keqingmains.com/q/kaveh-quickguide/',
      'https://genshin-builds.com/en/character/kaveh',
    ],
  },
  kirara: {
    accepts: {
      sands: ['hp_pct', 'er_pct'],
      goblet: ['hp_pct'],
      circlet: ['hp_pct', 'crit_rate'],
    },
    substats: ['er_pct', 'hp_pct', 'crit_rate'],
    sets: [
      'DeepwoodMemories',
      'TenacityOfTheMillelith',
      'Instructor',
      'NoblesseOblige',
      'VourukashasGlow',
    ],
    erMin: 160,
    sources: [
      'https://keqingmains.com/q/kirara-quickguide/',
      'https://genshin-builds.com/en/character/kirara',
    ],
  },
  lan_yan: {
    accepts: {
      sands: ['atk_pct', 'er_pct', 'em'],
      goblet: ['atk_pct', 'elemental_dmg'],
      circlet: ['atk_pct', 'crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: ['ViridescentVenerer', 'ScrollOfTheHeroOfCinderCity', 'GoldenTroupe'],
    sources: [
      'https://keqingmains.com/q/lan-yan-quickguide/',
      'https://genshin-builds.com/en/character/lan_yan',
    ],
  },
  lauma: {
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
    sources: [
      'https://keqingmains.com/q/lauma-quickguide/',
      'https://genshin-builds.com/en/character/lauma',
    ],
  },
  layla: {
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
      'ScrollOfTheHeroOfCinderCity',
      'VourukashasGlow',
      'NoblesseOblige',
    ],
    erMin: 220,
    sources: [
      'https://keqingmains.com/q/layla-quickguide/',
      'https://genshin-builds.com/en/character/layla',
    ],
  },
  linnea: {
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
    erMin: 170,
    sources: [
      'https://keqingmains.com/q/linnea-quickguide/',
      'https://genshin-builds.com/en/character/linnea',
    ],
  },
  lisa: {
    accepts: {
      sands: ['atk_pct', 'em'],
      goblet: ['elemental_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['crit_rate', 'crit_dmg', 'er_pct', 'atk_pct', 'em'],
    sets: [
      'ThunderingFury',
      'GildedDreams',
      'MarechausseeHunter',
      'Thundersoother',
    ],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/lisa-quickguide/',
      'https://genshin-builds.com/en/character/lisa',
    ],
  },
  lohen: {
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
      'BlizzardStrayer',
      'DesertPavilionChronicle',
    ],
    erMin: 190,
    sources: [
      'https://keqingmains.com/q/lohen-quickguide/',
      'https://genshin-builds.com/en/character/lohen',
    ],
  },
  lynette: {
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
    erMin: 180,
    sources: [
      'https://keqingmains.com/q/lynette-quickguide/',
      'https://genshin-builds.com/en/character/lynette',
    ],
  },
  lyney: {
    accepts: {
      sands: ['atk_pct'],
      goblet: ['elemental_dmg', 'atk_pct'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'er_pct'],
    sets: [
      'MarechausseeHunter',
      'Lavawalker',
      'VermillionHereafter',
      'ShimenawasReminiscence',
      'CrimsonWitchOfFlames',
      'RetracingBolide',
    ],
    erMin: 125,
    sources: [
      'https://keqingmains.com/q/lyney-quickguide/',
      'https://genshin-builds.com/en/character/lyney',
    ],
  },
  mika: {
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
    erMin: 105,
    sources: [
      'https://keqingmains.com/q/mika-quickguide/',
      'https://genshin-builds.com/en/character/mika',
    ],
  },
  mona: {
    accepts: {
      sands: ['er_pct', 'atk_pct'],
      goblet: ['elemental_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: [
      'CelestialGift',
      'NoblesseOblige',
      'TenacityOfTheMillelith',
      'ScrollOfTheHeroOfCinderCity',
    ],
    erMin: 150,
    sources: [
      'https://keqingmains.com/q/mona-quickguide/',
      'https://genshin-builds.com/en/character/mona',
    ],
  },
  nefer: {
    accepts: {
      sands: ['em'],
      goblet: ['em'],
      circlet: ['crit_rate', 'crit_dmg', 'em'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em'],
    sets: ['NightOfTheSkysUnveiling', 'GildedDreams', 'ResolutionOfSojourner'],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/nefer-quickguide/',
      'https://genshin-builds.com/en/character/nefer',
    ],
  },
  nicole: {
    accepts: {
      sands: ['atk_pct', 'er_pct'],
      goblet: ['atk_pct'],
      circlet: ['atk_pct', 'crit_rate'],
    },
    substats: ['er_pct', 'atk_pct'],
    sets: ['CelestialGift', 'ScrollOfTheHeroOfCinderCity', 'NoblesseOblige'],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/nicole-quickguide/',
      'https://genshin-builds.com/en/character/nicole',
    ],
  },
  ningguang: {
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
      'ArchaicPetra',
      'NoblesseOblige',
      'HuskOfOpulentDreams',
    ],
    erMin: 110,
    sources: [
      'https://keqingmains.com/q/ningguang-quickguide/',
      'https://genshin-builds.com/en/character/ningguang',
    ],
  },
  noelle: {
    accepts: {
      sands: ['atk_pct', 'def_pct'],
      goblet: ['elemental_dmg', 'def_pct'],
      circlet: ['crit_rate', 'crit_dmg', 'def_pct'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'def_pct'],
    sets: [
      'HuskOfOpulentDreams',
      'NightOfTheSkysUnveiling',
      'MarechausseeHunter',
      'RetracingBolide',
      'GladiatorsFinale',
    ],
    sources: [
      'https://keqingmains.com/q/noelle-quickguide/',
      'https://genshin-builds.com/en/character/noelle',
    ],
  },
  odette: {
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
    sources: [
      'https://keqingmains.com/q/odette-quickguide/',
      'https://genshin-builds.com/en/character/odette',
    ],
  },
  prune: {
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
    sources: [
      'https://keqingmains.com/q/prune-quickguide/',
      'https://genshin-builds.com/en/character/prune',
    ],
  },
  qiqi: {
    accepts: {
      sands: ['atk_pct', 'er_pct'],
      goblet: ['atk_pct'],
      circlet: ['crit_rate', 'atk_pct', 'healing'],
    },
    substats: ['er_pct', 'atk_pct', 'crit_rate'],
    sets: [
      'TenacityOfTheMillelith',
      'NoblesseOblige',
      'OceanHuedClam',
      'ScrollOfTheHeroOfCinderCity',
      'SongOfDaysPast',
    ],
    erMin: 240,
    sources: [
      'https://keqingmains.com/q/qiqi-quickguide/',
      'https://genshin-builds.com/en/character/qiqi',
    ],
  },
  razor: {
    accepts: {
      sands: ['atk_pct'],
      goblet: ['physical_dmg', 'atk_pct'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
    sets: ['PaleFlame', 'ThunderingFury', 'GildedDreams', 'Thundersoother'],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/razor-quickguide/',
      'https://genshin-builds.com/en/character/razor',
    ],
    alternative:
      'genshin-builds: Electro DPS (A Day Carved from Rising Winds, Electro goblet).',
  },
  rosaria: {
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
      'NoblesseOblige',
    ],
    erMin: 145,
    sources: [
      'https://keqingmains.com/q/rosaria-quickguide/',
      'https://genshin-builds.com/en/character/rosaria',
    ],
  },
  sandrone: {
    accepts: {
      sands: ['atk_pct', 'em'],
      goblet: ['atk_pct', 'em'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: [
      'DisenchantmentInDeepShadow',
      'GildedDreams',
      'GladiatorsFinale',
      'ADayCarvedFromRisingWinds',
    ],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/sandrone-quickguide/',
      'https://genshin-builds.com/en/character/sandrone',
    ],
  },
  sayu: {
    accepts: {
      sands: ['er_pct', 'atk_pct', 'em'],
      goblet: ['atk_pct', 'em'],
      circlet: ['healing', 'atk_pct', 'em'],
    },
    substats: ['er_pct', 'atk_pct', 'em'],
    sets: [
      'ViridescentVenerer',
      'DeepwoodMemories',
      'NoblesseOblige',
      'OceanHuedClam',
    ],
    erMin: 200,
    sources: [
      'https://keqingmains.com/q/sayu-quickguide/',
      'https://genshin-builds.com/en/character/sayu',
    ],
  },
  sethos: {
    accepts: {
      sands: ['em', 'er_pct'],
      goblet: ['elemental_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'em', 'atk_pct'],
    sets: ['WanderersTroupe', 'GildedDreams', 'DesertPavilionChronicle'],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/sethos-quickguide/',
      'https://genshin-builds.com/en/character/sethos',
    ],
  },
  shikanoin_heizou: {
    accepts: {
      sands: ['atk_pct'],
      goblet: ['elemental_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'er_pct', 'em'],
    sets: ['ViridescentVenerer', 'GoldenTroupe', 'DesertPavilionChronicle'],
    sources: ['https://genshin-builds.com/en/character/shikanoin_heizou'],
  },
  sucrose: {
    accepts: { sands: ['em'], goblet: ['em'], circlet: ['em'] },
    substats: ['em', 'er_pct', 'crit_rate'],
    sets: [
      'ViridescentVenerer',
      'ScrollOfTheHeroOfCinderCity',
      'DeepwoodMemories',
      'Instructor',
      'SilkenMoonsSerenade',
    ],
    sources: [
      'https://keqingmains.com/q/sucrose-quickguide/',
      'https://genshin-builds.com/en/character/sucrose',
    ],
  },
  thoma: {
    accepts: { sands: ['em', 'er_pct'], goblet: ['em'], circlet: ['em'] },
    substats: ['er_pct', 'em'],
    sets: ['FlowerOfParadiseLost', 'GildedDreams', 'CrimsonWitchOfFlames'],
    erMin: 210,
    sources: [
      'https://keqingmains.com/q/thoma-quickguide/',
      'https://genshin-builds.com/en/character/thoma',
    ],
  },
  tighnari: {
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
    sources: [
      'https://keqingmains.com/q/tighnari-quickguide/',
      'https://genshin-builds.com/en/character/tighnari',
    ],
  },
  varesa: {
    accepts: {
      sands: ['atk_pct'],
      goblet: ['elemental_dmg', 'atk_pct'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct'],
    sets: ['LongNightsOath', 'ObsidianCodex', 'MarechausseeHunter'],
    erMin: 120,
    sources: [
      'https://keqingmains.com/q/varesa-quickguide/',
      'https://genshin-builds.com/en/character/varesa',
    ],
  },
  varka: {
    accepts: {
      sands: ['atk_pct'],
      goblet: ['elemental_dmg', 'atk_pct'],
      circlet: ['crit_dmg', 'crit_rate'],
    },
    substats: ['crit_rate', 'crit_dmg', 'atk_pct', 'em'],
    sets: [
      'ADayCarvedFromRisingWinds',
      'MarechausseeHunter',
      'ShimenawasReminiscence',
      'DesertPavilionChronicle',
      'GladiatorsFinale',
    ],
    sources: [
      'https://keqingmains.com/q/varka-quickguide/',
      'https://genshin-builds.com/en/character/varka',
    ],
  },
  venti: {
    accepts: {
      sands: ['em', 'atk_pct', 'er_pct'],
      goblet: ['em', 'elemental_dmg', 'atk_pct'],
      circlet: ['em', 'crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'em', 'crit_rate', 'crit_dmg', 'atk_pct'],
    sets: ['ViridescentVenerer', 'ScrollOfTheHeroOfCinderCity', 'GildedDreams'],
    erMin: 115,
    sources: [
      'https://keqingmains.com/q/venti-quickguide/',
      'https://genshin-builds.com/en/character/venti',
    ],
    alternative:
      'genshin-builds: off-field DPS on ATK% (ATK% sands, Anemo goblet, crit circlet).',
  },
  vesna: {
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
    erMin: 120,
    sources: ['https://genshin-builds.com/en/character/vesna'],
  },
  vodyanitsa: {
    accepts: { sands: ['hp_pct'], goblet: ['hp_pct'], circlet: ['hp_pct'] },
    substats: ['hp_pct', 'er_pct', 'crit_rate', 'crit_dmg'],
    sets: [
      'TenacityOfTheMillelith',
      'VourukashasGlow',
      'ScrollOfTheHeroOfCinderCity',
      'ArchaicPetra',
      'SongOfDaysPast',
    ],
    erMin: 145,
    sources: [
      'https://keqingmains.com/q/vodyanitsa-quickguide/',
      'https://genshin-builds.com/en/character/vodyanitsa',
    ],
  },
  xinyan: {
    accepts: {
      sands: ['atk_pct', 'def_pct', 'er_pct'],
      goblet: ['physical_dmg'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['er_pct', 'crit_dmg', 'crit_rate', 'atk_pct', 'def_pct'],
    sets: ['PaleFlame', 'BloodstainedChivalry'],
    erMin: 160,
    sources: [
      'https://keqingmains.com/xinyan/',
      'https://genshin-builds.com/en/character/xinyan',
    ],
  },
  yanfei: {
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
    ],
    erMin: 120,
    sources: [
      'https://keqingmains.com/q/yanfei-quickguide/',
      'https://genshin-builds.com/en/character/yanfei',
    ],
  },
  yaoyao: {
    accepts: {
      sands: ['er_pct', 'hp_pct'],
      goblet: ['hp_pct', 'elemental_dmg', 'em'],
      circlet: ['hp_pct', 'healing', 'crit_rate', 'crit_dmg', 'em'],
    },
    substats: ['er_pct', 'crit_rate', 'hp_pct'],
    sets: [
      'DeepwoodMemories',
      'Instructor',
      'TenacityOfTheMillelith',
      'MaidenBeloved',
      'OceanHuedClam',
    ],
    sources: [
      'https://keqingmains.com/q/yaoyao-quickguide/',
      'https://genshin-builds.com/en/character/yaoyao',
    ],
  },
  yumemizuki_mizuki: {
    accepts: { sands: ['em', 'er_pct'], goblet: ['em'], circlet: ['em'] },
    substats: ['er_pct', 'em', 'crit_rate'],
    sets: [
      'ViridescentVenerer',
      'WanderersTroupe',
      'GildedDreams',
      'ResolutionOfSojourner',
    ],
    sources: ['https://genshin-builds.com/en/character/yumemizuki_mizuki'],
  },
  yun_jin: {
    accepts: {
      sands: ['def_pct', 'er_pct'],
      goblet: ['def_pct'],
      circlet: ['def_pct', 'crit_rate'],
    },
    substats: ['er_pct', 'def_pct', 'crit_rate'],
    sets: [
      'HuskOfOpulentDreams',
      'EmblemOfSeveredFate',
      'NoblesseOblige',
      'ArchaicPetra',
    ],
    erMin: 140,
    sources: [
      'https://keqingmains.com/yun-jin/',
      'https://genshin-builds.com/en/character/yun_jin',
    ],
  },
  zibai: {
    accepts: {
      sands: ['def_pct'],
      goblet: ['def_pct'],
      circlet: ['crit_rate', 'crit_dmg'],
    },
    substats: ['crit_rate', 'crit_dmg', 'def_pct', 'em', 'er_pct'],
    sets: ['NightOfTheSkysUnveiling', 'HuskOfOpulentDreams'],
    erMin: 100,
    sources: [
      'https://keqingmains.com/q/zibai-quickguide/',
      'https://genshin-builds.com/en/character/zibai',
    ],
  },
};
