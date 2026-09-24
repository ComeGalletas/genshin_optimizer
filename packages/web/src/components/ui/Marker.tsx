import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import { TONE, type Tone } from './tone';

/** Square single-glyph tick — a grade letter, a rank. Shares the `.tick`
 *  recipe with `.section-badge`, so the two are the same shape by
 *  construction rather than by hand-matched numbers.
 *
 *  A bare `<span>` has no role, so a single glyph carries no accessible name
 *  of its own beyond its text. Callers whose glyph is a code the reader has
 *  to decode (a grade letter) should pass `role="img"` + `aria-label`; both
 *  travel through `...rest`. */
export function Marker({
  tone,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone: Tone }) {
  return (
    <span
      className={cn('tick tick-sm font-display', TONE[tone], className)}
      {...rest}
    >
      {children}
    </span>
  );
}
