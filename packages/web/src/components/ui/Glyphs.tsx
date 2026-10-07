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

/** A three-pointed crown: a talent at level 10, which takes a Crown of
 *  Insight (ADR-0057). */
export function CrownGlyph({ className }: { className?: string }) {
  return (
    <GlyphSvg className={className}>
      <path d="M3 7.5 L7.5 11.5 L12 4.5 L16.5 11.5 L21 7.5 L19.2 18 H4.8 Z M4.8 19.5 H19.2 V21 H4.8 Z" />
    </GlyphSvg>
  );
}

/** A five-pointed star: the set the character's build recommends. */
export function StarGlyph({ className }: { className?: string }) {
  return (
    <GlyphSvg className={className}>
      <path d="M12 2.8 L14.8 8.9 L21.4 9.6 L16.5 14.1 L17.8 20.7 L12 17.4 L6.2 20.7 L7.5 14.1 L2.6 9.6 L9.2 8.9 Z" />
    </GlyphSvg>
  );
}
