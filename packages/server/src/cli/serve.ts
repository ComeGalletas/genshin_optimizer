/**
 * `npm run server`: the local HTTP API (TODO 3.1) on 127.0.0.1 only
 * (ADR-0021). The MCP server joins it in 3.2 and 3.7.
 *
 *   npm run server                     port 5198, store var/store.sqlite
 *   npm run server -- --port 5200 --store <path>
 * @packageDocumentation
 */

import { DEFAULT_STORE_PATH, openStore } from '../store/store';
import { buildApp } from '../api/app';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
export const DEFAULT_PORT = 5198;

const db = openStore(option('store') ?? DEFAULT_STORE_PATH);
const app = buildApp({ db, logger: true });
const port = Number(option('port') ?? DEFAULT_PORT);
await app.listen({ host: '127.0.0.1', port });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => db.close());
  });
