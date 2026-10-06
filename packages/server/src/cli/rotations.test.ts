import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fromRoot } from '../paths';

const run = promisify(execFile);
const require = createRequire(fromRoot('package.json'));
const manifest = require.resolve('tsx/package.json');
const tsxCli = join(dirname(manifest), require(manifest).bin as string);

/** `npm run rotations -- <args>`, with stdin not a terminal (as a script or
 *  an agent runs it). */
async function rotations(...args: string[]) {
  try {
    const { stdout } = await run(
      process.execPath,
      [tsxCli, fromRoot('packages/server/src/cli/rotations.ts'), ...args],
      { cwd: fromRoot('.'), timeout: 60_000 },
    );
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { code: number; stdout: string };
    return { code: err.code, stdout: err.stdout };
  }
}

describe('npm run rotations (TODO 5.7)', () => {
  it('lists the library with each rotation’s status', async () => {
    const { code, stdout } = await rotations();
    expect(code).toBe(0);
    expect(stdout).toMatch(/^raiden-national +validated +community /m);
    expect(stdout).toMatch(/^nahida-aggravate +validated +adapted /m);
  }, 60_000);

  it('won’t promote without the owner at a terminal (or an explicit --yes)', async () => {
    const { code, stdout } = await rotations('promote', 'nahida-aggravate');
    expect(code).toBe(1);
    expect(stdout).toContain(
      "promoting is the owner's call: run it in a terminal, or pass --yes",
    );
  }, 60_000);
});
