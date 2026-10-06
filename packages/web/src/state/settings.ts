/**
 * Display settings the reader chooses, kept in this browser.
 *
 * `showArt` (TODO 9.1, ADR-0052): whether the app shows the game's images
 * of characters, weapons and artifacts. On by default; each image is
 * loaded from Enka or HoYoverse, which see the reader's address, so it can
 * be turned off and the app's own glyphs shown instead.
 * @packageDocumentation
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';

interface SettingsState {
  showArt: boolean;
  setShowArt: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      showArt: true,
      setShowArt: (showArt) => set({ showArt }),
    }),
    {
      name: 'rpg-build-optimizer/settings',
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      partialize: (s) => ({ showArt: s.showArt }),
    },
  ),
);
