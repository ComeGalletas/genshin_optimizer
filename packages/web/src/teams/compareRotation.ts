/**
 * The rotation Compare Teams starts from, shared so the rotation library
 * (TODO 8.2) can open a team in it. In memory only.
 * @packageDocumentation
 */
import { create } from 'zustand';

export const useCompareRotation = create<{
  id: string;
  set: (id: string) => void;
}>((set) => ({ id: '', set: (id) => set({ id }) }));
