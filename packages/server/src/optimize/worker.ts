/**
 * Worker-thread entry for the exact search (TODO 3.1): the same
 * `searchBuilds` the web app runs in a Web Worker, off the server's event
 * loop so a long solve doesn't freeze the API.
 * @packageDocumentation
 */

import { parentPort } from 'node:worker_threads';
import { searchBuilds } from '@genshin-build-lab/engine/optimizer/search';
import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
} from '@genshin-build-lab/engine/game/types';

export interface SearchJob {
  id: number;
  req: OptimizeRequest;
  inventory: Artifact[];
  ctx: OptimizeContext;
}

parentPort!.on('message', (job: SearchJob) => {
  try {
    const result = searchBuilds(job.req, job.inventory, job.ctx);
    parentPort!.postMessage({ id: job.id, result });
  } catch (e) {
    parentPort!.postMessage({ id: job.id, error: (e as Error).message });
  }
});
