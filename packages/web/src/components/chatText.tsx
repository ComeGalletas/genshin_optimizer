import { Fragment, type ReactNode } from 'react';

/** Shown under an answer whose numbers were checked and some removed. */
export const MASK_NOTE =
  'Numbers no tool gave were removed from this answer and show as [?].';

/** Inline: `**bold**`, `` `code` `` and the grounding's `[?]` marks. */
function inline(text: string, at: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[\?\])/g).map((part, i) => {
    const key = `${at}-${i}`;
    if (/^\*\*[^*\n]+\*\*$/.test(part))
      return (
        <strong key={key} className="font-semibold text-paper">
          {part.slice(2, -2)}
        </strong>
      );
    if (/^`[^`\n]+`$/.test(part))
      return (
        <code key={key} className="rounded bg-white/10 px-1 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    if (part === '[?]')
      return (
        <mark
          key={key}
          className="rounded bg-accent/20 px-0.5 text-accent"
          title="A number no tool gave, removed"
        >
          [?]
        </mark>
      );
    return <Fragment key={key}>{part}</Fragment>;
  });
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

/**
 * A model answer as React: `-`/`*` and `1.` lines become lists, `**bold**`
 * and `` `code` `` are honoured and `[?]` (a number the grounding removed)
 * stands out; everything else stays plain text, its line breaks kept by
 * the panel. Models write a little Markdown even when asked not to; this
 * is all of it worth honouring.
 */
export function renderAnswer(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const kind = BULLET.test(lines[i])
      ? 'ul'
      : NUMBERED.test(lines[i])
        ? 'ol'
        : null;
    if (kind) {
      const marker = kind === 'ul' ? BULLET : NUMBERED;
      const items: string[] = [];
      while (i < lines.length && marker.test(lines[i]))
        items.push(lines[i++].replace(marker, ''));
      const List = kind;
      blocks.push(
        <List
          key={`b${blocks.length}`}
          className={
            kind === 'ul'
              ? 'my-1 list-disc space-y-0.5 whitespace-normal pl-5'
              : 'my-1 list-decimal space-y-0.5 whitespace-normal pl-5'
          }
        >
          {items.map((item, j) => (
            <li key={j}>{inline(item, `b${blocks.length}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const run: string[] = [];
    while (
      i < lines.length &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i])
    )
      run.push(lines[i++]);
    const textRun = run.join('\n').replace(/^\n+|\n+$/g, '');
    if (textRun)
      blocks.push(
        <Fragment key={`b${blocks.length}`}>
          {inline(textRun, `b${blocks.length}`)}
        </Fragment>,
      );
  }
  return blocks;
}
