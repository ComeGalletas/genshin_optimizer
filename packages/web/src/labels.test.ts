import { describe, it, expect } from 'vitest';
import {
  statLabel,
  objectiveLabel,
  objectiveHint,
  formatSetName,
  formatScore,
  SLOT_LABELS,
} from './labels';

describe('labels', () => {
  it('labels a known stat and falls back to the raw key', () => {
    expect(statLabel('crit_rate')).toBe('CRIT Rate');
    expect(statLabel('nonsense' as never)).toBe('nonsense');
  });

  it('labels the crit_value objective and plain stat objectives', () => {
    expect(objectiveLabel('crit_value')).toBe('Crit Value');
    expect(objectiveLabel('em')).toBe('Elemental Mastery');
  });

  it('prefers the dataset name for a known set key', () => {
    expect(formatSetName('EmblemOfSeveredFate')).toBe('Emblem of Severed Fate');
    expect(formatSetName('GladiatorsFinale')).toBe("Gladiator's Finale");
  });

  it('spaces a PascalCase key the snapshot does not know', () => {
    expect(formatSetName('SomeFutureSetKey')).toBe('Some Future Set Key');
  });

  it('formats finite scores and renders a dash for non-finite ones', () => {
    expect(formatScore(12.34)).toBe('12.3');
    expect(formatScore(70, 0)).toBe('70');
    expect(formatScore(NaN)).toBe('—');
    expect(formatScore(Infinity)).toBe('—');
    expect(formatScore(-Infinity)).toBe('—');
  });

  it('has a label for every slot', () => {
    expect(SLOT_LABELS.flower).toBe('Flower');
    expect(Object.keys(SLOT_LABELS)).toHaveLength(5);
  });
});

describe('objectiveHint', () => {
  it('explains every objective in one sentence', () => {
    expect(objectiveHint('avg_damage')).toMatch(/estimated damage/i);
    expect(objectiveHint('crit_value')).toMatch(/crit value/i);
    expect(objectiveHint('hp_pct')).toMatch(/HP/);
    expect(objectiveHint('em')).toMatch(/Elemental Mastery/i);
    expect(objectiveHint('def_pct')).toMatch(/DEF%/);
  });
});
