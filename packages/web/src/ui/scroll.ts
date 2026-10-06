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

/** How often, and for how long, `scrollToIdWhenShown` looks for its target. */
const LOOK_EVERY_MS = 50;
const LOOK_FOR_MS = 3_000;

/**
 * Scroll to a section that may not be on the page yet: a view just opened
 * mounts lazily, so its sections appear a little later, the first time
 * after its chunk loads. Scrolls as soon as the section exists; gives up
 * quietly after a few seconds (the view then opens where it opens). The one
 * way to land on a section in another view.
 */
export function scrollToIdWhenShown(id: string, waited = 0): void {
  if (document.getElementById(id)) {
    scrollToId(id);
    return;
  }
  if (waited >= LOOK_FOR_MS) return;
  setTimeout(
    () => scrollToIdWhenShown(id, waited + LOOK_EVERY_MS),
    LOOK_EVERY_MS,
  );
}
