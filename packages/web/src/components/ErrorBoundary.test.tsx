import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary, ViewErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders an alert fallback with a reload button when a child throws', () => {
    // React logs the caught error; silence it so the suite output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /something went wrong/i,
    );
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('keeps a view’s throw inside the view, and tries it again on request (QA M1)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    function Flaky() {
      if (fail) throw new Error('bad reply');
      return <p>view content</p>;
    }
    render(
      <ErrorBoundary>
        <nav>menu</nav>
        <ViewErrorBoundary>
          <Flaky />
        </ViewErrorBoundary>
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This view hit an unexpected error.',
    );
    // The rest of the app stays: no app-wide fallback.
    expect(screen.getByText('menu')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('view content')).toBeInTheDocument();
  });
});
