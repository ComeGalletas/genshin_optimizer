/**
 * How hard each notable weapon is to get.
 *
 * // ponytail: hand-transcribed, same freshness caveat as src/meta/metaTargets.ts
 * // — curated as of patch 6.7, no automated drift check; the `source` link is
 * // the re-verification path. Scoped to the weapons that appear in the meta
 * // recipes and comp archetypes, not the full 235-weapon dataset.
 *
 * The five tiers describe *how you get one*, not how good it is:
 *   craftable       — forged, fished, or bought with reputation/quest rewards.
 *                     Free to a patient player.
 *   battle-pass     — Gnostic Hymn only.
 *   standard-banner — the permanent wish pool (never leaves).
 *   limited-banner  — a character-banner weapon; comes back only on rerun.
 *   event           — obtained from a past or recurring event.
 *
 * `source` is the weapon's wiki page.
 */
export type Obtainability =
  'craftable' | 'battle-pass' | 'standard-banner' | 'limited-banner' | 'event';

const wiki = (name: string) =>
  `https://genshin-impact.fandom.com/wiki/${name.replace(/ /g, '_')}`;

interface Entry {
  tier: Obtainability;
  source: string;
}

/** Compact constructor: `[key, tier, wiki page title]`. */
const rows: [string, Obtainability, string][] = [
  // ---- craftable: forged from billets, fished, or reputation/quest rewards ----
  ['the_catch', 'craftable', 'The Catch'],
  ['amenoma_kageuchi', 'craftable', 'Amenoma Kageuchi'],
  ['katsuragikiri_nagamasa', 'craftable', 'Katsuragikiri Nagamasa'],
  ['hakushin_ring', 'craftable', 'Hakushin Ring'],
  ['kitain_cross_spear', 'craftable', 'Kitain Cross Spear'],
  ["wavebreaker's_fin", 'craftable', "Wavebreaker's Fin"],
  ["mouun's_moon", 'craftable', "Mouun's Moon"],
  ["xiphos'_moonlight", 'craftable', "Xiphos' Moonlight"],
  ['makhaira_aquamarine', 'craftable', 'Makhaira Aquamarine'],
  ['wandering_evenstar', 'craftable', 'Wandering Evenstar'],
  ['fruit_of_fulfillment', 'craftable', 'Fruit of Fulfillment'],
  ['sapwood_blade', 'craftable', 'Sapwood Blade'],
  ['moonpiercer', 'craftable', 'Moonpiercer'],
  ['forest_regalia', 'craftable', 'Forest Regalia'],
  ["king's_squire", 'craftable', "King's Squire"],
  ['range_gauge', 'craftable', 'Range Gauge'],
  ['prototype_rancour', 'craftable', 'Prototype Rancour'],
  ['prototype_starglitter', 'craftable', 'Prototype Starglitter'],
  ['prototype_amber', 'craftable', 'Prototype Amber'],
  ['prototype_archaic', 'craftable', 'Prototype Archaic'],
  ['prototype_crescent', 'craftable', 'Prototype Crescent'],
  ['crescent_pike', 'craftable', 'Crescent Pike'],
  ['dragonspine_spear', 'craftable', 'Dragonspine Spear'],
  ['snowtombed_starsilver', 'craftable', 'Snow-Tombed Starsilver'],
  ['iron_sting', 'craftable', 'Iron Sting'],
  ['whiteblind', 'craftable', 'Whiteblind'],

  // ---- battle pass ----
  ['serpent_spine', 'battle-pass', 'Serpent Spine'],
  ['solar_pearl', 'battle-pass', 'Solar Pearl'],
  ['the_viridescent_hunt', 'battle-pass', 'The Viridescent Hunt'],
  ['deathmatch', 'battle-pass', 'Deathmatch'],
  ['the_black_sword', 'battle-pass', 'The Black Sword'],

  // ---- event ----
  ['cinnabar_spindle', 'event', 'Cinnabar Spindle'],
  ['festering_desire', 'event', 'Festering Desire'],
  ['missive_windspear', 'event', 'Missive Windspear'],

  // ---- standard banner: the permanent wish pool ----
  ["amos'_bow", 'standard-banner', "Amos' Bow"],
  ['skyward_harp', 'standard-banner', 'Skyward Harp'],
  ['skyward_blade', 'standard-banner', 'Skyward Blade'],
  ['skyward_pride', 'standard-banner', 'Skyward Pride'],
  ['skyward_atlas', 'standard-banner', 'Skyward Atlas'],
  ['skyward_spine', 'standard-banner', 'Skyward Spine'],
  ['aquila_favonia', 'standard-banner', 'Aquila Favonia'],
  [
    'lost_prayer_to_the_sacred_winds',
    'standard-banner',
    'Lost Prayer to the Sacred Winds',
  ],
  [
    'primordial_jade_wingedspear',
    'standard-banner',
    'Primordial Jade Winged-Spear',
  ],
  ["wolf's_gravestone", 'standard-banner', "Wolf's Gravestone"],
  ['favonius_sword', 'standard-banner', 'Favonius Sword'],
  ['favonius_lance', 'standard-banner', 'Favonius Lance'],
  ['favonius_greatsword', 'standard-banner', 'Favonius Greatsword'],
  ['favonius_warbow', 'standard-banner', 'Favonius Warbow'],
  ['favonius_codex', 'standard-banner', 'Favonius Codex'],
  ['sacrificial_sword', 'standard-banner', 'Sacrificial Sword'],
  ['sacrificial_bow', 'standard-banner', 'Sacrificial Bow'],
  ['sacrificial_greatsword', 'standard-banner', 'Sacrificial Greatsword'],
  ['sacrificial_fragments', 'standard-banner', 'Sacrificial Fragments'],
  ['the_stringless', 'standard-banner', 'The Stringless'],
  ['the_widsith', 'standard-banner', 'The Widsith'],
  ['the_bell', 'standard-banner', 'The Bell'],
  ['rust', 'standard-banner', 'Rust'],

  // ---- limited banner: character-banner weapons ----
  ['staff_of_homa', 'limited-banner', 'Staff of Homa'],
  ['engulfing_lightning', 'limited-banner', 'Engulfing Lightning'],
  ['aqua_simulacra', 'limited-banner', 'Aqua Simulacra'],
  [
    'a_thousand_floating_dreams',
    'limited-banner',
    'A Thousand Floating Dreams',
  ],
  ['light_of_foliar_incision', 'limited-banner', 'Light of Foliar Incision'],
  ['the_first_great_magic', 'limited-banner', 'The First Great Magic'],
  [
    'splendor_of_tranquil_waters',
    'limited-banner',
    'Splendor of Tranquil Waters',
  ],
  ['verdict', 'limited-banner', 'Verdict'],
  ['absolution', 'limited-banner', 'Absolution'],
  ["crimson_moon's_semblance", 'limited-banner', "Crimson Moon's Semblance"],
  ['azurelight', 'limited-banner', 'Azurelight'],
  ['tome_of_the_eternal_flow', 'limited-banner', 'Tome of the Eternal Flow'],
  ['cashflow_supervision', 'limited-banner', 'Cashflow Supervision'],
  ['freedomsworn', 'limited-banner', 'Freedom-Sworn'],
  ['elegy_for_the_end', 'limited-banner', 'Elegy for the End'],
  ['mistsplitter_reforged', 'limited-banner', 'Mistsplitter Reforged'],
  ['thundering_pulse', 'limited-banner', 'Thundering Pulse'],
  ['polar_star', 'limited-banner', 'Polar Star'],
  ['calamity_queller', 'limited-banner', 'Calamity Queller'],
  ["kagura's_verity", 'limited-banner', "Kagura's Verity"],
  ["jadefall's_splendor", 'limited-banner', "Jadefall's Splendor"],
  ['uraku_misugiri', 'limited-banner', 'Uraku Misugiri'],
  ['peak_patrol_song', 'limited-banner', 'Peak Patrol Song'],
  ['chain_breaker', 'limited-banner', 'Chain Breaker'],
  ['fang_of_the_mountain_king', 'limited-banner', 'Fang of the Mountain King'],
  ["starcaller's_watch", 'limited-banner', "Starcaller's Watch"],
  ["surf's_up", 'limited-banner', "Surf's Up"],
  ['lumidouce_elegy', 'limited-banner', 'Lumidouce Elegy'],
  ['primordial_jade_cutter', 'limited-banner', 'Primordial Jade Cutter'],
];

export const WEAPON_OBTAINABILITY: Record<string, Entry> = Object.fromEntries(
  rows.map(([key, tier, page]) => [key, { tier, source: wiki(page) }]),
);
