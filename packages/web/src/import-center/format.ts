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

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const snapshotName = (s: SnapshotInfo | undefined, id: number) =>
  s
    ? `#${id} ${SOURCE_LABEL[s.kind]}${s.fileName ? ` (${s.fileName})` : ''}`
    : `#${id}`;
