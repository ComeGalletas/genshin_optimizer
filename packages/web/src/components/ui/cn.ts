/**
 * Class-name join. Falsy entries drop out, so a conditional slot can be
 * written inline without leaving a stray double space in the attribute.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
