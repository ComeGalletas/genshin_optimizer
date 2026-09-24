/**
 * Small hand-drawn inline marks, replacing bare Unicode/emoji glyphs that
 * used to stand in for them (▶, ✓, 🔒). Same rationale as `SlotGlyph.tsx`:
 * a glyph pulled from the platform font renders with different shape and
 * weight across OSes, so the marks the product treats as a signal are drawn
 * here instead.
 *
 * Filled silhouettes, `currentColor`, sized in `em` so a caller changes the
 * mark by changing its text size. Always decorative — every call site sits
 * beside its own text label, so `aria-hidden` is baked in here rather than
 * left to the caller to remember.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

function GlyphSvg({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn('h-[0.9em] w-[0.9em] flex-none', className)}
    >
      {children}
    </svg>
  );
}

/** A small filled triangle pointing right — "expand/reveal more". */
export function PlayGlyph({ className }: { className?: string }) {
  return (
    <GlyphSvg className={className}>
      <path d="M6 3.5 L20 12 L6 20.5 Z" />
    </GlyphSvg>
  );
}

/** A checkmark stroke — "target met". */
export function CheckGlyph({ className }: { className?: string }) {
  return (
    <GlyphSvg className={className}>
      <path d="M3.5 12.8 L9 18.3 L20.5 6.2 L18.4 4.2 L9 14 L5.6 10.7 Z" />
    </GlyphSvg>
  );
}

/** A padlock — "locked, not yet reachable". */
export function LockGlyph({ className }: { className?: string }) {
  return (
    <GlyphSvg className={className}>
      <path d="M7.4 10.4 V8 C7.4 4.9 9.6 2.6 12 2.6 C14.4 2.6 16.6 4.9 16.6 8 V10.4 H17.6 C18.4 10.4 19 11 19 11.8 V20 C19 20.8 18.4 21.4 17.6 21.4 H6.4 C5.6 21.4 5 20.8 5 20 V11.8 C5 11 5.6 10.4 6.4 10.4 Z M9.4 10.4 H14.6 V8 C14.6 6 13.4 4.6 12 4.6 C10.6 4.6 9.4 6 9.4 8 Z" />
    </GlyphSvg>
  );
}

/** A stroke-based chevron — "reveal/navigate", used for a trigger or a row
 *  disclosure rather than the filled `PlayGlyph`'s "expand this section".
 *  Points right by default; pass a `rotate-*` class to point elsewhere
 *  (down for an open combobox, etc). Unlike the other glyphs here it is
 *  stroke, not fill, matching the two hand-written chevrons it replaces. */
export function ChevronGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-[0.9em] w-[0.9em] flex-none', className)}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** A small external-link mark — diagonal arrow out of a box, for a citation
 *  or outbound link that leaves the app. Always paired with the `sr-only`
 *  text a caller already carries; never the only signal of "new tab". */
export function ExternalLinkGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-[0.85em] w-[0.85em] flex-none', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 17 L17 7" />
      <path d="M9 7 H17 V15" />
    </svg>
  );
}
