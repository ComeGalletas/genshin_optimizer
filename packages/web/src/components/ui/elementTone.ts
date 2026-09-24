/**
 * Element key → its hue class. The tokens themselves live in
 * `tailwind.config.js` (`element.*`) and are documented in
 * `docs/design-system.md`; every one clears 4.5:1 as text on surface-900.
 *
 * Hue is never the only channel — `ElementName` writes the element out next to
 * the dot, so a colour-blind read loses nothing.
 */

/** Keys are the dataset's lowercase element names; anything unknown falls back
 *  to the muted body colour. */
export const ELEMENT_TONE: Record<string, string> = {
  pyro: 'text-element-pyro',
  hydro: 'text-element-hydro',
  electro: 'text-element-electro',
  cryo: 'text-element-cryo',
  anemo: 'text-element-anemo',
  geo: 'text-element-geo',
  dendro: 'text-element-dendro',
};

export function elementTone(element: string): string {
  return ELEMENT_TONE[element] ?? 'text-muted';
}
