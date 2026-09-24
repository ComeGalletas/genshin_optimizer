import { formatCount } from '../../labels';

/** The two honest numbers a branch-and-bound run can report, worded the same
 *  way everywhere they appear: the hero proof line, the exact-search line
 *  above the results, and the live progress line. Sentence in the body face,
 *  numerals in mono. */
export function SearchCounts({
  explored,
  pruned,
}: {
  explored: number;
  pruned: number;
}) {
  return (
    <>
      <span className="font-mono tabular-nums text-paper">
        {formatCount(explored)}
      </span>{' '}
      leaves evaluated ·{' '}
      <span className="font-mono tabular-nums text-paper">
        {formatCount(pruned)}
      </span>{' '}
      subtrees pruned
    </>
  );
}
