/**
 * The server's one content hash: SHA-256 as hex, of text (UTF-8) or bytes.
 * The store keys import files by it; the gcsim installer checks the pinned
 * binary with it.
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';

export const sha256 = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');
