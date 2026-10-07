import { describe, expect, it } from 'vitest';
import {
  genshinGgSlugFor,
  genshinGgSlugs,
  parseGenshinGgPage,
} from './genshinGg';

// A made-up page in genshin.gg's template.
const PAGE = `
<h1>Genshin Impact Kokomi Build</h1><div>Hydro</div><div>Catalyst</div><div>Support</div>
<h2>Kokomi Best Artifacts</h2>
<div>1</div><div>Tenacity of the Millelith</div><div>4</div>
<div>2</div><div>Ocean-Hued Clam</div><div>2</div><div>Maiden Beloved</div><div>2</div>
<div>3</div><div>Moonlit Lantern</div><div>4</div>
<h2>Kokomi Best Stats</h2>
<div>Sands: HP% / Energy Recharge</div>
<div>Goblet:</div><div>HP%</div>
<div>Circlet: HP% / Healing Bonus</div>
<div>Substats: Energy Rechage &gt; HP% &gt; ATK &gt; Any</div>
`;

describe('genshin.gg pages', () => {
  it('lists the character slugs and finds a character’s', () => {
    const slugs = genshinGgSlugs(
      '<a href="/characters/kokomi/">x</a><a href="/characters/childe/">y</a><a href="/characters/kokomi/">z</a>',
    );
    expect(slugs).toEqual(['kokomi', 'childe']);
    const set = new Set(slugs);
    expect(
      genshinGgSlugFor('sangonomiya_kokomi', 'Sangonomiya Kokomi', set),
    ).toBe('kokomi');
    expect(genshinGgSlugFor('tartaglia', 'Tartaglia', set)).toBe('childe');
    expect(genshinGgSlugFor('vesna', 'Vesna', set)).toBeUndefined();
  });

  it('reads the one build, a label on one line or two', () => {
    const page = parseGenshinGgPage(PAGE);
    expect(page.roleLabel).toBe('Support');
    expect(page.build).toMatchObject({
      name: 'Support',
      role: 'support',
      mains: {
        sands: ['hp_pct', 'er_pct'],
        goblet: ['hp_pct'],
        circlet: ['hp_pct', 'healing'],
      },
      // Its "ATK" is flat ATK; "Any" is a placeholder.
      substats: ['er_pct', 'hp_pct', 'atk'],
      sets: [['TenacityOfTheMillelith'], ['OceanHuedClam', 'MaidenBeloved']],
    });
    expect(page.issues).toEqual(['set "Moonlit Lantern" not in the dataset']);
  });

  it('says so when a page isn’t in the template', () => {
    expect(parseGenshinGgPage('<p>new layout</p>')).toEqual({
      issues: ['page not in the usual template'],
    });
  });
});
