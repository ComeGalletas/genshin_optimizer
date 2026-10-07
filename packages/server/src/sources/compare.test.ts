import { describe, expect, it } from 'vitest';
import type {
  SourceBuild,
  SourceCharacter,
} from '@genshin-build-lab/engine/sources/types';
import { diffBuilds, keepFromPrevious } from './compare';

const build = (over: Partial<SourceBuild>): SourceBuild => ({
  name: 'Build',
  role: 'support',
  roleFrom: 'name',
  mains: { sands: ['er_pct'], goblet: ['hp_pct'], circlet: ['healing'] },
  substats: ['er_pct'],
  sets: [['OceanHuedClam']],
  ...over,
});
const character = (builds: SourceBuild[]): SourceCharacter => ({
  url: 'https://example.test/x',
  fetched: '2026-10-07',
  builds,
});

describe('diffBuilds', () => {
  it('says which builds came, went or changed, and how', () => {
    const before = character([build({ name: 'A' }), build({ name: 'B' })]);
    const after = character([
      build({ name: 'A', erMin: 160, sets: [['TenacityOfTheMillelith']] }),
      build({ name: 'C' }),
    ]);
    expect(diffBuilds(before, after)).toEqual([
      '~ A: sets, erMin',
      '+ C',
      '- B',
    ]);
    expect(diffBuilds(undefined, after)).toEqual(['+ A', '+ C']);
  });
});

describe('keepFromPrevious', () => {
  it('keeps a role, main stat or substats a fresh read missed, flagged', () => {
    const prev = character([
      build({ name: 'Kirara', role: 'shield', substats: ['hp_pct', 'er_pct'] }),
    ]);
    const next = character([
      build({
        name: 'General',
        role: 'on_field_dps',
        roleFrom: 'review',
        mains: { sands: ['hp_pct'], goblet: [], circlet: ['hp_pct'] },
        substats: [],
        flags: [
          'role not clear from "General"',
          'no goblet main stat read from ""',
          'no stat priority line',
        ],
      }),
    ]);
    keepFromPrevious(prev, next);
    const [b] = next.builds;
    expect(b.role).toBe('shield');
    expect(b.mains.goblet).toEqual(['hp_pct']);
    expect(b.substats).toEqual(['hp_pct', 'er_pct']);
    expect(b.flags).toEqual([
      'role, goblet main stat, substats kept from the previous read ("Kirara")',
    ]);
  });

  it('matches a build by name, or by role, and leaves a full read alone', () => {
    const prev = character([
      build({ name: 'Healer', role: 'healer', substats: ['hp_pct'] }),
      build({ name: 'Bloom', role: 'reaction_dps', substats: ['em'] }),
    ]);
    const next = character([
      build({ name: 'Heal Support', role: 'healer', substats: [] }),
      build({
        name: 'Bloom',
        role: 'reaction_dps',
        substats: ['em', 'er_pct'],
      }),
    ]);
    keepFromPrevious(prev, next);
    expect(next.builds[0].substats).toEqual(['hp_pct']);
    expect(next.builds[1].substats).toEqual(['em', 'er_pct']);
    expect(next.builds[1].flags).toBeUndefined();
    keepFromPrevious(undefined, next);
  });
});
