/**
 * `npm run mcp:config` (TODO 3.7): the MCP client config for this checkout,
 * ready to paste. It uses absolute paths (this Node, tsx's CLI, the MCP
 * entry point) because Claude Desktop starts servers from its own
 * directory, often without the terminal's PATH. See
 * docs/runbooks/local-server.md.
 *
 *   npm run mcp:config            Claude Desktop JSON and Claude Code commands
 *   npm run mcp:config -- --json  only the Claude Desktop "mcpServers" entry
 *   npm run mcp:config -- --install  add it to Claude Desktop's config file
 *
 * `--install` needs Claude Desktop closed: while it runs it rewrites its
 * config file from memory, dropping entries added from outside (seen on
 * Windows, 2026-09-30). It backs the file up and changes nothing but this
 * server's entry in `mcpServers`.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const tsxManifest = require.resolve('tsx/package.json');
const tsxCli = join(
  dirname(tsxManifest),
  (require(tsxManifest) as { bin: string }).bin,
);
const entry = join(root, 'packages/server/src/cli/mcp.ts');
const NAME = 'genshin-build-lab';

const desktop = {
  mcpServers: {
    [NAME]: { command: process.execPath, args: [tsxCli, entry] },
  },
};

/** Where Claude Desktop keeps its config. On Windows the Store (MSIX) app
 *  keeps it in its package folder; `%APPDATA%\Claude` is only a view of
 *  that folder, and it isn't there while the app is closed (seen
 *  2026-09-30), so the package folder wins when it exists. */
function desktopConfigPath(): string {
  if (process.platform === 'win32') {
    const packages = join(
      process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local'),
      'Packages',
    );
    const store = existsSync(packages)
      ? readdirSync(packages)
          .filter((d) => /^Claude_/.test(d))
          .map((d) => join(packages, d, 'LocalCache/Roaming/Claude'))
          .find((d) => existsSync(d))
      : undefined;
    return join(
      store ??
        join(
          process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'),
          'Claude',
        ),
      'claude_desktop_config.json',
    );
  }
  if (process.platform === 'darwin')
    return join(
      homedir(),
      'Library/Application Support/Claude/claude_desktop_config.json',
    );
  return join(homedir(), '.config/Claude/claude_desktop_config.json');
}

/** Is Claude Desktop running? The Claude Code CLI is also `claude.exe`,
 *  so on Windows the app is told apart by where it runs from. */
function desktopRunning(): boolean {
  try {
    if (process.platform === 'win32') {
      const paths = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-Process -Name claude -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }',
        ],
        { encoding: 'utf8' },
      );
      return paths
        .split(/\r?\n/)
        .some((p) => p.trim() && !/[\\/](claude-code|\.local)[\\/]/i.test(p));
    }
    if (process.platform === 'darwin')
      return (
        execFileSync('pgrep', ['-f', 'Claude.app/Contents/MacOS/Claude'], {
          encoding: 'utf8',
        }).trim() !== ''
      );
    return false;
  } catch {
    return false; // pgrep exits 1 when nothing matches
  }
}

function install() {
  const file = desktopConfigPath();
  if (desktopRunning()) {
    console.error(
      'Claude Desktop is running. Quit it completely first (tray or menu bar > Quit): while it runs it rewrites ' +
        file +
        ' and would drop this entry. Then run this again.',
    );
    process.exitCode = 1;
    return;
  }
  // Never start a config in a folder Claude Desktop didn't make: a wrong
  // guess would leave a file with only this entry that the app never reads.
  if (!existsSync(dirname(file))) {
    console.error(
      `Can't find Claude Desktop's config folder (looked for ${dirname(file)}). Open Claude Desktop once, or add the entry by hand: Settings > Developer > Edit Config, with what \`npm run mcp:config\` prints.`,
    );
    process.exitCode = 1;
    return;
  }
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (existsSync(file)) {
    const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(file, backup);
    console.log(`Backed up ${file}\n       to ${backup}`);
  }
  config.mcpServers = { ...config.mcpServers, ...desktop.mcpServers };
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
  renameSync(tmp, file);
  console.log(
    `Added "${NAME}" to ${file}.\nStart Claude Desktop; the tools appear under ${NAME}.`,
  );
}

if (process.argv.includes('--install')) {
  install();
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify(desktop, null, 2));
} else {
  const q = (s: string) => `"${s}"`;
  console.log(`Claude Desktop: Settings > Developer > Edit Config, then merge this into
claude_desktop_config.json and restart Claude Desktop:

${JSON.stringify(desktop, null, 2)}

Claude Code, over stdio (works whether or not npm run server is running):

  claude mcp add ${NAME} --scope user -- ${q(process.execPath)} ${q(tsxCli)} ${q(entry)}

Claude Code, over HTTP (only while npm run server or npm run dev runs):

  claude mcp add --transport http ${NAME} http://127.0.0.1:5198/mcp

The server reads the store at ${join(root, 'var', 'store.sqlite')}.`);
}
