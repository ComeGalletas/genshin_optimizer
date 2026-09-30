/**
 * "Explain this build" on the server (TODO 3.4, ADR-0033): the engine's
 * prompt shaping, one call to the configured model, and the answer. The
 * payload is validated before any prompt is built.
 * @packageDocumentation
 */

import {
  buildExplainPrompt,
  type ExplainPayload,
} from '@genshin-build-lab/engine/explain/explain';
import { LlmError, type LlmClient } from './client';

/** The prompt asks for 2–3 sentences; this caps what a runaway reply costs.
 *  The fork's proxy used 200 for Claude Haiku; local models are wordier. */
export const EXPLAIN_MAX_OUTPUT_TOKENS = 400;

export interface Explanation {
  explanation: string;
  provider: string;
  model: string;
}

export async function explainBuild(
  client: LlmClient,
  payload: ExplainPayload,
): Promise<Explanation> {
  const { system, user } = buildExplainPrompt(payload);
  const r = await client.chat({
    system,
    messages: [{ role: 'user', content: user }],
    maxOutputTokens: EXPLAIN_MAX_OUTPUT_TOKENS,
  });
  if (!r.text)
    throw new LlmError(
      'bad_response',
      r.stop === 'max_tokens'
        ? `${client.model} used its whole output budget without an answer`
        : `${client.model} returned no text`,
    );
  return {
    explanation: r.text,
    provider: client.provider,
    model: client.model,
  };
}
