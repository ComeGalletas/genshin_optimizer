/**
 * `npm run phase2:check -- <earlier.json> <later.json> [scan.json ...]`: the
 * Phase 2 acceptance check (ADR-0026) on real exports, in a throwaway store
 * (the real `var/store.sqlite` is not touched).
 *
 * 1. Re-importing the earlier Irminsul export changes nothing.
 * 2. The later export's "what changed" list, for the owner to confirm
 *    against what they did in game (upgrades, moves, new drops, fodder).
 * 3. Any OCR scan given is either imported and merged, or reported as a
 *    faulty scan and left out.
 *
 * Prints pieces by set, slot, level and wearer only; GOOD files carry no
 * account identifier.
 * @packageDocumentation
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { SnapshotPiece } from '@genshin-build-lab/engine/merge/merge';
import { processInbox } from '../inbox/inbox';
import {
  currentAccount,
  diffSincePrevious,
  loadSnapshot,
  openStore,
} from '../store/store';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length < 2) {
  console.error(
    'usage: npm run phase2:check -- <earlier Irminsul export> <later Irminsul export> [OCR scans...]',
  );
  process.exit(1);
}
const [earlier, later, ...scans] = files;
const tmp = mkdtempSync(join(tmpdir(), 'phase2-check-'));
const db = openStore(join(tmp, 'check.sqlite'));
let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
};
const describe = (p: SnapshotPiece) =>
  `${p.artifact.setKey} ${p.artifact.slot} +${p.artifact.level}${p.artifact.location ? ` (${p.artifact.location})` : ''}`;

try {
  // 1. Idempotent re-import.
  const first = processInbox(db, dirname(earlier), [basename(earlier)]);
  check(
    first.events[0].status === 'imported' && !!first.merge,
    `${basename(earlier)} imports and becomes the current account (${first.events[0].status})`,
  );
  const size = currentAccount(db).length;
  const again = processInbox(db, dirname(earlier), [basename(earlier)]);
  check(
    again.events[0].status === 'already-imported' &&
      !again.merge &&
      currentAccount(db).length === size,
    `re-importing ${basename(earlier)} changes nothing (${size} artifacts)`,
  );
  check(size > 0, 'the current account is not empty');

  // 2. What changed.
  const run = processInbox(db, dirname(later), [basename(later)]);
  const e = run.events[0];
  check(e.status === 'imported', `${basename(later)} imports (${e.status})`);
  const changes =
    e.status === 'imported' ? diffSincePrevious(db, e.snapshot.id) : undefined;
  check(!!changes, 'a "what changed" list against the earlier export');
  if (changes) {
    const before = loadSnapshot(db, changes.from).pieces;
    const after = loadSnapshot(db, changes.to).pieces;
    const d = changes.diff;
    console.log(
      `\nWhat changed: ${d.added.length} new, ${d.removed.length} gone, ${d.upgraded.length} upgraded, ${d.moved.length} moved, ${d.lockChanged.length} lock changes, ${d.unexplained.length} unexplained, ${d.unchanged} unchanged\n`,
    );
    for (const u of d.upgraded)
      console.log(
        `  upgraded  ${describe(before[u.before])} → +${after[u.after].artifact.level} (by ${u.by})`,
      );
    for (const m of d.moved)
      console.log(
        `  moved     ${describe(before[m.before])} → ${m.to ?? 'nobody'}`,
      );
    for (const x of d.unexplained) console.log(`  ?         ${x.why}`);
    console.log(
      `\nConfirm these against what you did in game. ${d.added.length} new and ${d.removed.length} gone should match your drops and the fodder you used.\n`,
    );
  }

  // 3. OCR scans: merged, or reported as faulty.
  for (const scan of scans) {
    const r = processInbox(db, dirname(scan), [basename(scan)]).events[0];
    if (r.status === 'faulty-scan')
      check(
        true,
        `${basename(scan)}: faulty scan detected (${r.snapshot.fault!.repeatedPieces} pieces repeated, ${r.snapshot.fault!.extraEntries} extra entries), not merged`,
      );
    else check(r.status === 'imported', `${basename(scan)}: ${r.status}`);
  }
} finally {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(
  failures ? `\n${failures} check(s) failed` : '\nAll automatic checks passed.',
);
process.exitCode = failures ? 1 : 0;
