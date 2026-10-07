/**
 * Display copy for the web app: everything in the engine's shared labels, plus
 * the UI-only mappings onto the design system's tones. Components import
 * `../labels` and never need to know which half a label lives in.
 * @packageDocumentation
 */

import type { Tone } from './components/ui/tone';
import type { Grade } from '@genshin-build-lab/engine/meta/grade';
import type { Band } from '@genshin-build-lab/engine/roster/buildScore';

export * from '@genshin-build-lab/engine/labels';
// `countOf` and `pluralWord`, the one plural helper, come from the engine
// with the rest of its labels (re-exported above).

/** Band → the shared UI tone — one definition, used by every view that shows
 *  a band. The classes themselves live in `components/ui/tone.ts`. */
export const BAND_TONE: Record<Band, Tone> = {
  built: 'jade',
  partial: 'flux',
  unbuilt: 'muted',
  no_recipe: 'muted',
};

/** Grade letter → the shared UI tone — one definition, so the same letter
 *  reads as the same colour whether it is on a card or on a summary row. */
export const GRADE_TONE: Record<Grade, Tone> = {
  S: 'accent',
  A: 'jade',
  B: 'flux',
  C: 'muted',
  D: 'rose',
};
