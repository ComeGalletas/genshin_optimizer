/**
 * Step-chip vocabulary for the sticky nav in `landing.tsx`/`App.tsx`. Split
 * out of `landing.tsx` (which otherwise mixes components with plain
 * constants, tripping the react-refresh/only-export-components ESLint rule)
 * — no behaviour change.
 * @packageDocumentation
 */

/** Step chips for the sticky nav — ids match the Section ids in App.tsx.
 *  Results carries no number: it's what the sequence produces, not a step in
 *  it. */
export const STEPS: { id: string; n?: string; label: string }[] = [
  { id: 'step-load', n: '01', label: 'Load' },
  { id: 'step-roster', n: '02', label: 'Roster' },
  { id: 'step-teams', n: '03', label: 'Teams' },
  { id: 'step-plan', n: '04', label: 'Plan' },
  { id: 'step-optimise', n: '05', label: 'Optimise' },
  { id: 'results-section', label: 'Results' },
];

export const LOCKED_HINT = 'Import a roster to unlock this step';
