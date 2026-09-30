/**
 * `npm run mcp:config` (TODO 3.7): the MCP client config for this checkout,
 * ready to paste. It uses absolute paths (this Node, tsx's CLI, the MCP
 * entry point) because Claude Desktop starts servers from its own
 * directory, often without the terminal's PATH. See
 * docs/runbooks/local-server.md.
 *
 *   npm run mcp:config            Claude Desktop JSON and Claude Code commands
 *   npm run mcp:config -- --json  only the Claude Desktop "mcpServers" entry
 */
import { createRequire } from 'node:module';
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

if (process.argv.includes('--json')) {
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
