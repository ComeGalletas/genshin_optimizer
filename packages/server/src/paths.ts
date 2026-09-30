/**
 * Where the server's files are by default (TODO 3.7): the repository root,
 * whatever directory the process starts in. Claude Desktop and other MCP
 * clients start `npm run mcp`'s script from their own directory, where a
 * relative `var/store.sqlite` would silently open an empty store. Paths
 * given on a command line still resolve against the working directory.
 * @packageDocumentation
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root (this file is `packages/server/src/paths.ts`). */
export const REPO_ROOT = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../..',
);

/** A repository-relative path made absolute. */
export const fromRoot = (path: string) => resolve(REPO_ROOT, path);
