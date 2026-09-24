import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeStorage } from './safeStorage';
import { useInventory } from './inventory';

function breakLocalStorage(
  ...methods: ('getItem' | 'setItem' | 'removeItem')[]
) {
  const boom = () => {
    throw new DOMException('QuotaExceededError');
  };
  for (const m of methods)
    vi.spyOn(Storage.prototype, m).mockImplementation(boom);
}

// safeStorage latches to memory on the first failure and never unlatches, so
// the write-through case has to be asserted before anything breaks storage.
describe('safeStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads and writes through to localStorage when it works', () => {
    safeStorage.setItem('k', 'v');
    expect(safeStorage.getItem('k')).toBe('v');
    safeStorage.removeItem('k');
    expect(safeStorage.getItem('k')).toBeNull();
  });

  it('serves its own writes after a quota-exceeded setItem, not the stale value', () => {
    localStorage.setItem('q', 'OLD');
    breakLocalStorage('setItem'); // reads still work — the real quota case
    safeStorage.setItem('q', 'NEW');
    expect(safeStorage.getItem('q')).toBe('NEW');
  });

  it('falls back to memory when localStorage throws', () => {
    breakLocalStorage('getItem', 'setItem', 'removeItem');
    expect(() => safeStorage.setItem('boom', 'v')).not.toThrow();
    expect(safeStorage.getItem('boom')).toBe('v');
    expect(() => safeStorage.removeItem('boom')).not.toThrow();
    expect(safeStorage.getItem('boom')).toBeNull();
  });

  it('keeps the persisted stores usable when localStorage throws', () => {
    breakLocalStorage('getItem', 'setItem', 'removeItem');
    expect(() => useInventory.getState().clear()).not.toThrow();
    expect(useInventory.getState().artifacts).toEqual([]);
  });
});
