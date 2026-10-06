/**
 * Ranking builds by simulated DPS (TODO 5.8): each candidate's mean team DPS
 * over its iterations, with a 95% confidence interval for that mean, and
 * which candidates can't be told apart from the best (the difference is
 * inside the noise of the two runs). Pure.
 * @packageDocumentation
 */

/** A run's DPS: mean and spread over its iterations. */
export interface DpsSample {
  mean: number;
  sd: number;
  iterations: number;
}

export interface SimRanked<T> {
  item: T;
  /** 1 = highest mean DPS. */
  rank: number;
  /** Where the stat search had it (1 = its best). */
  statRank: number;
  mean: number;
  sd: number;
  /** 95% confidence interval of the mean. */
  ci95: [number, number];
  /** How far behind the best's mean, percent (0 for the best). */
  behindPct: number;
  /** The difference to the best is inside the noise (95%), so the two
   *  can't be told apart at these iterations. The best is in it too when
   *  anything ties it. */
  tiedWithBest: boolean;
}

/** Normal quantile for a two-sided 95% interval. */
const Z95 = 1.96;

const se = (d: DpsSample) => d.sd / Math.sqrt(Math.max(1, d.iterations));

/** Candidates by mean DPS, highest first (the stat search's order breaks
 *  exact ties), with intervals and the ties to the best. */
export function rankBySim<T>(
  entries: readonly { item: T; statRank: number; dps: DpsSample }[],
): SimRanked<T>[] {
  const sorted = [...entries].sort(
    (a, b) => b.dps.mean - a.dps.mean || a.statRank - b.statRank,
  );
  const best = sorted[0];
  if (!best) return [];
  const ranked = sorted.map((e, i): SimRanked<T> => {
    const half = Z95 * se(e.dps);
    const noise = Z95 * Math.hypot(se(best.dps), se(e.dps));
    return {
      item: e.item,
      rank: i + 1,
      statRank: e.statRank,
      mean: e.dps.mean,
      sd: e.dps.sd,
      ci95: [e.dps.mean - half, e.dps.mean + half],
      behindPct:
        best.dps.mean > 0
          ? (100 * (best.dps.mean - e.dps.mean)) / best.dps.mean
          : 0,
      tiedWithBest: i > 0 && best.dps.mean - e.dps.mean <= noise,
    };
  });
  if (ranked.some((r) => r.tiedWithBest)) ranked[0].tiedWithBest = true;
  return ranked;
}
