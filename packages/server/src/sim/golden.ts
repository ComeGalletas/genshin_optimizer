/**
 * The golden gcsim configs (TODO 5.2): `golden/golden.json` lists each
 * config, and those with a published DPS carry it with a tolerance and the
 * source it came from. `npm run sim:check` runs them with the pinned binary.
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';

const GoldenFile = z
  .object({
    about: z.string(),
    configs: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          file: z.string().regex(/^[a-z0-9-]+\.txt$/),
          purpose: z.string(),
          expected: z
            .object({
              dps: z.number().positive(),
              tolerancePct: z.number().positive().max(10),
              source: z.string().url(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();

export interface GoldenConfig {
  id: string;
  /** Absolute path of the config file. */
  path: string;
  purpose: string;
  expected?: { dps: number; tolerancePct: number; source: string };
}

const DIR = new URL('./golden/', import.meta.url);

export function loadGolden(): GoldenConfig[] {
  const file = GoldenFile.parse(
    JSON.parse(readFileSync(new URL('golden.json', DIR), 'utf8')),
  );
  return file.configs.map((c) => ({
    id: c.id,
    path: fileURLToPath(new URL(c.file, DIR)),
    purpose: c.purpose,
    ...(c.expected && { expected: c.expected }),
  }));
}
