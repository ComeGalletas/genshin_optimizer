/**
 * Which help panels are open (TODO 9.6): a "?" and its panel can sit apart
 * (the button by a title, the panel under the description), so they share
 * this rather than one component's state. Not kept across reloads.
 * @packageDocumentation
 */
import { create } from 'zustand';
import type { HelpId } from './topics';

export const useHelpOpen = create<{
  open: ReadonlySet<HelpId>;
  toggle: (id: HelpId) => void;
  close: (id: HelpId) => void;
}>((set) => ({
  open: new Set(),
  toggle: (id) =>
    set((s) => {
      const open = new Set(s.open);
      if (open.has(id)) open.delete(id);
      else open.add(id);
      return { open };
    }),
  close: (id) =>
    set((s) => {
      const open = new Set(s.open);
      open.delete(id);
      return { open };
    }),
}));
