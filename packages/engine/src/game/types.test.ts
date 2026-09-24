import { describe, it, expect } from 'vitest';
import { SLOTS, isStatKey } from './types';

describe('domain types', () => {
  it('defines the five slots in fixed order', () => {
    expect(SLOTS).toEqual(['flower', 'plume', 'sands', 'goblet', 'circlet']);
  });

  it('recognises valid stat keys', () => {
    expect(isStatKey('crit_dmg')).toBe(true);
    expect(isStatKey('nonsense')).toBe(false);
  });

  it('rejects non-string inputs at the runtime boundary', () => {
    expect(isStatKey(null)).toBe(false);
    expect(isStatKey(undefined)).toBe(false);
    expect(isStatKey(42)).toBe(false);
    expect(isStatKey({})).toBe(false);
  });
});
