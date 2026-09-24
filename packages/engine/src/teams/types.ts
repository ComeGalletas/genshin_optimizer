/**
 * Endgame team recommendation (ADR-0017/0018): the curated comp-archetype
 * vocabulary, the database itself, the roster-to-archetype matching that fields
 * two disjoint Spiral Abyss halves, and the view that shows them.
 * @packageDocumentation
 */
export type EndgameMode = 'abyss' | 'theater' | 'stygian';

export type Role =
  | 'on-field-dps'
  | 'off-field-dps'
  | 'buffer'
  | 'sustain'
  | 'battery'
  | 'applicator';

export interface CompSlot {
  role: Role;
  /** Ranked substitutes, best first. `weight` ∈ (0,1] and is non-increasing:
   *  1.0 ideal, 0.85 strong sub, 0.7 workable, 0.5 stopgap. */
  options: Array<{ characterKey: string; weight: number }>;
}

export interface CompArchetype {
  id: string; // 'neuvillette-hypercarry'
  name: string; // 'Neuvillette Hypercarry'
  modes: EndgameMode[];
  tier: 1 | 2 | 3;
  slots: [CompSlot, CompSlot, CompSlot, CompSlot];
  source: string;
  notes: string; // one line: why/when this comp
}
