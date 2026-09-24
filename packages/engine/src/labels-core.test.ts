import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatCount,
  formatScore,
  formatStat,
  isPctStat,
  objectiveLabel,
  statLabel,
  SLOT_LABELS,
} from './labels-core';

function src(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

// Upstream's serverless proxy (`api/explain.ts`) bundled `ai/explainShared.ts`
// (web side; its own checks live in `packages/web/src/bundleBoundaries.test.ts`),
// which reaches these engine files. They all sat on that path, so an import of
// the game adapter (or of `../labels`, which imports it) from either one
// dragged the 328 KB `data.generated.json` snapshot into the function —
// measured at 315 KB before the labels-core split, 9 KB after. The proxy was
// removed in TODO 0.7; the tripwire stays until ADR-0021 (TODO 0.9) settles
// whether the local server needs the split. A module-graph assertion needs a bundler; a source-text tripwire
// catches the same mistake at the only place it can be made. The pattern
// matches an import specifier, not the bare words — these files are allowed to
// *mention* the adapter in the prose explaining why they must not import it.
const ADAPTER_IMPORT = /from '[^']*genshin\/adapter'/;

describe('serverless bundle boundary', () => {
  it('labels-core does not reach the game adapter', () => {
    expect(src('./labels-core.ts')).not.toMatch(ADAPTER_IMPORT);
  });

  it('artifactValidation (which explainShared imports) stays adapter-free', () => {
    expect(src('./game/artifactValidation.ts')).not.toMatch(ADAPTER_IMPORT);
  });
});

// The optimize worker (`workers/optimize.worker.ts` -> `workers/protocol.ts`
// -> `optimizer/search.ts` -> `optimizer/diagnostics.ts`) is the same kind of
// boundary as the serverless function was: a static import of the adapter
// (or of `../labels`, which imports it) anywhere on that path would bundle
// the 321 KB `data.generated.json` snapshot a second time, alongside the main
// thread's own copy. `OptimizeContext.setNames` (populated on the main thread
// in `optimizer/context.ts`, structured-cloned to the worker) is what lets
// `diagnostics.ts` render set names without reaching for the adapter itself.
const LABELS_IMPORT = /from '\.\.\/labels'/;

describe('optimize worker bundle boundary', () => {
  it('diagnostics reaches neither the adapter nor adapter-bound labels', () => {
    const text = src('./optimizer/diagnostics.ts');
    expect(text).not.toMatch(ADAPTER_IMPORT);
    expect(text).not.toMatch(LABELS_IMPORT);
  });

  // `workers/protocol.ts` (web side) is checked in `packages/web/src/bundleBoundaries.test.ts`.
  it('search (which diagnostics sits behind) stays adapter-free', () => {
    const text = src('./optimizer/search.ts');
    expect(text).not.toMatch(ADAPTER_IMPORT);
    expect(text).not.toMatch(LABELS_IMPORT);
  });
});

describe('labels-core', () => {
  it('groups counts en-US regardless of the host locale', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(0)).toBe('0');
  });

  // CI runs under en-US, where a bare `toLocaleString()` looks correct; on a
  // host like es-CO it renders `12.345`. Every UI number goes through a pinned
  // formatter instead, so a new bare call fails here rather than on one machine.
  // (The web app's own tree is scanned by `packages/web/src/bundleBoundaries.test.ts`.)
  it('no engine source file formats with the host locale', () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const offenders = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) =>
        /\.toLocale(?:Date|Time)?String\(\s*\)/.test(
          readFileSync(join(root, f), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('labels a known stat and falls back to the raw key', () => {
    expect(statLabel('crit_rate')).toBe('CRIT Rate');
    expect(statLabel('nonsense' as never)).toBe('nonsense');
  });

  it('labels objectives', () => {
    expect(objectiveLabel('crit_value')).toBe('Crit Value');
    expect(objectiveLabel('em')).toBe('Elemental Mastery');
  });

  it('formats a stat value with the unit its key implies', () => {
    expect(isPctStat('crit_dmg')).toBe(true);
    expect(isPctStat('em')).toBe(false);
    expect(formatStat('crit_dmg', 62.4)).toBe('62.4%');
    expect(formatStat('em', 120.4)).toBe('120');
    expect(formatScore(NaN)).toBe('—');
  });

  it('has a label for every slot', () => {
    expect(Object.keys(SLOT_LABELS)).toHaveLength(5);
  });
});
