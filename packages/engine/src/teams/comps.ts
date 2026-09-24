/**
 * Curated comp archetypes: 4-slot team recipes with ranked substitutes.
 *
 * // ponytail: hand-transcribed from the `source` guides below, same freshness
 * // caveat as src/meta/metaTargets.ts and src/meta/teammates.ts — curated as of
 * // patch 6.7, no automated drift check; the `source` link is the
 * // re-verification path.
 *
 * Substitution weights: 1.0 ideal, 0.85 strong sub, 0.7 workable, 0.5 stopgap.
 * The first option in every slot is the ideal, and each slot's ideal is a
 * distinct character, so an archetype's ideal lineup is always four people.
 *
 * Seeded by expanding every entry in `src/meta/teammates.ts` into a full
 * archetype, plus the current Abyss floor-12 staples from the research report
 * (`docs/research/2026-08-20-endgame-meta-and-team-recs.md`).
 */
import type { CompArchetype, Role } from './types';

const ABYSS_ONLY: CompArchetype['modes'] = ['abyss'];

export const COMP_ARCHETYPES: CompArchetype[] = [
  {
    id: 'neuvillette-mono-hydro',
    name: 'Neuvillette Mono-Hydro',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/neuvillette/',
    notes:
      'Neuvillette holds the field the whole rotation; everyone else buffs and heals him.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'neuvillette', weight: 1 }],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'furina', weight: 1 },
          { characterKey: 'yelan', weight: 0.7 },
          { characterKey: 'xingqiu', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'kaedehara_kazuha', weight: 1 },
          { characterKey: 'jean', weight: 0.85 },
          { characterKey: 'sucrose', weight: 0.7 },
          { characterKey: 'venti', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'charlotte', weight: 1 },
          { characterKey: 'sigewinne', weight: 0.85 },
          { characterKey: 'baizhu', weight: 0.85 },
          { characterKey: 'barbara', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'raiden-national',
    name: 'Raiden National',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/raiden/',
    notes:
      'The evergreen four: Raiden bursts, Xiangling vaporizes off-field, Xingqiu applies, Bennett buffs.',
    slots: [
      {
        role: 'on-field-dps',
        options: [
          { characterKey: 'raiden_shogun', weight: 1 },
          { characterKey: 'tartaglia', weight: 0.85 },
        ],
      },
      {
        role: 'off-field-dps',
        options: [{ characterKey: 'xiangling', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'xingqiu', weight: 1 },
          { characterKey: 'yelan', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'kaedehara_kazuha', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'hu-tao-vape',
    name: 'Hu Tao Vaporize',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/hu-tao/',
    notes:
      'Charged-attack vaporize under a shield; Xingqiu supplies the Hydro aura.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'hu_tao', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'xingqiu', weight: 1 },
          { characterKey: 'yelan', weight: 0.85 },
        ],
      },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'yelan', weight: 1 },
          { characterKey: 'xingqiu', weight: 0.85 },
          { characterKey: 'furina', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'layla', weight: 0.7 },
          { characterKey: 'diona', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'nahida-hyperbloom',
    name: 'Nahida Hyperbloom',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/nahida/',
    notes:
      'Dendro + Hydro make cores; an Electro trigger detonates them. Damage comes from EM, not the carry.',
    slots: [
      { role: 'applicator', options: [{ characterKey: 'nahida', weight: 1 }] },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'kuki_shinobu', weight: 1 },
          { characterKey: 'raiden_shogun', weight: 0.85 },
          { characterKey: 'fischl', weight: 0.7 },
        ],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'xingqiu', weight: 1 },
          { characterKey: 'yelan', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'baizhu', weight: 0.85 },
          { characterKey: 'kirara', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'nahida-aggravate',
    name: 'Nahida Aggravate',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/nahida/',
    notes:
      'Quicken aura turns every Electro hit into an aggravate; Raiden supplies both damage and energy.',
    slots: [
      { role: 'applicator', options: [{ characterKey: 'nahida', weight: 1 }] },
      {
        role: 'on-field-dps',
        options: [
          { characterKey: 'raiden_shogun', weight: 1 },
          { characterKey: 'keqing', weight: 0.85 },
          { characterKey: 'clorinde', weight: 0.85 },
        ],
      },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'fischl', weight: 1 },
          { characterKey: 'yae_miko', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'kuki_shinobu', weight: 1 },
          { characterKey: 'zhongli', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'alhaitham-spread',
    name: 'Alhaitham Spread',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/alhaitham/',
    notes:
      'Alhaitham holds the field under a Quicken aura; his mirrors scale hard on EM.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'alhaitham', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'nahida', weight: 1 },
          { characterKey: 'yaoyao', weight: 0.7 },
          { characterKey: 'collei', weight: 0.5 },
        ],
      },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'fischl', weight: 1 },
          { characterKey: 'yae_miko', weight: 0.85 },
          { characterKey: 'kuki_shinobu', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'baizhu', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'arlecchino-vape',
    name: 'Arlecchino Vaporize',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/arlecchino/',
    notes:
      "Hydro off-field for vaporize, no healer — healing eats Arlecchino's Bond of Life.",
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'arlecchino', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'yelan', weight: 1 },
          { characterKey: 'xingqiu', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'kaedehara_kazuha', weight: 1 },
          { characterKey: 'sucrose', weight: 0.7 },
          { characterKey: 'venti', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'layla', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'xiao-anemo',
    name: 'Xiao Plunge',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/xiao/',
    notes:
      'Anemo RES shred plus plunge buffs; Xiao burns his own HP for uptime.',
    slots: [
      { role: 'on-field-dps', options: [{ characterKey: 'xiao', weight: 1 }] },
      {
        role: 'buffer',
        options: [
          { characterKey: 'xianyun', weight: 1 },
          { characterKey: 'jean', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'faruzan', weight: 1 },
          { characterKey: 'sucrose', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'zhongli', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'ayaka-freeze',
    name: 'Ayaka Freeze',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/ayaka/',
    notes:
      'Permafreeze locks the field down, so the team needs no healer at all.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'kamisato_ayaka', weight: 1 }],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'shenhe', weight: 1 },
          { characterKey: 'mika', weight: 0.7 },
        ],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'kamisato_ayato', weight: 1 },
          { characterKey: 'mona', weight: 0.85 },
          { characterKey: 'xingqiu', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'kaedehara_kazuha', weight: 1 },
          { characterKey: 'venti', weight: 0.85 },
          { characterKey: 'jean', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'ganyu-melt',
    name: 'Ganyu Melt',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/ganyu/',
    notes: 'Charge-level-2 aimed shots melting off Xiangling and Bennett Pyro.',
    slots: [
      { role: 'on-field-dps', options: [{ characterKey: 'ganyu', weight: 1 }] },
      {
        role: 'off-field-dps',
        options: [{ characterKey: 'xiangling', weight: 1 }],
      },
      { role: 'buffer', options: [{ characterKey: 'bennett', weight: 1 }] },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'diona', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'navia-geo',
    name: 'Navia Geo',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/navia/',
    notes:
      'Navia converts crystallize shards into shardshot; Geo resonance and RES shred do the rest.',
    slots: [
      { role: 'on-field-dps', options: [{ characterKey: 'navia', weight: 1 }] },
      {
        role: 'buffer',
        options: [
          { characterKey: 'xilonen', weight: 1 },
          { characterKey: 'chiori', weight: 0.85 },
          { characterKey: 'gorou', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'yun_jin', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'baizhu', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'itto-mono-geo',
    name: 'Itto Mono-Geo',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/itto/',
    notes: 'DEF-scaling charged attacks under Geo resonance and Gorou buffs.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'arataki_itto', weight: 1 }],
      },
      { role: 'buffer', options: [{ characterKey: 'gorou', weight: 1 }] },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'albedo', weight: 1 },
          { characterKey: 'chiori', weight: 0.85 },
          { characterKey: 'noelle', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'yun_jin', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'clorinde-aggravate',
    name: 'Clorinde Aggravate',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/clorinde/',
    notes:
      'Bond-of-Life pistol shots under a Quicken aura; she wants no incoming healing.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'clorinde', weight: 1 }],
      },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'fischl', weight: 1 },
          { characterKey: 'yae_miko', weight: 0.85 },
        ],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'nahida', weight: 1 },
          { characterKey: 'yaoyao', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'kuki_shinobu', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'wanderer-anemo',
    name: 'Wanderer Hypercarry',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/wanderer/',
    notes: 'Hovering Anemo carry; Faruzan is close to mandatory for the shred.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'wanderer', weight: 1 }],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'faruzan', weight: 1 },
          { characterKey: 'sucrose', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'xianyun', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'jean', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'keqing-aggravate',
    name: 'Keqing Aggravate',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/keqing/',
    notes:
      'Fast Electro application on-field turns Quicken into steady aggravates.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'keqing', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'nahida', weight: 1 },
          { characterKey: 'yaoyao', weight: 0.7 },
        ],
      },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'fischl', weight: 1 },
          { characterKey: 'yae_miko', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'kuki_shinobu', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'cyno-quicken',
    name: 'Cyno Quicken',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/cyno/',
    notes:
      "Cyno's burst stance wants long uninterrupted field time under Quicken.",
    slots: [
      { role: 'on-field-dps', options: [{ characterKey: 'cyno', weight: 1 }] },
      {
        role: 'applicator',
        options: [
          { characterKey: 'nahida', weight: 1 },
          { characterKey: 'collei', weight: 0.5 },
        ],
      },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'fischl', weight: 1 },
          { characterKey: 'yae_miko', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'kuki_shinobu', weight: 1 },
          { characterKey: 'zhongli', weight: 0.85 },
          { characterKey: 'baizhu', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'childe-international',
    name: 'Childe International',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/childe/',
    notes:
      'Childe applies Hydro in melee stance; Xiangling vaporizes off it after he swaps out.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'tartaglia', weight: 1 }],
      },
      {
        role: 'off-field-dps',
        options: [{ characterKey: 'xiangling', weight: 1 }],
      },
      { role: 'buffer', options: [{ characterKey: 'bennett', weight: 1 }] },
      {
        role: 'buffer',
        options: [
          { characterKey: 'kaedehara_kazuha', weight: 1 },
          { characterKey: 'sucrose', weight: 0.7 },
          { characterKey: 'venti', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'yoimiya-vape',
    name: 'Yoimiya Vaporize',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/yoimiya/',
    notes:
      'Single-target normal-attack vaporize; Yelan keeps Hydro up off-field.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'yoimiya', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'yelan', weight: 1 },
          { characterKey: 'xingqiu', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'yun_jin', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'baizhu', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'wriothesley-mono-cryo',
    name: 'Wriothesley Mono-Cryo',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/wriothesley/',
    notes: 'Cryo resonance plus Shenhe shred on a self-healing on-field carry.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'wriothesley', weight: 1 }],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'shenhe', weight: 1 },
          { characterKey: 'mika', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'kaedehara_kazuha', weight: 1 },
          { characterKey: 'rosaria', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'charlotte', weight: 1 },
          { characterKey: 'diona', weight: 0.7 },
          { characterKey: 'layla', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'klee-vape',
    name: 'Klee Vaporize',
    modes: ABYSS_ONLY,
    tier: 3,
    source: 'https://keqingmains.com/klee/',
    notes: 'Charged-attack Pyro vaporize; wants interruption resistance badly.',
    slots: [
      { role: 'on-field-dps', options: [{ characterKey: 'klee', weight: 1 }] },
      {
        role: 'applicator',
        options: [
          { characterKey: 'xingqiu', weight: 1 },
          { characterKey: 'yelan', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'kaedehara_kazuha', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'layla', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'mualani-vape',
    name: 'Mualani Vaporize',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/mualani/',
    notes:
      'Nightsoul surfing bites vaporizing off a Pyro aura; heavily HP-scaling.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'mualani', weight: 1 }],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'xilonen', weight: 1 },
          { characterKey: 'kaedehara_kazuha', weight: 0.85 },
        ],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'citlali', weight: 1 },
          { characterKey: 'xiangling', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'furina', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'kinich-burnmelt',
    name: 'Kinich Burnmelt',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/kinich/',
    notes:
      'Dendro on-field carry riding a Burning aura; Emilie keeps it alive.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'kinich', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'emilie', weight: 1 },
          { characterKey: 'xiangling', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'xilonen', weight: 1 },
          { characterKey: 'kaedehara_kazuha', weight: 0.7 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'zhongli', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'mavuika-pyro',
    name: 'Mavuika Pyro',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/mavuika/',
    notes:
      'Nightsoul Pyro hypercarry; Xilonen shreds and Citlali adds Cryo shred.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'mavuika', weight: 1 }],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'xilonen', weight: 1 },
          { characterKey: 'kaedehara_kazuha', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'citlali', weight: 1 },
          { characterKey: 'bennett', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'baizhu', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'nilou-bloom',
    name: 'Nilou Bloom',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/nilou/',
    notes:
      'Hydro + Dendro only — a single off-element unit turns Bountiful Cores back into ordinary blooms.',
    slots: [
      { role: 'on-field-dps', options: [{ characterKey: 'nilou', weight: 1 }] },
      {
        role: 'applicator',
        options: [
          { characterKey: 'nahida', weight: 1 },
          { characterKey: 'yaoyao', weight: 0.7 },
          { characterKey: 'collei', weight: 0.5 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'sangonomiya_kokomi', weight: 1 },
          { characterKey: 'barbara', weight: 0.7 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'baizhu', weight: 1 },
          { characterKey: 'kirara', weight: 0.7 },
          { characterKey: 'yaoyao', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'yae-quickbloom',
    name: 'Yae Miko Quickbloom',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/yae-miko/',
    notes:
      'Totems trigger both aggravate and hyperbloom while Yae stays off-field.',
    slots: [
      {
        role: 'off-field-dps',
        options: [{ characterKey: 'yae_miko', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'nahida', weight: 1 },
          { characterKey: 'yaoyao', weight: 0.7 },
        ],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'xingqiu', weight: 1 },
          { characterKey: 'yelan', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'kuki_shinobu', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'furina-neuvillette-double-hydro',
    name: 'Furina Double-Hydro',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/furina/',
    notes:
      "Furina's Fanfare buff scales with HP swings, so the team wants a healer who heals often.",
    slots: [
      { role: 'buffer', options: [{ characterKey: 'furina', weight: 1 }] },
      {
        role: 'on-field-dps',
        options: [
          { characterKey: 'neuvillette', weight: 1 },
          { characterKey: 'arlecchino', weight: 0.85 },
          { characterKey: 'clorinde', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'sangonomiya_kokomi', weight: 1 },
          { characterKey: 'charlotte', weight: 0.85 },
          { characterKey: 'jean', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'kaedehara_kazuha', weight: 1 },
          { characterKey: 'sucrose', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'skirk-mono-cryo',
    name: 'Skirk Mono-Cryo',
    modes: ABYSS_ONLY,
    tier: 1,
    source: 'https://keqingmains.com/skirk/',
    notes:
      'Cryo hypercarry wanting constant Cryo/Hydro application to fuel her stance.',
    slots: [
      { role: 'on-field-dps', options: [{ characterKey: 'skirk', weight: 1 }] },
      {
        role: 'applicator',
        options: [
          { characterKey: 'escoffier', weight: 1 },
          { characterKey: 'shenhe', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'furina', weight: 1 },
          { characterKey: 'kaedehara_kazuha', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'charlotte', weight: 1 },
          { characterKey: 'sigewinne', weight: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'ayato-hydro',
    name: 'Ayato Hydro',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/ayato/',
    notes:
      'Fast Hydro application on-field, flexible into freeze or bloom shells.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'kamisato_ayato', weight: 1 }],
      },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'xiangling', weight: 1 },
          { characterKey: 'fischl', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'bennett', weight: 1 },
          { characterKey: 'kaedehara_kazuha', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'jean', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'chevreuse-overload',
    name: 'Chevreuse Overload',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/chevreuse/',
    notes:
      'Pyro + Electro only — Chevreuse shreds both RES, but off-element units break the buff.',
    slots: [
      {
        role: 'on-field-dps',
        options: [
          { characterKey: 'arlecchino', weight: 1 },
          { characterKey: 'hu_tao', weight: 0.85 },
          { characterKey: 'yoimiya', weight: 0.85 },
        ],
      },
      { role: 'buffer', options: [{ characterKey: 'chevreuse', weight: 1 }] },
      {
        role: 'off-field-dps',
        options: [
          { characterKey: 'fischl', weight: 1 },
          { characterKey: 'beidou', weight: 0.7 },
        ],
      },
      {
        role: 'battery',
        options: [
          { characterKey: 'kujou_sara', weight: 1 },
          { characterKey: 'thoma', weight: 0.7 },
        ],
      },
    ],
  },
  {
    id: 'chasca-anemo',
    name: 'Chasca Anemo',
    modes: ABYSS_ONLY,
    tier: 2,
    source: 'https://keqingmains.com/chasca/',
    notes:
      'Nightsoul shots convert to whatever element the team supplies; wants two off-element applicators.',
    slots: [
      {
        role: 'on-field-dps',
        options: [{ characterKey: 'chasca', weight: 1 }],
      },
      {
        role: 'applicator',
        options: [
          { characterKey: 'ororon', weight: 1 },
          { characterKey: 'fischl', weight: 0.85 },
        ],
      },
      {
        role: 'buffer',
        options: [
          { characterKey: 'furina', weight: 1 },
          { characterKey: 'bennett', weight: 0.85 },
        ],
      },
      {
        role: 'sustain',
        options: [
          { characterKey: 'zhongli', weight: 1 },
          { characterKey: 'baizhu', weight: 0.7 },
        ],
      },
    ],
  },
];

// The archetype table is a module constant, so both indexes are built once.
const BY_ID = new Map(COMP_ARCHETYPES.map((a) => [a.id, a]));

const BY_CHARACTER = new Map<string, CompArchetype[]>();
for (const a of COMP_ARCHETYPES) {
  // A character can appear in two slots of one archetype (e.g. Xingqiu as both
  // applicator and off-field sub), so dedupe before indexing.
  const keys = new Set(
    a.slots.flatMap((s) => s.options.map((o) => o.characterKey)),
  );
  for (const key of keys) {
    const list = BY_CHARACTER.get(key);
    if (list) list.push(a);
    else BY_CHARACTER.set(key, [a]);
  }
}

export function getArchetype(id: string): CompArchetype | undefined {
  return BY_ID.get(id);
}

/** Falls back to the raw id rather than crashing: archetype ids travel through
 *  team instances and gap reports, which outlive any one curation pass. */
export function archetypeName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

/** Every archetype this character appears in, at any slot or substitute rank. */
export function archetypesFor(characterKey: string): CompArchetype[] {
  return BY_CHARACTER.get(characterKey) ?? [];
}

/** A derived "works well with" entry for `OptimizePanel`'s info panel
 *  (issue #90): replaces the old, hand-curated `TEAMMATES` table with a view
 *  over `COMP_ARCHETYPES` so the two can't drift apart again. */
export interface DerivedTeammate {
  characterKey: string;
  role: Role;
  why: string;
}

/** Picks the archetype where this character has its highest substitution
 *  weight (its best-fit slot) and lists the ideal pick of every other slot
 *  as a teammate, with the archetype's own note as the shared rationale. */
export function teammatesFor(
  characterKey: string,
): { recs: DerivedTeammate[]; source: string } | undefined {
  let best: CompArchetype | undefined;
  let bestSlotIndex = -1;
  let bestWeight = -1;
  for (const a of archetypesFor(characterKey)) {
    a.slots.forEach((slot, i) => {
      const opt = slot.options.find((o) => o.characterKey === characterKey);
      if (opt && opt.weight > bestWeight) {
        bestWeight = opt.weight;
        best = a;
        bestSlotIndex = i;
      }
    });
  }
  if (!best) return undefined;
  const recs = best.slots
    .filter((_, i) => i !== bestSlotIndex)
    .map((slot) => ({
      characterKey: slot.options[0].characterKey,
      role: slot.role,
      why: best!.notes,
    }));
  return { recs, source: best.source };
}
