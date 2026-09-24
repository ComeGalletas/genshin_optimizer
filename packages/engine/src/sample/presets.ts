import type { Objective, OptimizeConstraints } from '../game/types';

export interface SamplePreset {
  label: string;
  characterKey: string;
  weaponKey: string;
  objective: Objective;
  constraints: OptimizeConstraints;
}

/** Each preset demonstrates a different constraint mechanism over the shared sample bag. */
export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    label: 'Furina',
    characterKey: 'furina',
    weaponKey: 'aquila_favonia',
    objective: 'crit_value',
    constraints: { minStats: { er_pct: 200 } },
  },
  {
    label: 'Nahida',
    characterKey: 'nahida',
    weaponKey: 'a_thousand_floating_dreams',
    objective: 'crit_value',
    constraints: { minStats: { em: 550 } },
  },
  {
    label: 'Navia',
    characterKey: 'navia',
    weaponKey: 'beacon_of_the_reed_sea',
    objective: 'crit_value',
    constraints: {
      setRequirement: { kind: '4pc', setKey: 'GladiatorsFinale' },
    },
  },
  {
    label: 'Neuvillette',
    characterKey: 'neuvillette',
    weaponKey: 'cashflow_supervision',
    objective: 'crit_value',
    constraints: { mainStatLocks: { goblet: 'elemental_dmg' } },
  },
];
