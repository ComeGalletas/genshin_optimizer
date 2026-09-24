import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import { isPersistedArtifact } from '@genshin-build-lab/engine/game/artifactValidation';
import type { Artifact } from '@genshin-build-lab/engine/game/types';

interface InventoryState {
  artifacts: Artifact[];
  add: (a: Artifact) => void;
  addMany: (a: Artifact[]) => void;
  /** Replace the whole bag. The importer needs this: it drops the demo
   *  artifacts and appends the real ones in one commit, which `addMany` (an
   *  append) and `clear` (which would blank the panel mid-import) can't
   *  express between them. */
  replaceAll: (a: Artifact[]) => void;
  clear: () => void;
}

export const useInventory = create<InventoryState>()(
  persist(
    (set) => ({
      artifacts: [],
      add: (a) => set((s) => ({ artifacts: [...s.artifacts, a] })),
      addMany: (items) =>
        set((s) => ({ artifacts: [...s.artifacts, ...items] })),
      replaceAll: (artifacts) => set({ artifacts }),
      clear: () => set({ artifacts: [] }),
    }),
    {
      name: 'rpg-build-optimizer/inventory',
      storage: createJSONStorage(() => safeStorage),
      // localStorage is a trust boundary: the blob may have been written by an
      // older build (before element tracking, before the roll invariants) or
      // hand-edited in devtools, and every reader downstream — the optimiser,
      // BuildCard's render — assumes a well-formed Artifact.
      version: 1,
      // `merge`, not `migrate`: migrate only runs when the stored version
      // differs, so a blob already stamped v1 would skip the filter forever.
      // Corrupt rows are dropped individually — a single bad piece must never
      // cost the player the rest of their inventory.
      // Identity `migrate`: the per-row filtering lives in `merge` (above),
      // but zustand logs an error on every load of a pre-v1 blob when no
      // migrate function exists at all. Legacy blobs pass through unchanged
      // and are then filtered by `merge` like everything else.
      migrate: (persisted) => persisted,
      merge: (persisted, current) => {
        const rows = (persisted as { artifacts?: unknown })?.artifacts;
        return {
          ...current,
          artifacts: Array.isArray(rows)
            ? rows.filter(isPersistedArtifact)
            : [],
        };
      },
    },
  ),
);
