/**
 * `useScrollSpy` — split out of `landing.tsx` (which otherwise mixes a hook
 * with plain components, tripping the react-refresh/only-export-components
 * ESLint rule) — no behaviour change.
 * @packageDocumentation
 */

import { useEffect, useState } from 'react';

/**
 * Which nav chip the reader is looking at. `aria-current` needs a single
 * answer, so the topmost intersecting section wins. Guarded rather than
 * polyfilled: the highlight is an enhancement, and jsdom has no
 * IntersectionObserver.
 */
export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  // The id set changed, so the previous answer describes a nav that no longer
  // exists: clear it and let the observer's first callback decide. Done in the
  // render pass, not an effect — React re-runs this pass before painting, so
  // `aria-current` never lands on a chip that is gone.
  const [spiedIds, setSpiedIds] = useState(ids);
  if (spiedIds !== ids) {
    setSpiedIds(ids);
    setActive(null);
  }
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const order = ids;
    const els = order
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
    if (els.length === 0) return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id);
          else seen.delete(e.target.id);
        }
        const first = order.find((id) => seen.has(id));
        // Deliberately keep the last answer when nothing is intersecting:
        // between two sections (or scrolled past the last one) `first` is
        // undefined, and blanking `aria-current` there makes the highlight
        // flicker off mid-scroll. The reader is still "at" the section they
        // last passed, so it stays lit until another one wins.
        if (first) setActive(first);
      },
      // Top band only: a section counts as "current" once its heading has
      // cleared the sticky nav and before it has left the upper third.
      { rootMargin: '-72px 0px -60% 0px' },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
    // `ids` is a memoised array from the caller: a fresh array every render
    // would tear down and rebuild the observer on every render.
  }, [ids]);
  return active;
}
