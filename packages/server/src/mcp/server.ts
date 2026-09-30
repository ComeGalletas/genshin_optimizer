/**
 * The MCP server (TODO 3.2, ADR-0031): the account, the optimizer and the
 * import history as tools for Claude Desktop, Claude Code or any MCP
 * client. The tools call the same `Services` as the HTTP API, and their
 * inputs are the API's zod schemas, so both surfaces accept and answer the
 * same things.
 *
 * The tools themselves are in `tools.ts`, shared with the chat loop.
 * @packageDocumentation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServiceError, type Services } from '../api/services';
import { accountTools, TOOL_INSTRUCTIONS } from './tools';

export { compact } from './tools';
export const MCP_INSTRUCTIONS = TOOL_INSTRUCTIONS;

/** MCP's structured content must be a JSON object, never an array or a
 *  scalar; every tool returns one. */
function ok(value: Record<string, unknown>): CallToolResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('a tool result must be a JSON object');
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

/** Run a tool body; a ServiceError is a tool error the model can read and
 *  act on, anything else is the SDK's problem to report. */
async function run(
  body: () => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    return ok(await body());
  } catch (e) {
    if (e instanceof ServiceError)
      return {
        isError: true,
        content: [{ type: 'text', text: `${e.code}: ${e.message}` }],
      };
    throw e;
  }
}

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export function createMcpServer(services: Services, version = '0.0.0') {
  const server = new McpServer(
    { name: 'genshin-build-lab', version },
    { instructions: MCP_INSTRUCTIONS },
  );
  for (const t of accountTools(services)) {
    const config = {
      title: t.title,
      description: t.description,
      annotations: readOnly,
    };
    const body = t.run as (a: unknown) => ReturnType<typeof t.run>;
    if (t.input)
      server.registerTool(t.name, { ...config, inputSchema: t.input }, (args) =>
        run(() => body(args)),
      );
    else server.registerTool(t.name, config, () => run(() => body({})));
  }
  return server;
}
