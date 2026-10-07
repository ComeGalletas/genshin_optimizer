import { describe, expect, it } from 'vitest';
import {
  decodeAstroProps,
  islandProps,
  parseGenshinBuildsPage,
} from './genshinBuilds';

/** Astro's serialized-props form: values as [0, value], arrays as [1, ...]. */
const ser = (v: unknown): unknown =>
  Array.isArray(v)
    ? [1, v.map(ser)]
    : v && typeof v === 'object'
      ? [0, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)]))]
      : [0, v];
const island = (component: string, props: Record<string, unknown>) => {
  const p = (ser(props) as [number, Record<string, unknown>])[1];
  const attr = JSON.stringify(p).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<astro-island uid="x" component-url="/_astro/${component}.Ab12.js" props="${attr}" ssr></astro-island>`;
};

// A made-up page in genshin-builds' shape.
const PAGE =
  island('RevIQAd', { placementName: 'left-rail-1' }) +
  island('CharacterBuildTabs', {
    builds: [
      {
        name: 'HEAL\n\nSUPPORT',
        role: 'HEAL SUPPORT',
        recommended: true,
        sets: [
          ['tenacity_of_the_millelith'],
          ['oceanhued_clam', 'maiden_beloved'],
          ['15healingbonus_set', '20hp_set'],
        ],
        stats: {
          sands: ['Energy Recharge', 'HP%'],
          goblet: ['HP%'],
          circlet: ['Healing Bonus'],
        },
        stats_priority: ['Energy Recharge', 'HP%', 'HP'],
      },
      {
        name: 'DPS (OUT OF DATE)',
        role: 'DPS',
        recommended: true,
        sets: [['heart_of_depth']],
        stats: { sands: ['HP%'], goblet: ['Hydro DMG Bonus'], circlet: [] },
        stats_priority: [],
      },
      {
        name: 'BLOOM DPS',
        role: 'BLOOM DPS',
        recommended: false,
        sets: [['flower_of_paradise_lost']],
        stats: {
          sands: ['Elemental Mastery'],
          goblet: ['Elemental Mastery'],
          circlet: ['Elemental Mastery'],
        },
        stats_priority: ['Elemental Mastery'],
      },
    ],
  }) +
  island('CharacterTeamsSection', {
    teams: [
      {
        name: 'Test Team',
        tier: 'S',
        characters: [
          { id: 'sangonomiya_kokomi', role: 'Main DPS', c_min: 0 },
          { id: 'nahida', role: 'Sub DPS', c_min: 2 },
          { id: 'nobody_new', role: 'Support' },
        ],
      },
    ],
  });

describe('decodeAstroProps', () => {
  it('unwraps values and arrays, and leaves other tags as given', () => {
    expect(
      decodeAstroProps([
        0,
        {
          a: [
            1,
            [
              [0, 'x'],
              [0, 2],
            ],
          ],
        },
      ]),
    ).toEqual({
      a: ['x', 2],
    });
    expect(decodeAstroProps([3, '2026-01-01'])).toBe('2026-01-01');
    expect(
      islandProps('<p>no islands</p>', 'CharacterBuildTabs'),
    ).toBeUndefined();
  });
});

describe('parseGenshinBuildsPage', () => {
  const page = parseGenshinBuildsPage(PAGE);

  it('reads each build from the page data', () => {
    const [heal, dps, bloom] = page.builds;
    expect(heal).toMatchObject({
      name: 'HEAL SUPPORT',
      role: 'healer',
      roleFrom: 'label',
      mains: {
        sands: ['er_pct', 'hp_pct'],
        goblet: ['hp_pct'],
        circlet: ['healing'],
      },
      substats: ['er_pct', 'hp_pct', 'hp'],
      // The generic 2+2 (healing + HP bonus sets) is left out.
      sets: [['TenacityOfTheMillelith'], ['OceanHuedClam', 'MaidenBeloved']],
    });
    expect(heal.excluded).toBeUndefined();
    expect(dps.excluded).toBe('the page marks it out of date');
    expect(dps.flags).toEqual(['no circlet main stat', 'no stat priority']);
    expect(bloom.excluded).toBe('the page marks it not recommended');
    expect(bloom.role).toBe('reaction_dps');
  });

  it('reads the teams, and flags a member the dataset doesn’t know', () => {
    expect(page.teams).toEqual([
      {
        name: 'Test Team',
        tier: 'S',
        members: [
          { characterKey: 'sangonomiya_kokomi', role: 'Main DPS' },
          { characterKey: 'nahida', role: 'Sub DPS', minConstellation: 2 },
          { characterKey: 'nobody_new', role: 'Support' },
        ],
      },
    ]);
    expect(page.issues).toEqual([
      'team "Test Team": nobody_new not in the dataset',
    ]);
  });

  it('says so when the page has no build data', () => {
    expect(parseGenshinBuildsPage('<p>moved</p>').issues).toContain(
      'no CharacterBuildTabs data on the page',
    );
  });
});
