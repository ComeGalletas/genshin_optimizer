/**
 * The server's environment: `.env.local`, then `.env`, at the repository
 * root, if present (both git-ignored). Variables already set win, and a
 * file never overrides the one before it. This is the only place secrets
 * (API keys) enter the app, and it runs only on the server (ADR-0021 §4).
 * @packageDocumentation
 */

import { existsSync } from 'node:fs';

export function loadServerEnv(files = ['.env.local', '.env']): string[] {
  const loaded: string[] = [];
  for (const f of files)
    if (existsSync(f)) {
      process.loadEnvFile(f);
      loaded.push(f);
    }
  return loaded;
}
