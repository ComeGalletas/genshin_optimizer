/**
 * App-wide detail drawer: slides from the left on desktop, from the bottom on
 * mobile. vaul supplies the focus trap, scroll lock and esc-close. It does
 * *not* set `aria-modal` (measured: null on Vaul.Content), so this sets it.
 * @packageDocumentation
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Drawer as Vaul } from 'vaul';

const DESKTOP = '(min-width: 768px)';

function useIsDesktop() {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia(DESKTOP).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const on = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}

export function AppDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  // Vaul/Radix only restore focus to the triggering element on the escape
  // key or an outside pointerdown — a close driven by our own onClose
  // handler (the ✕ button) changes `open` via a plain prop update, which
  // skips Radix's onCloseAutoFocus path and drops focus to <body>. Track
  // the pre-open activeElement ourselves and restore it explicitly.
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);
  return (
    <Vaul.Root
      open={open}
      onOpenChange={(o) => !o && onClose()}
      direction={desktop ? 'left' : 'bottom'}
    >
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-40 bg-surface-900/60 backdrop-blur-sm" />
        <Vaul.Content
          aria-modal="true"
          className={
            desktop
              ? // The accent edge goes on the drawer's *inner* (right) border:
                // on the left it sat flush against the viewport and was never
                // visible. overscroll-contain keeps the wheel out of the page
                // behind the overlay.
                'fixed inset-y-0 left-0 z-50 w-full max-w-md overflow-y-auto overscroll-contain border-l border-r-2 border-l-white/10 border-r-accent/50 bg-surface-700/60 p-6 backdrop-blur-md'
              : // pb has to *include* p-5's 1.25rem: a bare safe-area-inset padding overrode
                // it outright, so on a phone without a safe-area inset the
                // bottom padding collapsed to 0.
                'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t-2 border-t-accent/50 bg-surface-700/60 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur-md'
          }
        >
          {!desktop && (
            <div
              aria-hidden="true"
              className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15"
            />
          )}
          <div className="mb-4 flex items-center justify-between gap-3">
            <Vaul.Title className="font-display text-lg font-bold text-paper">
              {title}
            </Vaul.Title>
            {/* A borderless icon button: .btn-ghost's chrome around a single
                ✕ read as a second primary action. Keeps the focus ring and
                the 44px target. */}
            <button
              type="button"
              className="focus-ring touch-target -mr-1 grid w-11 flex-none place-items-center rounded-lg text-muted transition-colors hover:text-paper"
              onClick={onClose}
              aria-label="Close"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {children}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
