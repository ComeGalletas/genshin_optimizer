import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDrawer } from './Drawer';

/** Stubs `window.matchMedia` to report `matches` for every query, and
 *  captures the `change` listener the component registers so a test can
 *  fire a live viewport-size change. Restores the default (mobile) stub
 *  from `test-setup.ts` afterwards. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as typeof window.matchMedia;
  return {
    fireChange(next: boolean) {
      act(() => {
        listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
      });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

describe('AppDrawer', () => {
  it('renders children in a dialog when open and closes via the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AppDrawer open onClose={onClose} title="Ayaka">
        <p>body</p>
      </AppDrawer>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(
      <AppDrawer open={false} onClose={() => {}} title="Ayaka">
        <p>body</p>
      </AppDrawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /** Mimics RosterView: a row button opens the drawer via `onOpen`, and the
   *  drawer's `open` prop is driven by the parent's own state (as it is in
   *  the real app), not left permanently `open`. */
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Open Ayaka
        </button>
        <AppDrawer open={open} onClose={() => setOpen(false)} title="Ayaka">
          <p>body</p>
        </AppDrawer>
      </div>
    );
  }

  it('returns focus to the triggering row button after closing via the close control', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: /open ayaka/i });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('returns focus to the triggering row button after closing via Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: /open ayaka/i });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('desktop viewport', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders left-side desktop styling when matchMedia reports desktop width', () => {
      const { restore } = stubMatchMedia(true);
      render(
        <AppDrawer open onClose={() => {}} title="Ayaka">
          <p>body</p>
        </AppDrawer>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog.className).toContain('left-0');
      // The mobile-only drag handle is desktop-hidden.
      expect(dialog.querySelector('[aria-hidden="true"].h-1')).toBeNull();
      restore();
    });

    it('switches direction when the media query reports a live viewport change', () => {
      const { fireChange, restore } = stubMatchMedia(false);
      render(
        <AppDrawer open onClose={() => {}} title="Ayaka">
          <p>body</p>
        </AppDrawer>,
      );
      expect(screen.getByRole('dialog').className).toContain('bottom-0');
      fireChange(true);
      expect(screen.getByRole('dialog').className).toContain('left-0');
      restore();
    });
  });
});
