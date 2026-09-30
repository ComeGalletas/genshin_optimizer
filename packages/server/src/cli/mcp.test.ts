import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fromRoot, REPO_ROOT } from '../paths';
import {
  DEFAULT_STORE_PATH,
  importGood,
  openStore,
  recordMerge,
} from '../store/store';
import { DEFAULT_INBOX } from '../inbox/inbox';
import { loadLlmConfig } from '../llm/config';

describe('default paths (TODO 3.7)', () => {
  it('resolve from the repository root, not the working directory', () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.name).toBe('genshin-build-lab');
    for (const p of [DEFAULT_STORE_PATH, DEFAULT_INBOX]) {
      expect(isAbsolute(p)).toBe(true);
      expect(p.startsWith(REPO_ROOT)).toBe(true);
    }
    expect(DEFAULT_STORE_PATH).toBe(fromRoot('var/store.sqlite'));
    // The committed config loads by its default, and errors still name it
    // as written.
    expect(loadLlmConfig().provider).toBeDefined();
    expect(() => loadLlmConfig('no/such.json')).toThrow(/^no\/such\.json: /);
  });
});

describe('npm run mcp over stdio, started like Claude Desktop starts it', () => {
  it('answers from another working directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbl-mcp-'));
    try {
      const store = join(dir, 'store.sqlite');
      const db = openStore(store);
      importGood(db, {
        text: readFileSync(
          fromRoot(
            'packages/engine/src/import/__fixtures__/sample-account.good.json',
          ),
          'utf8',
        ),
      });
      recordMerge(db, [1]);
      db.close();
      // The command `npm run mcp:config` prints: this Node, tsx's CLI, the
      // entry point, all absolute.
      const require = createRequire(fromRoot('package.json'));
      const manifest = require.resolve('tsx/package.json');
      const tsxCli = join(dirname(manifest), require(manifest).bin as string);
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          tsxCli,
          fromRoot('packages/server/src/cli/mcp.ts'),
          '--store',
          store,
        ],
        cwd: dir,
        stderr: 'ignore',
      });
      const client = new Client({ name: 'desktop-like', version: '0' });
      await client.connect(transport);
      const tools = (await client.listTools()).tools.map((t) => t.name);
      expect(tools).toContain('optimize_build');
      const r = await client.callTool({
        name: 'get_account_summary',
        arguments: {},
      });
      expect(r.structuredContent).toMatchObject({ artifacts: { total: 20 } });
      await client.close();
    } finally {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  }, 30_000);
});
