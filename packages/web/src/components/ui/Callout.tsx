import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import { TONE, type Tone } from './tone';

/** Callers own the live-region semantics: `role="alert"` for errors the user
 *  did not ask for, `role="status"` for confirmations of their own action. */
interface CalloutProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'error' | 'success' | 'info' | 'warning';
}

const CALLOUT_TONE: Record<NonNullable<CalloutProps['tone']>, Tone> = {
  error: 'rose',
  success: 'jade',
  info: 'accent',
  warning: 'warning',
};

/** One geometry for every inline message in the app — the tone is the only
 *  thing that varies. A caller needing different padding passes `className`. */
export function Callout({
  tone = 'info',
  className,
  children,
  ...rest
}: CalloutProps) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        TONE[CALLOUT_TONE[tone]],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
