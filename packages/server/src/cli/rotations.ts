/**
 * `npm run rotations`: the owner's side of the rotation library (TODO 5.7,
 * ADR-0043). A model can draft a rotation (the `draft_rotation` tool); only
 * the owner, here, reviews and promotes one.
 *
 *   npm run rotations                    list them, with status
 *   npm run rotations -- review <id>     run it and write rotations/<id>/review.md
 *   npm run rotations -- promote <id> [--note "…"]
 *                                        validate a reviewed draft; asks to
 *                                        type the id (or --yes, no prompt)
 * @packageDocumentation
 */

import { createInterface } from 'node:readline/promises';
import {
  installedRotationDeps,
  promoteRotation,
  reviewRotation,
} from '../sim/drafts';
import { loadGcsimTool } from '../sim/gcsim';
import { RotationError } from '../sim/rotations';
import { openStore } from '../store/store';
import { Services } from '../api/services';

const [command = 'list', id, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? (rest[i + 1] ?? '') : undefined;
};

try {
  if (command === 'list') {
    const services = new Services(openStore(':memory:'));
    for (const r of services.listRotations().rotations)
      console.log(
        r.problems
          ? `${r.id}: refused (${r.problems.join('; ')})`
          : `${r.id.padEnd(20)} ${r.status.padEnd(9)} ${r.source.padEnd(9)} ${r.dps ? `${r.dps} DPS` : ''}  ${r.characters.join(', ')}`,
      );
  } else if (command === 'review' && id) {
    const deps = installedRotationDeps();
    if (!deps) throw new Error('gcsim is not installed: run npm run sim:check');
    const { path, result } = await reviewRotation(id, deps);
    console.log(
      `${id}: ${result.dps.mean.toFixed(0)} DPS ± ${result.dps.sd.toFixed(0)} over ${result.durationSec.toFixed(1)} s${result.warnings.length ? `, warnings: ${result.warnings.join(', ')}` : ''}`,
    );
    console.log(
      `Review written to ${path}. Read it, then promote it if it's right.`,
    );
  } else if (command === 'promote' && id) {
    if (!rest.includes('--yes')) {
      if (!process.stdin.isTTY)
        throw new Error(
          "promoting is the owner's call: run it in a terminal, or pass --yes",
        );
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const typed = await rl.question(
        `Promote ${id} to validated? You have read rotations/${id}/review.md. Type the id to confirm: `,
      );
      rl.close();
      if (typed.trim() !== id)
        throw new Error('not confirmed; nothing changed');
    }
    const outcome = promoteRotation(id, {
      gcsim: loadGcsimTool().version,
      note: flag('--note'),
    });
    if (outcome.promoted) console.log(`${id} is validated.`);
    else {
      for (const p of outcome.problems) console.log(`FAIL  ${p}`);
      process.exitCode = 1;
    }
  } else {
    console.log(
      'usage: npm run rotations [-- list | review <id> | promote <id> [--note "…"] [--yes]]',
    );
    process.exitCode = 1;
  }
} catch (e) {
  console.log(
    `FAIL  ${e instanceof RotationError ? e.message : (e as Error).message}`,
  );
  process.exitCode = 1;
}
