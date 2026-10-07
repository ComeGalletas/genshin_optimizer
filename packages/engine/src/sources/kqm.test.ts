import { describe, expect, it } from 'vitest';
import { parseKqmGuide } from './kqm';
import { blocksOf, decodeEntities, sectionAfter } from './html';

// A made-up page in a KQM quick guide's shape (no real guide text).
const PAGE = `
<h1>Testchar Quick Guide</h1>
<h6>Updated for Version &#8220;Luna V&#8221;</h6>
<h2>ER Requirements</h2>
<h4>On-Field</h4>
<table><tr><th></th><th>Base</th><th>Favonius Codex</th><th>Double Hydro</th></tr>
<tr><td>Solo Hydro</td><td>195&#8211;245%</td><td>160&#8211;205%</td><td>150%</td></tr></table>
<h4>Off-Field</h4>
<table><tr><th>Base</th></tr><tr><td>260&#8211;315%</td></tr></table>
<h1>On-Field Healer</h1>
<h2>Artifact Stats</h2>
<table><tr><td>Sands</td><td>Goblet</td><td>Circlet</td></tr>
<tr><td>HP% or Energy Recharge</td><td>Hydro DMG Bonus &gt; HP%</td><td>Healing Bonus</td></tr></table>
<p>Stat Priority: ER (until requirement) &gt; HP% &gt; Flat HP</p>
<h2>Artifact Sets</h2>
<table>
<tr><td>4pc Ocean-Hued Clam (OHC)</td><td>Best.</td></tr>
<tr><td>4pc Tenacity of the Millelith (TotM) 4pc Scroll of the Hero of Cinder City</td><td>Tied.</td></tr>
<tr><td>4pc Emblem of Severe Fate</td><td>Misspelt.</td></tr>
<tr><td>2pc Husk + 2pc Emblem of Severed Fate</td><td>Pair.</td></tr>
<tr><td>2pc + 2pc EM / ER</td><td>Generic.</td></tr>
<tr><td>4pc Support Sets</td><td>A heading.</td></tr>
</table>
<h1>Off-Field Support</h1>
<h2>Artifacts</h2>
<h3>Artifact Stats</h3>
<table><tr><td>Sands</td><td>Goblet</td><td>Circlet</td></tr>
<tr><td>HP%</td><td>HP%</td><td>Healing Bonus</td></tr></table>
<p>Stat Priority (EM Build): ER &gt; EM</p>
<p>Stat Priority (HP Build): ER &gt; HP%</p>
<h3>Artifact Sets</h3>
<table><tr><td>4pc Song of Days Past</td><td>x</td></tr></table>
<h1>General</h1>
<h2>Artifact Stats</h2>
<h4>C0–C5</h4>
<table><tr><td>Sands</td><td>Goblet</td><td>Circlet</td></tr>
<tr><td>ATK%</td><td>Geo DMG Bonus</td><td>CRIT</td></tr></table>
<p>Substats:</p><p>ER% &gt; CRIT &gt; ATK%</p>
<h4>C6 or Burst Talent Level 10+</h4>
<table><tr><td>Sands</td><td>Goblet</td><td>Circlet</td></tr>
<tr><td>DEF%</td><td>Geo DMG Bonus / DEF%</td><td>Mystery Stat</td></tr></table>
<p>Stat Priority: ER% &gt; CRIT &gt; DEF%</p>
<h2>Artifact Sets</h2>
<table><tr><td>4pc Husk of Opulent Dreams</td><td>x</td></tr></table>
<h1>Teams</h1><p>Not a build.</p>
`;

describe('blocksOf', () => {
  it('reads headings, rows and text, entities decoded', () => {
    const blocks = blocksOf(
      '<h2>A &amp; B</h2><p>x<br>y</p><table><tr><td>1</td><td>2</td></tr></table>',
    );
    expect(blocks).toEqual([
      { kind: 'h', level: 2, text: 'A & B' },
      { kind: 'text', text: 'x' },
      { kind: 'text', text: 'y' },
      { kind: 'row', cells: ['1', '2'] },
    ]);
    expect(decodeEntities('&#8217;&#x41;&rsquo;&nbsp;')).toBe('’A’ ');
    expect(sectionAfter(blocks, 0)).toHaveLength(3);
    expect(sectionAfter(blocks, 1)).toEqual([]);
    // Line breaks in a cell separate options; at its edges they separate
    // nothing.
    expect(
      blocksOf(
        '<table><tr><td><br>Sands<br></td><td>EM<br>ER<br><br>HP%</td></tr></table>',
      ),
    ).toEqual([{ kind: 'row', cells: ['Sands', 'EM / ER / HP%'] }]);
  });
});

describe('parseKqmGuide', () => {
  const page = parseKqmGuide(PAGE);
  const byName = (n: string) => page.builds.find((b) => b.name === n)!;

  it('reads every build section, and the version', () => {
    expect(page.updatedFor).toBe('Luna V');
    expect(page.builds.map((b) => b.name)).toEqual([
      'On-Field Healer',
      'Off-Field Support (EM Build)',
      'Off-Field Support (HP Build)',
      'C0–C5',
      'C6 or Burst Talent Level 10+',
    ]);
    expect(page.issues).toEqual([]);
  });

  it('reads main stats, substats and sets', () => {
    const b = byName('On-Field Healer');
    expect(b.role).toBe('healer');
    expect(b.roleFrom).toBe('name');
    expect(b.mains).toEqual({
      sands: ['hp_pct', 'er_pct'],
      goblet: ['elemental_dmg', 'hp_pct'],
      circlet: ['healing'],
    });
    expect(b.substats).toEqual(['er_pct', 'hp_pct', 'hp']);
    expect(b.sets).toEqual([
      ['OceanHuedClam'],
      ['TenacityOfTheMillelith'],
      ['ScrollOfTheHeroOfCinderCity'],
      ['EmblemOfSeveredFate'],
      ['HuskOfOpulentDreams', 'EmblemOfSeveredFate'],
    ]);
    expect(b.flags?.some((f) => f.startsWith('set name read loosely'))).toBe(
      true,
    );
    expect(page.texts['On-Field Healer']).toContain('Stat Priority');
  });

  it('reads the Energy Recharge table each build matches, with weapon columns only', () => {
    const on = byName('On-Field Healer');
    expect(on.erMin).toBe(195);
    expect(on.erWeapons).toEqual([{ weapon: 'Favonius Codex', min: 160 }]);
    expect(byName('Off-Field Support (EM Build)').erMin).toBe(260);
  });

  it('splits stat-priority variants and sub-headed tables into builds', () => {
    expect(byName('Off-Field Support (EM Build)').substats).toEqual([
      'er_pct',
      'em',
    ]);
    expect(byName('Off-Field Support (HP Build)').substats).toEqual([
      'er_pct',
      'hp_pct',
    ]);
    const c0 = byName('C0–C5');
    expect(c0.substats).toEqual(['er_pct', 'crit_rate', 'crit_dmg', 'atk_pct']);
    expect(c0.roleFrom).toBe('review');
    expect(c0.flags).toContain('role not clear from "C0–C5"');
    const c6 = byName('C6 or Burst Talent Level 10+');
    expect(c6.constellation).toBe('C6');
    expect(c6.mains.goblet).toEqual(['elemental_dmg', 'def_pct']);
    expect(c6.flags?.some((f) => f.startsWith('no circlet main stat'))).toBe(
      true,
    );
  });

  it('says so when a page has no build sections', () => {
    expect(
      parseKqmGuide('<h1>Old Guide</h1><p>Prose only.</p>').issues,
    ).toEqual(['no build sections (Artifact Stats + Artifact Sets) found']);
  });
});

describe('Energy Recharge, to burst every rotation and every other', () => {
  const page = (er: string) =>
    parseKqmGuide(`
<h1>X Quick Guide</h1>
<h2>ER Requirements</h2>${er}
<h1>Only Build</h1>
<h2>Artifact Stats</h2>
<table><tr><td>Sands</td><td>Goblet</td><td>Circlet</td></tr>
<tr><td>ATK%</td><td>Pyro DMG Bonus</td><td>CRIT</td></tr></table>
<p>Stat Priority: ER &gt; CRIT</p>
<h2>Artifact Sets</h2>
<table><tr><td>4pc Crimson Witch of Flames</td><td>x</td></tr></table>`)
      .builds[0];

  it('reads a column for each, leaving a constellation’s column out', () => {
    const b = page(`<table>
<tr><th></th><th>Burst Every Rot</th><th>Every Rotation (C4+)</th><th>Burst Every Other</th></tr>
<tr><td>Solo Cryo</td><td>190–230%</td><td>145–175%</td><td>100–115%</td></tr></table>`);
    expect([b.erMin, b.erEveryOther]).toEqual([190, 100]);
  });

  it('reads rows labelled by cadence', () => {
    const b =
      page(`<table><tr><td>Burst Every Rotation</td><td>170–185%</td></tr>
<tr><td>Burst When Available</td><td>100%</td></tr></table>`);
    expect([b.erMin, b.erEveryOther]).toEqual([170, 100]);
  });

  it('takes an unlabelled figure as every rotation, and 100% every other when the guide says to skip it', () => {
    const b = page(`<p>Use it when available instead.</p>
<table><tr><td>Solo Pyro</td><td>260–270%</td></tr></table>`);
    expect([b.erMin, b.erEveryOther]).toEqual([260, 100]);
    const plain = page(
      `<table><tr><td>Solo Pyro</td><td>150%</td></tr></table>`,
    );
    expect([plain.erMin, plain.erEveryOther]).toEqual([150, undefined]);
  });

  it('reads weapons down the rows: "Other" is the general figure', () => {
    const b =
      page(`<table><tr><th>Weapon</th><th>Pre-C4 ER Requirement</th></tr>
<tr><td>Favonius Lance</td><td>175–230%</td></tr>
<tr><td>Other</td><td>190–250%</td></tr></table>`);
    expect(b.erMin).toBe(190);
    expect(b.erWeapons).toEqual([{ weapon: 'Favonius Lance', min: 175 }]);
  });
});
