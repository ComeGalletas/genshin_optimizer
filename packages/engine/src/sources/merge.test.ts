import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildLabel,
  genshinGgData,
  mergeGuideBuilds,
  whyUnscored,
} from './merge';
import type { SourceBuild, SourceFile } from './types';
import { GUIDE_BUILDS } from '../meta/guideBuilds';
import { GENSHIN_GG, GENSHIN_GG_BUILDS } from '../meta/genshinGg';
import { genshinAdapter } from '../game/genshin/adapter';

const build = (over: Partial<SourceBuild>): SourceBuild => ({
  name: 'Build',
  role: 'support',
  roleFrom: 'name',
  mains: { sands: ['er_pct'], goblet: ['hp_pct'], circlet: ['healing'] },
  substats: ['er_pct', 'hp_pct'],
  sets: [['OceanHuedClam']],
  ...over,
});
const file = (
  source: SourceFile['source'],
  builds: SourceBuild[],
): SourceFile => ({
  source,
  site: 'https://example.test',
  readBy: 'script',
  characters: {
    x: { url: `https://example.test/${source}`, fetched: '2026-10-07', builds },
  },
});

describe('mergeGuideBuilds', () => {
  it('joins builds of the same role, keeps others apart, and leaves exclusions out', () => {
    const merged = mergeGuideBuilds(
      file('kqm', [
        build({
          name: 'Healer',
          role: 'healer',
          erMin: 195,
          erWeapons: [{ weapon: 'Fav', min: 160 }],
        }),
        build({ name: 'C6', role: 'support', constellation: 'C6' }),
        build({ name: 'Broken', role: 'shield', substats: [] }),
      ]),
      file('genshinBuilds', [
        build({
          name: 'HEAL SUPPORT',
          role: 'healer',
          mains: { sands: ['hp_pct'], goblet: ['hp_pct'], circlet: ['hp_pct'] },
          sets: [['TenacityOfTheMillelith', 'OceanHuedClam']],
          erWeapons: [{ weapon: 'Amber', min: 150 }],
        }),
        build({ name: 'Support', role: 'support' }),
        build({ name: 'Old', role: 'on_field_dps', excluded: 'out of date' }),
      ]),
      () => 'Character X',
    ).x;
    expect(merged.kqm).toBe('https://example.test/kqm');
    expect(merged.builds.map((b) => [b.name, b.sources])).toEqual([
      ['Healer', ['kqm', 'genshinBuilds']],
      ['C6', ['kqm']],
      ['Support', ['genshinBuilds']],
    ]);
    const healer = merged.builds[0];
    expect(healer.accepts.sands).toEqual(['er_pct', 'hp_pct']);
    expect(healer.accepts.circlet).toEqual(['healing', 'hp_pct']);
    expect(healer.sets).toEqual(['OceanHuedClam', 'TenacityOfTheMillelith']);
    expect(healer.erMin).toBe(195);
    expect(healer.erWeapons).toHaveLength(2);
    expect(merged.unscored).toEqual([
      {
        name: 'Broken',
        source: 'kqm',
        reason: 'the guide gives no substat priority',
      },
    ]);
  });

  it('names a build the way the window shows it', () => {
    expect(buildLabel('Kirara', build({ name: 'General' }))).toBe('Support');
    expect(buildLabel('Kirara', build({ name: 'Kirara' }))).toBe('Support');
    expect(
      buildLabel(
        'Yumemizuki Mizuki',
        build({ name: 'Mizuki (Stellar Swirl)' }),
      ),
    ).toBe('Stellar Swirl');
    expect(buildLabel('X', build({ name: 'OFF-FIELD DPS' }))).toBe(
      'Off-Field DPS',
    );
    expect(buildLabel('X', build({ name: 'outside Stellar Swirl' }))).toBe(
      'Outside Stellar Swirl',
    );
    expect(
      whyUnscored(build({ mains: { sands: [], goblet: [], circlet: ['em'] } })),
    ).toBe('the guide gives no sands or goblet main stat');
  });
});

// The committed sources and the app's data must agree: edit data/sources/
// and run `npm run data:guides`, never the generated files.
describe('data/sources against the app’s data', () => {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../data/sources', name),
        'utf8',
      ),
    ) as SourceFile;

  it('merges into exactly the guide builds the app has', () => {
    const merged = mergeGuideBuilds(
      read('kqm.json'),
      read('genshin-builds.json'),
      (k) => genshinAdapter.character(k)?.name ?? k,
    );
    expect(merged).toEqual(GUIDE_BUILDS);
  });

  it('gives exactly the genshin.gg cross-check the app has', () => {
    const gg = genshinGgData(read('genshin-gg.json'));
    expect(gg.builds).toEqual(GENSHIN_GG_BUILDS);
    expect({ source: gg.source, fetched: gg.fetched }).toEqual(GENSHIN_GG);
  });
});
