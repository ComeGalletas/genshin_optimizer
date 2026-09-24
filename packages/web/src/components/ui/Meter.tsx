import { cn } from './cn';

const FILL = {
  accent: 'bg-accent/70',
  jade: 'bg-jade/70',
} as const;

const HEIGHT = {
  xs: 'h-0.5',
  sm: 'h-1',
} as const;

/**
 * Decorative restatement of a number already shown as text beside it — hence
 * `aria-hidden`. A meter that is the *only* carrier of its value needs real
 * `role="progressbar"` semantics and does not belong here.
 */
export function Meter({
  value,
  tone = 'accent',
  size = 'xs',
  className,
}: {
  /** Percentage 0–100; clamped here so a caller never has to. */
  value: number;
  tone?: keyof typeof FILL;
  size?: keyof typeof HEIGHT;
  className?: string;
}) {
  const pct = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 100);
  return (
    <div
      aria-hidden="true"
      className={cn(
        'overflow-hidden rounded-full bg-white/5',
        HEIGHT[size],
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full', FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
