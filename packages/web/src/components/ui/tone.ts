/**
 * The one border/background/text triplet per semantic colour, shared by every
 * tinted surface in the app: Badge, Marker and Callout.
 *
 * Opacities are uniform on purpose — /40 border, /10 fill — so a band chip, a
 * grade marker and an error callout read as the same system rather than three
 * hand-tuned near-misses.
 */
export type Tone = 'accent' | 'jade' | 'flux' | 'muted' | 'rose' | 'warning';

export const TONE: Record<Tone, string> = {
  accent: 'border-accent-bright/40 bg-accent-bright/10 text-accent-bright',
  jade: 'border-jade/40 bg-jade/10 text-jade',
  flux: 'border-flux/40 bg-flux/10 text-flux-bright',
  muted: 'border-muted/40 bg-muted/10 text-muted',
  rose: 'border-rose/40 bg-rose/10 text-rose',
  // Caution, non-interactive: "this thing is incomplete", not "click me".
  // `amber` (tailwind.config.js) is measured at 10.15:1 on surface-900 and
  // 8.94:1 on surface-700 as text — both clear WCAG AA's 4.5:1 floor.
  warning: 'border-amber/40 bg-amber/10 text-amber',
};
