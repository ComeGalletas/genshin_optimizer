import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { BUILD_LEVELS } from '@genshin-build-lab/engine/game/types';
import type { BuildLevel } from '@genshin-build-lab/engine/game/types';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';

interface RosterState {
  /** characterKey -> roster entry; key presence = the player owns them. */
  entries: Record<string, RosterEntry>;
  /** Replace wholesale: a GOOD export is a full account snapshot, so the
   *  latest import wins (no merge). */
  setRoster: (entries: Record<string, RosterEntry>) => void;
  clear: () => void;
}

function isOptionalInt(v: unknown): boolean {
  return v === undefined || (typeof v === 'number' && Number.isInteger(v));
}

/** A rehydrated roster row the app can actually use: a key the frozen snapshot
 *  resolves (the pickers, `baseStats` and the roster views all index by it) and
 *  a shape whose optional fields are the types their readers expect. */
function isRosterEntry(key: string, v: unknown): v is RosterEntry {
  if (!genshinAdapter.character(key)) return false;
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    (e.buildLevel === undefined ||
      (BUILD_LEVELS as number[]).includes(e.buildLevel as BuildLevel)) &&
    isOptionalInt(e.level) &&
    isOptionalInt(e.constellation) &&
    isOptionalInt(e.weaponLevel) &&
    (e.weaponKey === undefined || typeof e.weaponKey === 'string')
  );
}

export const useRoster = create<RosterState>()(
  persist(
    (set) => ({
      entries: {},
      setRoster: (entries) => set({ entries }),
      clear: () => set({ entries: {} }),
    }),
    {
      name: 'rpg-build-optimizer/roster',
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      // Same trust-boundary reasoning as the inventory store, and the same
      // per-row (not whole-blob) drop: one unresolvable character must not
      // erase the rest of the account snapshot.
      // Identity `migrate`: the per-row filtering lives in `merge` (above),
      // but zustand logs an error on every load of a pre-v1 blob when no
      // migrate function exists at all. Legacy blobs pass through unchanged
      // and are then filtered by `merge` like everything else.
      migrate: (persisted) => persisted,
      merge: (persisted, current) => {
        const rows = (persisted as { entries?: unknown })?.entries;
        if (typeof rows !== 'object' || rows === null) return { ...current };
        return {
          ...current,
          entries: Object.fromEntries(
            Object.entries(rows as Record<string, unknown>).filter(([k, v]) =>
              isRosterEntry(k, v),
            ),
          ) as Record<string, RosterEntry>,
        };
      },
    },
  ),
);
