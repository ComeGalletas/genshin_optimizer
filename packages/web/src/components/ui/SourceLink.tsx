import type { ReactNode } from 'react';
import { ExternalLinkGlyph } from './Glyphs';

/** An outbound citation. Bakes in the new-tab attributes and the screen-reader
 *  warning that goes with them, so no caller can ship a link that opens a tab
 *  without saying so. The glyph gives sighted users the same warning: without
 *  it, nothing but colour/underline distinguished this from an in-app link. */
export function SourceLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLinkGlyph className="ml-1 inline-block align-middle" />
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
