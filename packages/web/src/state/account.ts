/**
 * Where the loaded inventory came from (TODO 9.4), for the account bar:
 * the demo data, the local server's account, a GOOD file, a UID, or pieces
 * added by hand. Kept with the inventory, in this browser.
 * @packageDocumentation
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';

export type AccountSource =
  | { kind: 'demo' }
  | { kind: 'server' }
  | { kind: 'file'; name: string }
  | { kind: 'uid'; uid: string }
  | { kind: 'manual' };

interface AccountState {
  source: AccountSource | null;
  /** When it was loaded (ISO). */
  at: string | null;
  setSource: (s: AccountSource) => void;
  /** The last load's confirmation ("Imported 20 artifacts."), shown under
   *  the account bar once the Start view has given way to another. Not
   *  kept across reloads. */
  loaded: string | null;
  setLoaded: (text: string | null) => void;
  clear: () => void;
}

export const useAccount = create<AccountState>()(
  persist(
    (set) => ({
      source: null,
      at: null,
      setSource: (source) => set({ source, at: new Date().toISOString() }),
      loaded: null,
      setLoaded: (loaded) => set({ loaded }),
      clear: () => set({ source: null, at: null, loaded: null }),
    }),
    {
      name: 'rpg-build-optimizer/account',
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      partialize: (s) => ({ source: s.source, at: s.at }),
    },
  ),
);

/** "the demo data", "the local server", "genshin_export.json", "UID 7…". */
export function sourceLabel(s: AccountSource): string {
  switch (s.kind) {
    case 'demo':
      return 'the demo data';
    case 'server':
      return 'the local server';
    case 'file':
      return s.name;
    case 'uid':
      return `UID ${s.uid}`;
    case 'manual':
      return 'added by hand';
  }
}
