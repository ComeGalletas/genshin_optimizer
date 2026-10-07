/**
 * A guide page as a flat run of blocks (ADR-0061): headings with their
 * level, table rows with their cells, and lines of text. Enough structure to
 * read a guide's sections without a DOM. Pure.
 * @packageDocumentation
 */

export type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'row'; cells: string[] }
  | { kind: 'text'; text: string };

const H = '\u0001H';
const ROW = '\u0001R';
const CELL = '\u0003';

/** Character references, named and numbered. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&rsquo;|&lsquo;/g, '’')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

const stripTags = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** The page's blocks, in order. */
export function blocksOf(html: string): Block[] {
  let s = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
  // Rows first, each onto one line, so a cell's paragraphs stay together.
  s = s.replace(/<tr[\s\S]*?<\/tr>/gi, (row) => {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      // The markers can't appear in a cell's text.
      (m) =>
        stripTags(
          // Options on their own lines in one cell are alternatives.
          m[1].replace(
            /<br\s*\/?>|<\/p>\s*<p[^>]*>|<\/li>\s*<li[^>]*>/gi,
            ' / ',
          ),
        )
          .split('\u0001')
          .join('')
          .split(CELL)
          .join('')
          // A break before or after the text, or two in a row, separates
          // nothing.
          .replace(/(\s*\/\s*){2,}/g, ' / ')
          .replace(/^\s*\/\s*|\s*\/\s*$/g, ''),
    );
    return `\n${ROW}${cells.join(CELL)}\n`;
  });
  s = s
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_, n, t) => `\n${H}${n}${stripTags(t)}\n`,
    )
    .replace(/<br\s*\/?>|<\/(p|li|div|ul|ol|table|section)>/gi, '\n');
  const out: Block[] = [];
  for (const raw of s.split('\n')) {
    if (raw.startsWith(H)) {
      const text = raw.slice(H.length + 1).trim();
      if (text) out.push({ kind: 'h', level: Number(raw[H.length]), text });
    } else if (raw.startsWith(ROW)) {
      const cells = raw.slice(ROW.length).split(CELL);
      if (cells.some(Boolean)) out.push({ kind: 'row', cells });
    } else {
      const text = stripTags(raw);
      if (text) out.push({ kind: 'text', text });
    }
  }
  return out;
}

/** The blocks under a heading, up to the next heading of the same or a
 *  higher level. */
export function sectionAfter(blocks: Block[], at: number): Block[] {
  const head = blocks[at];
  if (head?.kind !== 'h') return [];
  const out: Block[] = [];
  for (let i = at + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'h' && b.level <= head.level) break;
    out.push(b);
  }
  return out;
}
