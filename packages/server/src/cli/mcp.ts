/**
 * `npm run mcp`: the MCP server over stdio (TODO 3.2, ADR-0031), for Claude
 * Desktop and Claude Code. Stdout carries the protocol, so nothing else may
 * print to it; diagnostics go to stderr.
 *
 *   npm run mcp                        store var/store.sqlite
 *   npm run mcp -- --store <path>
 * @packageDocumentation
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DEFAULT_STORE_PATH, openStore } from '../store/store';
import { Services } from '../api/services';
import { createMcpServer } from '../mcp/server';

const args = process.argv.slice(2);
const i = args.indexOf('--store');
const db = openStore(i >= 0 ? args[i + 1] : DEFAULT_STORE_PATH);
const services = new Services(db);
const server = createMcpServer(services);
await server.connect(new StdioServerTransport());
console.error('genshin-build-lab MCP server on stdio');

const shutdown = () => {
  void server
    .close()
    .then(() => services.searches.close())
    .finally(() => db.close());
};
process.stdin.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
