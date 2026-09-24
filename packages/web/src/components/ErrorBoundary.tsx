import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Callout } from './ui/Callout';

/**
 * The one boundary in the app, wrapping <App/> in main.tsx. Any render-time
 * throw would otherwise leave a white screen with nothing in the DOM.
 *
 * ponytail: a single top-level boundary, no library, no per-section recovery —
 * split it per section only if one panel throwing should leave the rest usable.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-8">
        <Callout tone="error" role="alert" className="space-y-3 p-6">
          <p className="font-semibold">Something went wrong.</p>
          <p className="text-rose/80">
            The page hit an unexpected error. Reloading usually fixes it — your
            imported inventory is saved.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </Callout>
      </div>
    );
  }
}
