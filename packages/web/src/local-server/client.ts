/**
 * The web app's side of the local server (TODO 3.5, ADR-0034): where it is,
 * whether it's running, and the few calls the app makes to it. Everything
 * here is optional by design (ADR-0021 §3): when the server isn't running
 * the app works client-only, and these calls fail with a message a person
 * can read.
 * @packageDocumentation
 */

import { isRecord } from '@genshin-build-lab/engine/json';

/** `npm run server` listens on 127.0.0.1:5198 (ADR-0030). An IP, not
 *  `localhost`, so the browser never tries `::1` first. Not a secret:
 *  `VITE_SERVER_URL` only moves it. */
export const SERVER_URL = (
  import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:5198'
).replace(/\/+$/, '');

/** A failed call, with the server's own message when it sent one. */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** The caller stopped waiting (its `signal`): not a failure to report. */
export class RequestStopped extends ServerError {
  constructor() {
    super('stopped');
  }
}

/** A running server answers `/health` in milliseconds; waiting longer only
 *  delays the client-only fallback. */
export const PROBE_TIMEOUT_MS = 2_000;

/** What a reply that isn't JSON, or isn't the shape asked for, says. */
export const UNREADABLE_REPLY =
  'the local server sent a reply this app can’t read';

// The engine's object guard, re-exported for the client calls' checks.
export { isRecord };

/** An object whose named fields are arrays: the least its reader needs. */
export const withArrays =
  (...keys: string[]) =>
  (x: unknown): x is Record<string, unknown> =>
    isRecord(x) && keys.every((k) => Array.isArray(x[k]));

/** Call the server and return its JSON, or throw a `ServerError`
 *  (`RequestStopped` when the caller's `signal` stopped it). A reply that
 *  isn't JSON, or fails `expect` (the top-level shape the caller reads),
 *  is an error too: a view never renders a reply it can't read. */
export async function serverJson<T>(
  path: string,
  init: RequestInit & {
    timeoutMs?: number;
    expect?: (body: unknown) => boolean;
  } = {},
): Promise<T> {
  const { timeoutMs = PROBE_TIMEOUT_MS, signal, expect, ...rest } = init;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const stop = () => abort.abort();
  if (signal?.aborted) stop();
  signal?.addEventListener('abort', stop);
  let r: Response;
  try {
    r = await fetch(`${SERVER_URL}${path}`, { ...rest, signal: abort.signal });
  } catch {
    if (signal?.aborted) throw new RequestStopped();
    throw new ServerError(
      abort.signal.aborted
        ? `the local server didn't answer within ${timeoutMs / 1000} s`
        : `the local server isn't reachable at ${SERVER_URL}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
  let body: unknown = null;
  let json = true;
  try {
    body = await r.json();
  } catch {
    // Not JSON: on an error the status says enough; on success it's unreadable.
    json = false;
  }
  if (!r.ok) {
    const said = (body as { message?: unknown } | null)?.message;
    throw new ServerError(
      typeof said === 'string' && said
        ? said
        : `the local server answered ${r.status}`,
      r.status,
    );
  }
  if (!json || (expect && !expect(body)))
    throw new ServerError(UNREADABLE_REPLY, r.status);
  return body as T;
}

/** What `GET /llm` says about the configured model (never the key). */
export interface LlmInfo {
  provider: string;
  model: string;
  ready: boolean;
  notReady?: string;
}

export type ServerProbe =
  | { online: true; gameVersion?: string; llm: LlmInfo | null }
  | { online: false; reason: string };

/** Is the server running, and is its model usable? */
export async function probeServer(): Promise<ServerProbe> {
  let health: { ok?: boolean; gameVersion?: string };
  try {
    health = await serverJson('/health');
  } catch (e) {
    return { online: false, reason: (e as Error).message };
  }
  if (health?.ok !== true)
    return { online: false, reason: 'the local server is not healthy' };
  let llm: LlmInfo | null = null;
  try {
    llm = await serverJson<LlmInfo>('/llm', {
      expect: (x) =>
        isRecord(x) &&
        typeof x.provider === 'string' &&
        typeof x.model === 'string' &&
        typeof x.ready === 'boolean',
    });
  } catch {
    // 404: no model configured; the rest of the server still works
  }
  return {
    online: true,
    ...(health.gameVersion && { gameVersion: health.gameVersion }),
    llm,
  };
}

/** The server's merged account as a GOOD file (`GET /account/good`), for
 *  the same import path as an uploaded file. */
export function fetchServerAccount(): Promise<unknown> {
  // A large account is a few MB of JSON; allow for a busy server.
  return serverJson('/account/good', { timeoutMs: 30_000 });
}
