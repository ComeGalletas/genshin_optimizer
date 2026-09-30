/**
 * Whether the local server is running, as app state (TODO 3.5). The app
 * checks on start and whenever the tab regains focus, so starting
 * `npm run server` later is noticed without a reload. Not persisted: a
 * stale "online" would show features that can't work.
 * @packageDocumentation
 */

import { create } from 'zustand';
import { probeServer, type LlmInfo } from './client';

export interface ServerStatus {
  /** `checking` only before the first answer; later re-checks keep the
   *  last known state, so the server-only features don't flicker. */
  status: 'checking' | 'online' | 'offline';
  llm: LlmInfo | null;
  /** Why it's offline, for the status chip's tooltip. */
  reason?: string;
  check: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useServer = create<ServerStatus>()((set) => ({
  status: 'checking',
  llm: null,
  check: () =>
    (inflight ??= probeServer()
      .then((p) =>
        set(
          p.online
            ? { status: 'online', llm: p.llm, reason: undefined }
            : { status: 'offline', llm: null, reason: p.reason },
        ),
      )
      .finally(() => {
        inflight = null;
      })),
}));

/** Explain needs the server and a model that is ready. */
export const selectExplainReady = (s: ServerStatus) =>
  s.status === 'online' && s.llm?.ready === true;
