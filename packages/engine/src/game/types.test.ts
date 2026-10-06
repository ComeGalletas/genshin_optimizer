import { describe, it, expect } from 'vitest';
import { ASCENSION_CAPS, SLOTS, ascensionOf, isStatKey } from './types';

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

describe('ascensionOf', () => {
  it('reads the ascension from the build level the import set', () => {
    expect(ascensionOf(20)).toBe(0);
    expect(ascensionOf(80)).toBe(5);
    expect(ascensionOf(90)).toBe(6);
    expect(ascensionOf(undefined)).toBeUndefined();
    expect(ascensionOf(1)).toBeUndefined();
  });

  it('is the inverse of ASCENSION_CAPS', () => {
    ASCENSION_CAPS.forEach((cap, asc) => expect(ascensionOf(cap)).toBe(asc));
  });
});
