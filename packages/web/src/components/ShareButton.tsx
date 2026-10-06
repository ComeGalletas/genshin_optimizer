/**
 * A button that makes a share link and copies it (TODO 8.3): "Link copied",
 * or the link in a field to copy by hand when the clipboard refuses, or why
 * there is no link.
 */
import { useState } from 'react';
import { cn } from './ui/cn';

type State =
  | { status: 'idle' }
  | { status: 'copied' }
  | { status: 'manual'; url: string }
  | { status: 'failed'; why: string };

export function ShareButton({
  label,
  makeUrl,
  className,
}: {
  label: string;
  /** The link, or a reason there is none. */
  makeUrl: () => Promise<string | { why: string }>;
  className?: string;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });
  async function share() {
    let made: string | { why: string };
    try {
      made = await makeUrl();
    } catch {
      made = { why: 'this browser couldn’t make the link' };
    }
    if (typeof made !== 'string') {
      setState({ status: 'failed', why: made.why });
      return;
    }
    try {
      await navigator.clipboard.writeText(made);
      setState({ status: 'copied' });
    } catch {
      setState({ status: 'manual', url: made });
    }
  }
  return (
    <div className={cn('space-y-1', className)}>
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => void share()}
      >
        {state.status === 'copied' ? 'Link Copied' : label}
      </button>
      <p className="sr-only" role="status">
        {state.status === 'copied' ? 'Link copied.' : ''}
      </p>
      {state.status === 'manual' && (
        <label className="block text-xs text-muted">
          Copy the link:
          <input
            readOnly
            className="field mt-1 w-full font-mono text-2xs"
            value={state.url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      {state.status === 'failed' && (
        <p className="text-xs text-rose">No link: {state.why}.</p>
      )}
    </div>
  );
}
