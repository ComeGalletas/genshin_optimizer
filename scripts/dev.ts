/**
 * `npm run dev` (TODO 3.7): the web app (Vite, port 5199) and the local
 * server (port 5198, restarted on every server source change) together,
 * their output prefixed `[web]` and `[server]`. Ctrl+C stops both.
 *
 * The web app works without the server (ADR-0021 §3), so if the server
 * stops (say its port is taken by an `npm run server` already running),
 * the web app keeps going; if the web app stops, everything does.
 *
 *   npm run dev            web + server
 *   npm run dev:web        web only (the old `npm run dev`)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

/** A package's CLI entry, run with this Node instead of an npm shim, so
 *  stopping it stops the real process. */
function bin(pkg: string, name = pkg): string {
  const manifest = require.resolve(`${pkg}/package.json`);
  const b = (require(manifest) as { bin: string | Record<string, string> }).bin;
  return join(dirname(manifest), typeof b === 'string' ? b : b[name]);
}

const COLORS = { web: '\x1b[36m', server: '\x1b[35m' } as const;
const RESET = '\x1b[0m';

function run(
  name: keyof typeof COLORS,
  args: string[],
  cwd: string,
): ChildProcess {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    // Its own process group on POSIX, so the whole tree can be stopped.
    detached: process.platform !== 'win32',
  });
  const prefix = `${COLORS[name]}[${name}]${RESET} `;
  for (const stream of [child.stdout!, child.stderr!]) {
    let rest = '';
    stream.on('data', (chunk: Buffer) => {
      const lines = (rest + chunk.toString()).split(/\r?\n/);
      rest = lines.pop()!;
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
    stream.on('end', () => rest && process.stdout.write(prefix + rest + '\n'));
  }
  return child;
}

/** Stop a child and everything it started (tsx watch runs the server in a
 *  child of its own; Vite may too). */
function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  else
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
}

const server = run(
  'server',
  [bin('tsx'), 'watch', 'packages/server/src/cli/serve.ts'],
  root,
);
const web = run('web', [bin('vite')], join(root, 'packages/web'));

let stopping = false;
function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  stop(server);
  stop(web);
  process.exitCode = code;
}

server.on('exit', (code) => {
  if (!stopping)
    console.log(
      `${COLORS.server}[server]${RESET} stopped (exit ${code}); the web app keeps running client-only. Is port 5198 already in use?`,
    );
});
web.on('exit', (code) => stopAll(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => stopAll(0));
