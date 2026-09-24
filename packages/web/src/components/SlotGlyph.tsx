/**
 * The five artifact-slot marks, as inline SVG.
 *
 * These started life as five Unicode characters (✿ ⟁ ⧖ ♟ ◆). None of the three
 * webfonts this app loads — Space Grotesk, Spline Sans, IBM Plex Mono — carries
 * U+27C1, U+29D6 or U+265F, so every one of them fell through to whatever the
 * platform happened to have: five different shapes, five different optical
 * weights, on three different operating systems. A mark set the product uses as
 * a signature can't be a coin flip on the reader's font stack, so they are
 * drawn here instead.
 *
 * Same visual language as the characters they replace — organic flower,
 * triangle, hourglass, diamond — with one deliberate change: the Goblet was a
 * chess pawn (♟) purely because no goblet codepoint was to hand, and is now an
 * actual chalice.
 *
 * Filled silhouettes rather than strokes: these render at 14–18px, where a
 * sub-pixel stroke turns to grey mush.
 *
 * Always decorative. Every call site sits beside the slot's own text label, so
 * the `aria-hidden` here is not a shortcut — a second reading of "Flower" is
 * noise, not access.
 */
import type { Slot } from '@genshin-build-lab/engine/game/types';
import { cn } from './ui/cn';

/** 24×24 viewBox, filled with `currentColor`, drawn to a common optical size.
 *  Flower is absent on purpose: it is drawn from circles below, not a path. */
const PATHS: Record<Exclude<Slot, 'flower'>, string> = {
  plume: 'M12 3.1 L20.9 20.6 H3.1 Z M7.7 15.4 H16.3 V17.2 H7.7 Z',
  sands:
    'M4.6 2.9 H19.4 V5.1 H4.6 Z M4.6 18.9 H19.4 V21.1 H4.6 Z M6.6 5.1 H17.4 L12 11.3 Z M12 12.7 L17.4 18.9 H6.6 Z',
  goblet:
    'M5.4 3 H18.6 C18.6 9.5 15.7 13.3 13.1 14.1 V18.5 H16.7 V21 H7.3 V18.5 H10.9 V14.1 C8.3 13.3 5.4 9.5 5.4 3 Z',
  circlet: 'M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z',
};

/** Six petals plus a core — a rosette, which is what a flower glyph resolves to
 *  at this size anyway. Centres at 60° steps, radius 5.4 from the 12,12 origin. */
const PETALS: [number, number][] = [
  [12, 6.6],
  [16.7, 9.3],
  [16.7, 14.7],
  [12, 17.4],
  [7.3, 14.7],
  [7.3, 9.3],
];

export function SlotGlyph({
  slot,
  className,
}: {
  slot: Slot;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      // Sized in `em` so a caller changes the mark by changing its text size,
      // the way the Unicode characters behaved.
      className={cn('h-[1.15em] w-[1.15em] flex-none', className)}
    >
      {slot === 'flower' ? (
        <>
          {PETALS.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.1" />
          ))}
          <circle cx="12" cy="12" r="2.7" />
        </>
      ) : (
        <path d={PATHS[slot]} fillRule="evenodd" />
      )}
    </svg>
  );
}
