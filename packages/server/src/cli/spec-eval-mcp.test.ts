import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fromRoot } from '../paths';
import { SUBMIT_SPEC, submitSpecTool } from '../llm/translate';

/** Start the eval's MCP server the way Claude Code does, with a state file. */
async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'gbl-eval-mcp-'));
  const state = join(dir, 'state.json');
  const require = createRequire(fromRoot('package.json'));
  const manifest = require.resolve('tsx/package.json');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(dirname(manifest), require(manifest).bin as string),
      fromRoot('packages/server/src/cli/spec-eval-mcp.ts'),
    ],
    env: { ...(process.env as Record<string, string>), SPEC_EVAL_STATE: state },
    cwd: dir,
    stderr: 'ignore',
  });
  const client = new Client({ name: 'claude-code-like', version: '0' });
  await client.connect(transport);
  const submit = async (spec: object) => {
    const r = await client.callTool({
      name: SUBMIT_SPEC,
      arguments: spec as never,
    });
    return {
      isError: r.isError === true,
      text: (r.content as { text: string }[])[0].text,
      state: JSON.parse(readFileSync(state, 'utf8')),
    };
  };
  const stop = async () => {
    await client.close();
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  };
  return { client, submit, stop };
}

describe('the claude-code evaluation’s MCP server (ADR-0039)', () => {
  it('offers the app’s own submit_spec and answers it as the translator does', async () => {
    const s = await start();
    try {
      const { tools } = await s.client.listTools();
      expect(tools.map((t) => t.name)).toEqual([SUBMIT_SPEC]);
      // The exact schema the app's translator gives a model.
      expect(tools[0].inputSchema).toEqual(submitSpecTool().parameters);

      const bad = await s.submit({ character: 'nobody', pool: 'free' });
      expect(bad.isError).toBe(true);
      expect(bad.text).toMatch(
        /^error: the spec has a problem:\n- pool: unknown field "pool"; the fields are .*\nFix it and call submit_spec again\.$/s,
      );
      expect(bad.state).toMatchObject({
        attempts: 1,
        issues: [{ path: 'pool' }],
      });

      const good = await s.submit({
        character: 'furina',
        minStats: { er_pct: 180 },
      });
      expect(good.isError).toBe(false);
      expect(good.text).toMatch(/^Accepted\. I understood: build Furina/);
      expect(good.state).toEqual({
        attempts: 2,
        spec: { character: 'furina', minStats: { er_pct: 180 }, version: 1 },
      });

      const again = await s.submit({ character: 'bennett' });
      expect(again.text).toBe('The spec was already accepted.');
      expect(again.state.attempts).toBe(2);
    } finally {
      await s.stop();
    }
  }, 60_000);

  it('allows three attempts, like the translator', async () => {
    const s = await start();
    try {
      for (let i = 1; i <= 3; i++)
        expect((await s.submit({ character: 'nobody' })).state.attempts).toBe(
          i,
        );
      const fourth = await s.submit({ character: 'furina' });
      expect(fourth).toMatchObject({
        isError: true,
        text: 'error: no attempts left.',
        state: { attempts: 3 },
      });
      expect(fourth.state.spec).toBeUndefined();
    } finally {
      await s.stop();
    }
  }, 60_000);
});
