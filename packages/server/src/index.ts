/**
 * The local server: Fastify API, MCP server, import watcher, gcsim runner and
 * LLM client. All I/O lives here, never in the engine.
 *
 * So far: the SQLite snapshot store (`store/`, TODO 2.6, ADR-0028). The API
 * and MCP server come in Phase 3.
 *
 * @packageDocumentation
 */

import { ENGINE_PACKAGE } from '@genshin-build-lab/engine';

/** Workspace wiring marker; removed once the server has a real entry point. */
export const SERVER_ENGINE_DEPENDENCY = ENGINE_PACKAGE;

export * from './store/store';
export { MIGRATIONS, migrate, MigrationError } from './store/migrations';
