/**
 * The client side of the AI-explain feature: the fetch call to the
 * serverless `/api/explain` proxy and the request/response shapes it shares
 * with that proxy.
 * @packageDocumentation
 */

import type { ExplainPayload } from './explainShared';

/** Calls the serverless proxy. Throws on transport or shape errors. */
export async function explainBuild(payload: ExplainPayload): Promise<string> {
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`explain failed: ${res.status}`);
  const data = (await res.json()) as { explanation?: unknown };
  if (typeof data.explanation !== 'string')
    throw new Error('explain: malformed response');
  return data.explanation;
}
