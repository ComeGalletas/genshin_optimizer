/** A DPS figure as the comparison view prints it: 85.1k, or 9,876. */
export const kilo = (x: number) =>
  x >= 10_000
    ? `${(x / 1000).toFixed(1)}k`
    : Math.round(x).toLocaleString('en-US');
