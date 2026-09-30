import { Fragment, type ReactNode } from 'react';

/** Shown under an answer whose numbers were checked and some removed. */
export const MASK_NOTE =
  'Numbers no tool gave were removed from this answer and show as [?].';

/**
 * A model answer as React text: `**bold**` becomes <strong>, everything
 * else stays plain (the panel keeps line breaks). Models write a little
 * Markdown even when asked not to; this is all of it worth honouring.
 */
export function renderAnswer(text: string): ReactNode {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    /^\*\*[^*\n]+\*\*$/.test(part) ? (
      <strong key={i} className="font-semibold text-paper">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
