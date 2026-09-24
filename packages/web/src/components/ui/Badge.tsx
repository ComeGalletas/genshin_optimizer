import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import { TONE, type Tone } from './tone';

/** Pill label for a classification the row is already sorted by — a band, a
 *  status. Never the only carrier of the meaning: the text inside says it. */
export function Badge({
  tone,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone: Tone }) {
  return (
    <span
      className={cn(
        'rounded-lg border px-2 py-0.5 text-2xs font-semibold',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
