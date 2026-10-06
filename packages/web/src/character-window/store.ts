/**
 * Which character's window is open (TODO 9.9): one window for the whole
 * app, opened from any character the app shows. Not kept across reloads.
 * @packageDocumentation
 */
import { create } from 'zustand';

export const useCharacterWindow = create<{
  key: string | null;
  open: (key: string) => void;
  close: () => void;
}>((set) => ({
  key: null,
  open: (key) => set({ key }),
  close: () => set({ key: null }),
}));

/** Open a character's window. */
export const openCharacter = (key: string) =>
  useCharacterWindow.getState().open(key);
