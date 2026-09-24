/**
 * The local server: Fastify API, MCP server, import watcher, gcsim runner and
 * LLM client. All I/O lives here, never in the engine.
 *
 * Empty until TODO 2.6 (SQLite snapshot store) and Phase 3 (API + MCP).
 *
 * @packageDocumentation
 */

import { ENGINE_PACKAGE } from '@genshin-build-lab/engine';

/** Workspace wiring marker; removed once the server has a real entry point. */
export const SERVER_ENGINE_DEPENDENCY = ENGINE_PACKAGE;
