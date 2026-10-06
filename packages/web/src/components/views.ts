/**
 * The app's views (TODO 9.3, ADR-0053), one at a time, each at its own
 * address (`#/plan`). Start is where loading happens; it opens by itself
 * while nothing is loaded. Simulate and Imports need the local server; a
 * shared comparison link (`#c=…`) opens Simulate without one.
 * @packageDocumentation
 */
import { useSyncExternalStore } from 'react';

export type ViewId =
  'start' | 'roster' | 'teams' | 'plan' | 'optimise' | 'simulate' | 'imports';

export interface ViewDef {
  id: ViewId;
  label: string;
  /** Shown in the nav only while the local server runs. */
  server?: true;
}

/** The nav, in order. Start isn't in it: the account bar opens it. */
export const NAV: readonly ViewDef[] = [
  { id: 'roster', label: 'Roster' },
  { id: 'teams', label: 'Teams' },
  { id: 'plan', label: 'Plan' },
  { id: 'optimise', label: 'Optimise' },
  { id: 'simulate', label: 'Simulate', server: true },
  { id: 'imports', label: 'Imports', server: true },
];

const IDS: readonly ViewId[] = ['start', ...NAV.map((v) => v.id)];

/** The view an address names: `#/plan`; `#c=…` (a shared comparison) is
 *  Simulate; anything else, none. */
export function viewOf(hash: string): ViewId | null {
  if (hash.startsWith('#c=')) return 'simulate';
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (IDS as readonly string[]).includes(id) ? (id as ViewId) : null;
}

export const hrefOf = (id: ViewId) => `#/${id}`;

/** Open a view (a new history entry, so Back returns). */
export function goTo(id: ViewId) {
  if (
    viewOf(window.location.hash) !== id ||
    window.location.hash.startsWith('#c=')
  )
    window.location.hash = `/${id}`;
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}
const current = () => window.location.hash;

/** The view the address names, or null for none (the app then picks). */
export function useAddressedView(): ViewId | null {
  return viewOf(useSyncExternalStore(subscribe, current, current));
}
