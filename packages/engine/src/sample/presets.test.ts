import { describe, it, expect } from 'vitest';
import { SAMPLE_PRESETS } from './presets';
import { genshinAdapter } from '../game/genshin/adapter';

// The presets are the app's shop window: a reader's first click runs one of
// them. They are hand-written keys against a frozen dataset snapshot, so a
// patch refresh that renames or drops an entry breaks them silently — the
// picker would show a blank weapon and the run would fail on `baseStats`.
describe('SAMPLE_PRESETS', () => {
  it.each(SAMPLE_PRESETS.map((p) => [p.label, p] as const))(
    '%s names a character and weapon the dataset carries, legally paired',
    (_label, preset) => {
      expect(
        genshinAdapter.character(preset.characterKey),
        `unknown character ${preset.characterKey}`,
      ).toBeTruthy();
      expect(
        genshinAdapter.weapon(preset.weaponKey),
        `unknown weapon ${preset.weaponKey}`,
      ).toBeTruthy();
      expect(
        genshinAdapter.canEquip(preset.characterKey, preset.weaponKey),
        `${preset.characterKey} cannot equip ${preset.weaponKey}`,
      ).toBe(true);
    },
  );
});
