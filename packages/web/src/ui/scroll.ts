/**
 * Scrolling cues between page sections.
 * @packageDocumentation
 */

/** Scroll a section into view, honouring the OS reduced-motion setting —
 *  an explicit `behavior` beats the CSS `prefers-reduced-motion` override,
 *  so the check has to happen here rather than in the stylesheet. */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  });
}
