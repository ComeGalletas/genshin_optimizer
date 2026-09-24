import { GRADE_TONE } from '../../labels';
import type { Grade } from '@genshin-build-lab/engine/meta/grade';
import { Marker } from './Marker';

/** A build's grade letter as a marker. A bare letter in a role-less span is
 *  not a name a screen reader can make anything of, and `title` alone is
 *  neither the name nor reachable without a mouse — so role="img" +
 *  aria-label carry the whole sentence, `title` stays the sighted reader's
 *  tooltip, and every view that shows a grade says the same thing. */
export function GradeMarker({
  grade,
  subject = 'this build',
}: {
  grade: Grade;
  /** What's being graded, spliced into the aria-label — lets the same marker
   *  read correctly for the optimizer's best build vs. what's currently
   *  equipped, without duplicating the sentence at each call site. */
  subject?: string;
}) {
  const label = `Grade ${grade} — how close ${subject} is to endgame stat targets`;
  return (
    <Marker
      tone={GRADE_TONE[grade]}
      role="img"
      aria-label={label}
      title={label}
    >
      {grade}
    </Marker>
  );
}
