/**
 * A shared team comparison (TODO 8.3, ADR-0051): the `#c=` link's
 * comparison, as the sharer's server simulated it, shown with the same view
 * as Compare Teams. Nothing re-runs, so it opens without a server.
 */
import { useEffect, useState } from 'react';
import {
  decodeComparison,
  type SharedComparison as Shared,
} from '@genshin-build-lab/engine/share/comparison';
import { ComparisonResult } from './TeamComparison';
import { Callout } from '../components/ui/Callout';

export function SharedComparison({
  param,
  onClose,
}: {
  param: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ok'; c: Shared } | { status: 'error' }
  >({ status: 'loading' });
  useEffect(() => {
    let live = true;
    // decodeComparison never rejects: a bad link resolves to an error.
    void decodeComparison(param).then(
      (out) =>
        live &&
        setState(
          'error' in out ? { status: 'error' } : { status: 'ok', c: out },
        ),
    );
    return () => {
      live = false;
    };
  }, [param]);

  if (state.status === 'loading')
    return <p className="text-sm text-muted">Opening the comparison…</p>;
  if (state.status === 'error')
    return (
      <Callout tone="error" role="alert">
        This comparison link can’t be read: it may be cut short or from another
        version of the app.{' '}
        <button type="button" className="underline" onClick={onClose}>
          Close it
        </button>
        .
      </Callout>
    );
  const base = state.c.runs[0];
  return (
    <div className="space-y-4">
      <Callout
        tone="info"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <span>
          Shared comparison
          {base?.rotation ? ` · ${base.rotation.name}` : ''}. Simulated by the
          sharer’s local server with their characters and gear; nothing ran
          here.
        </span>
        <button type="button" className="btn-ghost flex-none" onClick={onClose}>
          Close
        </button>
      </Callout>
      <ComparisonResult result={state.c} />
    </div>
  );
}
