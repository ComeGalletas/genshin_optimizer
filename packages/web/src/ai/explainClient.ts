/**
 * The client side of the AI-explain feature: sends the engine's explain
 * payload to the local server's `POST /explain` (TODO 3.5, ADR-0033), which
 * asks whichever model `config/llm.json` selects.
 * @packageDocumentation
 */

import type { ExplainPayload } from '@genshin-build-lab/engine/explain/explain';
import { isRecord, serverJson } from '../local-server/client';

/** The server waits up to its model's `timeoutMs` (120 s by default); a cold
 *  local model can take most of that on the first call. */
const EXPLAIN_TIMEOUT_MS = 130_000;

/** Calls `POST /explain`. Throws a `ServerError` with a readable message on
 *  transport, server or model errors, and on a malformed reply. */
export async function explainBuild(payload: ExplainPayload): Promise<string> {
  const data = await serverJson<{ explanation: string }>('/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: EXPLAIN_TIMEOUT_MS,
    expect: (x) => isRecord(x) && typeof x.explanation === 'string',
  });
  return data.explanation;
}
