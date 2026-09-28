/**
 * Runs exact searches on a worker thread, one at a time (the server is
 * single-user), with a time limit. A search that runs past it is stopped by
 * terminating the worker, which is replaced for the next request.
 * @packageDocumentation
 */

import { Worker } from 'node:worker_threads';
import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';

export class SearchTimeout extends Error {}

/** Default limit: long enough for a hard exact solve on a 1,650-piece
 *  account (a Furina ER ≥ 180% crit-value search took ~34 s), short
 *  enough that a runaway request doesn't hold the server. */
export const DEFAULT_SEARCH_LIMIT_MS = 120_000;

export class SearchRunner {
  private worker?: Worker;
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly limitMs = DEFAULT_SEARCH_LIMIT_MS) {}

  private spawn(): Worker {
    // The server runs TypeScript source through tsx; a worker thread doesn't
    // inherit that loader, so it starts from a bootstrap that registers it.
    const w = new Worker(new URL('./worker-bootstrap.mjs', import.meta.url));
    w.unref();
    return w;
  }

  /** Run one search; searches queue behind each other. */
  run(
    req: OptimizeRequest,
    inventory: Artifact[],
    ctx: OptimizeContext,
  ): Promise<OptimizeResult> {
    const job = this.queue.then(() => this.runNow(req, inventory, ctx));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private runNow(
    req: OptimizeRequest,
    inventory: Artifact[],
    ctx: OptimizeContext,
  ): Promise<OptimizeResult> {
    const worker = (this.worker ??= this.spawn());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        void worker.terminate();
        this.worker = undefined;
        reject(
          new SearchTimeout(
            `the search ran past ${Math.round(this.limitMs / 1000)} s and was stopped; narrow it (a set requirement, main stats, or pool "free")`,
          ),
        );
      }, this.limitMs);
      const onMessage = (m: {
        id: number;
        result?: OptimizeResult;
        error?: string;
      }) => {
        if (m.id !== id) return;
        cleanup();
        if (m.error !== undefined) reject(new Error(m.error));
        else resolve(m.result!);
      };
      const onError = (e: Error) => {
        cleanup();
        this.worker = undefined;
        reject(e);
      };
      const cleanup = () => {
        clearTimeout(timer);
        worker.off('message', onMessage);
        worker.off('error', onError);
      };
      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.postMessage({ id, req, inventory, ctx });
    });
  }

  async close(): Promise<void> {
    await this.worker?.terminate();
    this.worker = undefined;
  }
}
