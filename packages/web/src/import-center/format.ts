/** The import center's words for sources, times and counts (TODO 8.1). */
import type { SnapshotInfo, SourceKind } from '../local-server/imports';

export const SOURCE_LABEL: Record<SourceKind, string> = {
  irminsul: 'Irminsul',
  ocr: 'OCR scanner',
  good: 'Other GOOD file',
  enka: 'Enka showcase',
};

/** "2026-10-05 14:03 UTC": the same on every machine. */
export const when = (iso: string) =>
  `${iso.slice(0, 16).replace('T', ' ')} UTC`;

export const snapshotName = (s: SnapshotInfo | undefined, id: number) =>
  s
    ? `#${id} ${SOURCE_LABEL[s.kind]}${s.fileName ? ` (${s.fileName})` : ''}`
    : `#${id}`;
