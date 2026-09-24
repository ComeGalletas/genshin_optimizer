import { searchBuilds } from '@genshin-build-lab/engine/optimizer/search';
import type { SearchProgress } from '@genshin-build-lab/engine/optimizer/search';
import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';

export interface WorkerRequest {
  req: OptimizeRequest;
  inventory: Artifact[];
  ctx: OptimizeContext;
}

/** Mid-flight counters, posted repeatedly before the single final message. */
export type WorkerProgress = { type: 'progress' } & SearchProgress;

export type WorkerResponse =
  | WorkerProgress
  | { type: 'done'; result: OptimizeResult }
  | { type: 'error'; message: string };

/**
 * Run one request to completion, funnelling the search's own progress
 * counters to `onProgress`. Every message the caller should forward is
 * either one of those progress snapshots or the returned final envelope.
 */
export function runSearchRequest(
  msg: WorkerRequest,
  onProgress?: (progress: WorkerProgress) => void,
): WorkerResponse {
  try {
    const result = searchBuilds(msg.req, msg.inventory, msg.ctx, {
      onProgress: onProgress && ((p) => onProgress({ type: 'progress', ...p })),
    });
    return { type: 'done', result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', message };
  }
}

/** Read a *final* envelope. Progress messages are not outcomes — callers must
 *  filter them out before getting here, or a mid-run tick would be mistaken
 *  for an answer. */
export function readSearchResponse(data: WorkerResponse): OptimizeResult {
  if (data.type === 'done') {
    return data.result;
  }
  if (data.type === 'error') {
    throw new Error(data.message);
  }
  throw new Error('optimizer: progress message is not a final response');
}
