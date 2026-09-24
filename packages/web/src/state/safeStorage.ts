import type { StateStorage } from 'zustand/middleware';

const memory = new Map<string, string>();

/** Latched on the first localStorage failure. Without it, a browser that
 *  reads fine but refuses to write (quota exceeded) would take writes into
 *  `memory` and then keep serving the stale value from localStorage on read,
 *  silently discarding what the user just imported. A storage that throws
 *  once keeps throwing, so the latch never needs to unset. */
let degraded = false;

/**
 * The `storage` every persisted store uses. `localStorage` throws in Safari
 * private mode and when the quota is exceeded, and zustand only guards the
 * *access* of the storage object, not the get/set calls — a throw during store
 * creation happens at import time, before any error boundary exists to catch
 * it. Falling back to an in-memory map keeps the session working; it just
 * doesn't survive a reload.
 */
export const safeStorage: StateStorage = {
  getItem: (name) => {
    if (!degraded) {
      try {
        return localStorage.getItem(name);
      } catch {
        degraded = true;
      }
    }
    return memory.get(name) ?? null;
  },
  setItem: (name, value) => {
    if (!degraded) {
      try {
        localStorage.setItem(name, value);
        return;
      } catch {
        degraded = true;
      }
    }
    memory.set(name, value);
  },
  removeItem: (name) => {
    if (!degraded) {
      try {
        localStorage.removeItem(name);
        return;
      } catch {
        degraded = true;
      }
    }
    memory.delete(name);
  },
};
