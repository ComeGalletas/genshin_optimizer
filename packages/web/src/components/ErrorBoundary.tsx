import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Callout } from './ui/Callout';

/** Catches a render-time throw below it and shows `fallback` instead;
 *  `retry` renders the children again. */
class Boundary extends Component<
  {
    children: ReactNode;
    /** Logged with the error, so the console says which boundary caught it. */
    label: string;
    fallback: (retry: () => void) => ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label}:`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback(() => this.setState({ failed: false }));
  }
}

/**
 * The app's last resort, wrapping <App/> in main.tsx. Any render-time throw
 * outside a view would otherwise leave a white screen with nothing in the
 * DOM. A throw inside a view stops at `ViewErrorBoundary` instead.
 */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary
      label="Unhandled render error"
      fallback={() => (
        <div className="mx-auto max-w-md p-8">
          <Callout tone="error" role="alert" className="space-y-3 p-6">
            <p className="font-semibold">Something went wrong.</p>
            <p className="text-rose/80">
              The page hit an unexpected error. Reloading usually fixes it —
              your imported inventory is saved.
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
      )}
    >
      {children}
    </Boundary>
  );
}

/**
 * One view's boundary (App keys it by view, so another view starts clean):
 * a view that throws shows this in its place, and the header, the menu and
 * every other view keep working. Reloading would reopen the same address
 * and the same throw, so the way out is another view or a fresh try.
 */
export function ViewErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary
      label="View render error"
      fallback={(retry) => (
        <Callout tone="error" role="alert" className="space-y-3 p-6">
          <p className="font-semibold">This view hit an unexpected error.</p>
          <p className="text-rose/80">
            Your inventory is saved. Open another view from the menu, or try
            this one again.
          </p>
          <button type="button" className="btn-primary" onClick={retry}>
            Try Again
          </button>
        </Callout>
      )}
    >
      {children}
    </Boundary>
  );
}
