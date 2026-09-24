import type { DetailsHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** Native `details`/`summary` with the app's twisty — natively accessible, and
 *  one place where the twisty, the focus ring and the open-state rotation are
 *  defined. `size` picks the summary's type scale; `tone` its colour. */
export function Disclosure({
  label,
  size = 'sm',
  tone = 'muted',
  className,
  summaryClassName,
  children,
  ...rest
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'children'> & {
  label: ReactNode;
  size?: 'sm' | 'md';
  tone?: 'muted' | 'flux';
  className?: string;
  summaryClassName?: string;
  children?: ReactNode;
}) {
  return (
    <details className={cn('group', className)} {...rest}>
      <summary
        className={cn(
          'focus-ring inline-flex cursor-pointer select-none items-center gap-2 rounded-md transition',
          size === 'md' ? 'min-h-11 py-2 text-sm font-medium' : 'py-1',
          tone === 'flux'
            ? 'text-flux-bright hover:text-flux'
            : 'text-muted hover:text-paper/80',
          summaryClassName,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block transition group-open:rotate-90',
            size === 'md' ? 'text-xs' : 'text-2xs',
          )}
        >
          ▶
        </span>
        {label}
      </summary>
      {children}
    </details>
  );
}
