/**
 * `npm run inbox`: import the files in `imports/inbox/` into the store.
 *
 *   npm run inbox                 import what is there, once
 *   npm run inbox -- --watch      and keep importing new files
 *   npm run inbox -- --store <path> --dir <path>
 *
 * Prints one line per file and the merge it recorded; never an account
 * identifier (GOOD files carry none, and nothing here reads one).
 * @packageDocumentation
 */

import { DEFAULT_STORE_PATH, currentAccount, openStore } from '../store/store';
import {
  DEFAULT_INBOX,
  processInbox,
  watchInbox,
  type InboxEvent,
  type InboxRun,
} from '../inbox/inbox';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = option('dir') ?? DEFAULT_INBOX;
const db = openStore(option('store') ?? DEFAULT_STORE_PATH);

function line(e: InboxEvent): string {
  switch (e.status) {
    case 'imported':
      return `imported      ${e.file}: snapshot ${e.snapshot.id}, ${e.snapshot.source ?? 'unknown source'} (${e.snapshot.kind}), ${e.snapshot.artifacts} artifacts, ${e.issues} issues`;
    case 'faulty-scan':
      return `faulty scan   ${e.file}: snapshot ${e.snapshot.id} kept but not merged, ${e.snapshot.fault!.repeatedPieces} pieces repeated (${e.snapshot.fault!.extraEntries} extra entries); re-scan`;
    case 'already-imported':
      return `already here  ${e.file}: snapshot ${e.snapshot.id}`;
    case 'refused':
      return `refused       ${e.file}: ${e.reason}`;
  }
}

/** "What changed" in one line, then the upgrades and moves one by one. */
function changes(e: InboxEvent): string[] {
  if (e.status !== 'imported' || !e.changes) return [];
  const { from, diff: d } = e.changes;
  const out = [
    `  since snapshot ${from}: ${d.added.length} new, ${d.removed.length} gone, ${d.upgraded.length} upgraded, ${d.moved.length} moved, ${d.lockChanged.length} lock changes, ${d.unexplained.length} unexplained, ${d.unchanged} unchanged`,
  ];
  for (const x of d.unexplained) out.push(`  ? ${x.why}`);
  return out;
}

function print(run: InboxRun): void {
  for (const e of run.events)
    [line(e), ...changes(e)].forEach((l) => console.log(l));
  if (run.merge)
    console.log(
      `merged        snapshots ${run.merge.snapshotIds.join(', ')} → merge ${run.merge.id}, ${run.merge.artifacts} artifacts (current account)`,
    );
}

if (args.includes('--watch')) {
  console.log(`watching ${dir} (Ctrl+C to stop)`);
  const stop = watchInbox(db, dir, { onRun: print });
  process.on('SIGINT', () => {
    stop();
    db.close();
  });
} else {
  const run = processInbox(db, dir);
  if (!run.events.length) console.log(`nothing in ${dir}`);
  print(run);
  console.log(`current account: ${currentAccount(db).length} artifacts`);
  db.close();
}
