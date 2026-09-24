/**
 * Runs the branch-and-bound optimiser off the main thread: the Web Worker
 * entry point, its request/response protocol, and the main-thread client
 * that dispatches to it (falling back to a synchronous call where no worker
 * is available).
 * @packageDocumentation
 */

import { runSearchRequest } from './protocol';
import type { WorkerRequest, WorkerResponse } from './protocol';

(self as unknown as Worker).onmessage = (e: MessageEvent<WorkerRequest>) => {
  const post = (m: WorkerResponse) =>
    (self as unknown as Worker).postMessage(m);
  // Progress ticks stream out during the call; the returned envelope is the
  // one and only terminal message.
  post(runSearchRequest(e.data, post));
};
