/**
 * Documentation integrity check (run in CI via `npm run docs:check`).
 *
 * Guards against documentation drift that the existing CI does not catch:
 *   1. ADR numbering in docs/adr/ is contiguous (no gaps, no duplicates).
 *   2. knowledge/index.md lists every ADR (catches a stale knowledge bundle).
 *   3. Relative links in CONTEXT.md and docs/adr/*.md resolve to real files.
 *
 * Out of scope (owned by the OKF action, see .github/workflows/okf.yml):
 * the knowledge bundle's own root-relative `/domain/...` links.
 */

import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();
const ADR_DIR = path.join(root, 'docs', 'adr');
const KNOWLEDGE_INDEX = path.join(root, 'knowledge', 'index.md');
const CONTEXT = path.join(root, 'CONTEXT.md');

const errors: string[] = [];

/** ADR filenames like `0004-exact-branch-and-bound-optimisation.md`. */
const adrFiles = fs
  .readdirSync(ADR_DIR)
  .filter((f) => /^\d{4}-.*\.md$/.test(f))
  .sort();

// 1. Contiguous ADR numbering.
const numbers = adrFiles.map((f) => Number(f.slice(0, 4)));
const seen = new Set<number>();
for (const n of numbers) {
  if (seen.has(n))
    errors.push(`Duplicate ADR number ${String(n).padStart(4, '0')}`);
  seen.add(n);
}
for (let i = 1; i <= numbers.length; i++) {
  if (!seen.has(i)) {
    errors.push(`ADR numbering gap: missing ${String(i).padStart(4, '0')}`);
  }
}

// 2. knowledge/index.md lists every ADR.
const knowledgeIndex = fs.readFileSync(KNOWLEDGE_INDEX, 'utf-8');
for (const f of adrFiles) {
  if (!knowledgeIndex.includes(f)) {
    errors.push(`knowledge/index.md does not reference ADR file ${f}`);
  }
}

// 3. Relative links resolve. Scan CONTEXT.md and every ADR.
const linkSources = [CONTEXT, ...adrFiles.map((f) => path.join(ADR_DIR, f))];
const inlineLink = /\]\(([^)]+)\)/g;
const refLink = /^\[[^\]]+\]:\s*(\S+)/gm;

function checkLinks(file: string): void {
  const text = fs.readFileSync(file, 'utf-8');
  const targets: string[] = [];
  for (const m of text.matchAll(inlineLink)) targets.push(m[1]);
  for (const m of text.matchAll(refLink)) targets.push(m[1]);

  for (const raw of targets) {
    const target = raw.trim();
    if (/^(https?:|mailto:)/i.test(target)) continue; // external
    if (target.startsWith('#')) continue; // same-page anchor
    if (target.startsWith('/')) continue; // root-relative: OKF action's job
    const filePart = target.split('#')[0];
    if (filePart === '') continue;
    const resolved = path.resolve(path.dirname(file), filePart);
    if (!fs.existsSync(resolved)) {
      errors.push(
        `Broken link in ${path.relative(root, file)}: "${target}" -> ${path.relative(root, resolved)}`,
      );
    }
  }
}

for (const file of linkSources) checkLinks(file);

// 4. Line caps the OKF knowledge-bundle action (okf.yml) enforces, mirrored
// here so an overlong file fails locally instead of only after a push.
const LINE_CAPS: Record<string, number> = {
  'CLAUDE.md': 60,
  'knowledge/index.md': 60,
};
for (const [rel, cap] of Object.entries(LINE_CAPS)) {
  const text = fs.readFileSync(path.join(root, rel), 'utf-8');
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  if (lines > cap) {
    errors.push(`${rel} is ${lines} lines, over the OKF cap of ${cap}`);
  }
}

// Report.
if (errors.length > 0) {
  console.error(`docs:check failed with ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `docs:check OK — ${adrFiles.length} ADRs, contiguous, indexed, links resolve, line caps hold.`,
);
