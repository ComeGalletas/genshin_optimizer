/**
 * The engine's public surface. Everything here is pure: no files, network,
 * child processes or DOM (CLAUDE.md "Conventions"; enforced by
 * `tsconfig.lib.json`, which typechecks this source with neither Node nor DOM
 * types).
 *
 * Empty until TODO 0.3 moves the optimizer, damage, import, meta and game
 * modules in from the web app.
 *
 * @packageDocumentation
 */

/** Workspace wiring marker; removed once real exports land in 0.3. */
export const ENGINE_PACKAGE = '@genshin-build-lab/engine';
