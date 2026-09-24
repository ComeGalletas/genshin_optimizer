import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string): string => readFileSync(join(here, rel), 'utf8');

// Web-side half of the bundle-boundary tripwires; the engine half lives in
// `packages/engine/src/labels-core.test.ts`. A static import of the game
// adapter — or of the adapter-bound labels, which import it — drags the
// ~320 KB `data.generated.json` snapshot into a bundle that must not carry it.
// The patterns match import specifiers, not bare words, so these files may
// still *mention* the adapter in prose. The "serverless" case guarded
// upstream's `api/explain.ts` bundle; that proxy was removed in TODO 0.7, and
// the check stays until ADR-0021 (TODO 0.9) settles whether the local server
// needs it.
const ADAPTER_IMPORT = /from '[^']*genshin\/adapter'/;
const LABELS_IMPORT =
  /from '(?:\.\.\/labels|@genshin-build-lab\/engine\/labels)'/;

describe('serverless bundle boundary', () => {
  it('explainShared reaches neither the adapter nor adapter-bound labels', () => {
    const text = src('./ai/explainShared.ts');
    expect(text).not.toMatch(ADAPTER_IMPORT);
    expect(text).not.toMatch(LABELS_IMPORT);
  });
});

describe('optimize worker bundle boundary', () => {
  it('protocol (which the worker loads) stays adapter-free', () => {
    const text = src('./workers/protocol.ts');
    expect(text).not.toMatch(ADAPTER_IMPORT);
    expect(text).not.toMatch(LABELS_IMPORT);
  });
});

describe('host-locale formatting', () => {
  // Same tripwire as the engine's: CI runs en-US, so a bare
  // `toLocaleString()` only shows up as `12.345` on a machine like es-CO.
  it('no web source file formats with the host locale', () => {
    const offenders = readdirSync(here, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => /\.toLocale(?:Date|Time)?String\(\s*\)/.test(src(f)));
    expect(offenders).toEqual([]);
  });
});
