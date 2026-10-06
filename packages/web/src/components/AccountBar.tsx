/**
 * The account bar (TODO 9.4, ADR-0053): what is loaded and where it came
 * from, in one line, once something is loaded; "Change" opens the Start
 * view's three choices again. Before anything is loaded, one action.
 */
import { useInventory } from '../state/inventory';
import { useRoster } from '../state/roster';
import { sourceLabel, useAccount } from '../state/account';
import { hrefOf } from './views';

const count = (n: number, one: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`;

export function AccountBar({ onStart }: { onStart: boolean }) {
  const artifacts = useInventory((s) => s.artifacts.length);
  const characters = useRoster((s) => Object.keys(s.entries).length);
  const source = useAccount((s) => s.source);
  const at = useAccount((s) => s.at);
  if (artifacts === 0 && characters === 0)
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm"
        data-testid="account-bar"
      >
        <span className="text-muted">Nothing loaded yet.</span>
        {!onStart && (
          <a className="btn-primary" href={hrefOf('start')}>
            Load Data
          </a>
        )}
      </div>
    );
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm"
      data-testid="account-bar"
    >
      <span>
        <span className="font-semibold text-paper">
          {count(artifacts, 'artifact')}
        </span>
        {characters > 0 && (
          <>
            {' · '}
            <span className="font-semibold text-paper">
              {count(characters, 'character')}
            </span>
          </>
        )}
        {source && (
          <span className="text-muted">
            {' · '}from {sourceLabel(source)}
            {at ? `, ${at.slice(0, 10)}` : ''}
          </span>
        )}
      </span>
      {!onStart && (
        <a className="btn-ghost" href={hrefOf('start')}>
          Change
        </a>
      )}
    </div>
  );
}

/** A view that needs something not loaded yet: say what, with one action. */
export function NeedsData({
  view,
  needs,
}: {
  view: string;
  needs: 'a roster' | 'artifacts' | 'the local server';
}) {
  return (
    <div className="panel panel-md space-y-3" data-testid="needs-data">
      <p className="text-sm text-paper">
        {view} needs {needs}.
      </p>
      {needs === 'the local server' ? (
        <p className="text-xs text-muted">
          Start it with <code>npm run server</code>; this view appears in the
          menu while it runs.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Load your account from the local server, the demo data, or a GOOD
            file{needs === 'artifacts' ? ', a UID or pieces by hand' : ''}.
          </p>
          <a className="btn-primary inline-flex" href={hrefOf('start')}>
            Load Data
          </a>
        </>
      )}
    </div>
  );
}
