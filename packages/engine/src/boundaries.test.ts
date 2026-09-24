import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// The engine's import boundary (TODO 0.6; CLAUDE.md "Conventions": engine
// code is pure, all I/O lives in `server`). `tsconfig.lib.json` already makes
// DOM and Node globals type errors in engine source; this covers what a type
// check can't see:
// - a relative import that climbs out of the package (`../../web/src/...`)
//   or an import of the `web`/`server` packages, which typechecks fine,
// - a Node built-in or new third-party dependency in source,
// - tests, which that gate excludes: they may read fixtures with `node:fs`,
//   but they must not reach into `web` or `server` either.
// Specifiers come from TypeScript's own scanner, so `import type`,
// `export ... from`, dynamic `import()` and `require()` all count.

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(PACKAGE_ROOT, 'src');

/** Bare specifiers tests may use besides Node built-ins. */
const TEST_DEPENDENCIES = new Set(['vitest', 'typescript']);

function specifiers(text: string): string[] {
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map((f) => f.fileName);
}

/** Everything wrong with one file's imports, as readable messages. */
function violations(file: string, text: string): string[] {
  const isTest = /\.test\.tsx?$/.test(file);
  const out: string[] = [];
  for (const spec of specifiers(text)) {
    if (spec.startsWith('.')) {
      const target = resolve(dirname(file), spec);
      if (relative(PACKAGE_ROOT, target).startsWith('..'))
        out.push(`'${spec}' leaves packages/engine`);
    } else if (/^@genshin-build-lab\/(?:web|server)(?:\/|$)/.test(spec)) {
      out.push(`'${spec}': the engine must not depend on web or server`);
    } else if (/^@genshin-build-lab\/engine(?:\/|$)/.test(spec)) {
      // Self-reference through the package's own exports: still inside.
    } else if (isBuiltin(spec)) {
      if (!isTest)
        out.push(
          `'${spec}' is a Node built-in: I/O belongs in packages/server`,
        );
    } else if (!isTest || !TEST_DEPENDENCIES.has(spec.split('/')[0])) {
      out.push(
        `'${spec}' is a third-party package: the engine has no runtime dependencies`,
      );
    }
  }
  return out;
}

describe('engine import boundary', () => {
  it('no engine file imports I/O, web, server or packages outside the engine', () => {
    const found: string[] = [];
    for (const rel of readdirSync(SRC, { recursive: true, encoding: 'utf8' })) {
      if (!/\.tsx?$/.test(rel)) continue;
      const file = join(SRC, rel);
      for (const v of violations(file, readFileSync(file, 'utf8')))
        found.push(`${rel}: ${v}`);
    }
    expect(found).toEqual([]);
  });

  // The scan above passes on an empty or blind checker too, so pin down
  // what it catches.
  describe('the checker', () => {
    const source = join(SRC, 'optimizer', 'search.ts');
    const test = join(SRC, 'optimizer', 'search.test.ts');

    it.each([
      "import { readFileSync } from 'node:fs';",
      "import { readFileSync } from 'fs';",
      "import { spawn } from 'child_process';",
      "import http from 'node:http';",
      "const fs = await import('fs');",
      "const cp = require('child_process');",
      "import { create } from 'zustand';",
      "import type { Store } from '@genshin-build-lab/web/state/inventory';",
      "export * from '@genshin-build-lab/server';",
      "import { labels } from '../../../web/src/labels';",
      "import { run } from '../../../server/src/index';",
    ])('flags %s in source', (line) => {
      expect(violations(source, line)).toHaveLength(1);
    });

    it.each([
      "import { useInventory } from '@genshin-build-lab/web/state/inventory';",
      "import { bench } from '../../../../scripts/benchmark';",
      "import { create } from 'zustand';",
    ])('flags %s in tests', (line) => {
      expect(violations(test, line)).toHaveLength(1);
    });

    it('allows engine-internal imports, and fixtures reads in tests', () => {
      expect(
        violations(
          source,
          [
            "import type { Artifact } from '../game/types';",
            "import { score } from './score';",
            "import { formatCount } from '@genshin-build-lab/engine/labels-core';",
          ].join('\n'),
        ),
      ).toEqual([]);
      expect(
        violations(
          test,
          [
            "import { describe } from 'vitest';",
            "import { readFileSync } from 'node:fs';",
            "import sample from '../import/__fixtures__/sample-account.good.json';",
          ].join('\n'),
        ),
      ).toEqual([]);
    });
  });
});

describe('engine purity gate (tsconfig.lib.json)', () => {
  // The type-level half of the boundary only holds while the gate stays
  // closed: no ambient `types` (which would bring back @types/node) and no
  // DOM lib. Loosening it should fail here, not pass silently.
  it('typechecks engine source with no Node types and no DOM lib', () => {
    const path = join(PACKAGE_ROOT, 'tsconfig.lib.json');
    const { config, error } = ts.readConfigFile(path, ts.sys.readFile);
    expect(error).toBeUndefined();
    const { options } = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      PACKAGE_ROOT,
    );
    expect(options.types).toEqual([]);
    expect(options.lib?.length).toBeGreaterThan(0);
    expect(options.lib?.filter((l) => /dom|webworker/i.test(l))).toEqual([]);
  });
});
