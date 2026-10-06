/**
 * App-wide detail drawer: slides from the left on desktop, from the bottom on
 * mobile. Open while mounted: callers render it to open it and unmount it to
 * close it. vaul supplies the focus trap, scroll lock and esc-close. It does
 * *not* set `aria-modal` (measured: null on Vaul.Content), so this sets it.
 * @packageDocumentation
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

/**
 * Give focus back to whatever had it when the drawer opened (the row or
 * button that opened it), once the drawer is gone. Radix restores focus only
 * to a `Dialog.Trigger`, which the app doesn't use, so without this every
 * close (✕, Escape, unmounting) dropped focus to <body>. The layout effect
 * reads the trigger before Radix's own effect moves focus into the drawer.
 */
function useRestoreFocus() {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    const trigger = document.activeElement;
    return () => {
      mounted.current = false;
      // After Radix's own close handling; skipped if the drawer is back
      // (StrictMode mounts effects twice).
      setTimeout(() => {
        if (
          !mounted.current &&
          trigger instanceof HTMLElement &&
          trigger !== document.body &&
          trigger.isConnected
        )
          trigger.focus();
      }, 0);
    };
  }, []);
}

export function AppDrawer({
  onClose,
  title,
  children,
  background,
  titleAction,
  largeTitle = false,
}: {
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Drawn behind the content, filling the drawer and not scrolling with
   *  it (the character window's art). */
  background?: ReactNode;
  /** Beside the title, at least 25px from it (the character window's
   *  Optimize). */
  titleAction?: ReactNode;
  /** A title about 5px larger (the character window's name). */
  largeTitle?: boolean;
}) {
  const desktop = useIsDesktop();
  useRestoreFocus();
  return (
    <Vaul.Root
      open
      onOpenChange={(o) => !o && onClose()}
      direction={desktop ? 'left' : 'bottom'}
      // Focus moves into the drawer (its first control), so keyboard and
      // screen-reader users land in the dialog, not behind it (vaul turns
      // this off by default).
      autoFocus
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
          {/* backdrop-blur makes the drawer the containing block of its
              fixed children, so this fills the drawer, not the page. */}
          {background && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 overflow-hidden"
            >
              {background}
            </div>
          )}
          {!desktop && (
            <div
              aria-hidden="true"
              className="relative mx-auto mb-3 h-1 w-9 rounded-full bg-white/15"
            />
          )}
          {/* Sticky: long content (a talent's description) scrolled the
              name, Optimize and ✕ away. The negative top and margins match
              the drawer's padding, so it sits flush at the top edge. */}
          <div
            className={
              desktop
                ? 'sticky -top-6 z-10 -mx-6 mb-4 flex items-center justify-between gap-3 bg-surface-700/90 px-6 py-3 backdrop-blur-md'
                : 'sticky -top-5 z-10 -mx-5 mb-4 flex items-center justify-between gap-3 bg-surface-700/90 px-5 py-3 backdrop-blur-md'
            }
          >
            <div className="flex min-w-0 items-center gap-7">
              <Vaul.Title
                className={
                  largeTitle
                    ? 'truncate font-display text-[23px] font-bold leading-tight text-paper'
                    : 'font-display text-lg font-bold text-paper'
                }
              >
                {title}
              </Vaul.Title>
              {titleAction}
            </div>
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
          <div className="relative">{children}</div>
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
