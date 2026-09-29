/**
 * Is the configured model there? (TODO 3.3.) Asks the provider with a call
 * that lists or describes models, which costs nothing: Ollama's
 * `/api/tags`, an OpenAI-compatible server's `/models`, Anthropic's
 * `/v1/models/{model}`. The key goes in a header and never in the result.
 * @packageDocumentation
 */

import type { LlmConfig } from './config';

export interface LlmCheck {
  ok: boolean;
  /** One line for a person. */
  detail: string;
  /** Models the provider offers, where it lists them (a few, for hints). */
  available?: string[];
}

type Fetch = typeof fetch;

async function getJson(
  f: Fetch,
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const r = await f(url, { headers, signal: AbortSignal.timeout(10_000) });
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    // not JSON: status alone says enough
  }
  return { status: r.status, body };
}

const hint = (names: string[]) => names.slice(0, 8);

export async function checkLlm(
  c: LlmConfig,
  f: Fetch = fetch,
): Promise<LlmCheck> {
  if (c.notReady) return { ok: false, detail: c.notReady };
  try {
    if (c.provider === 'ollama') {
      const { status, body } = await getJson(f, `${c.baseUrl}/api/tags`, {});
      if (status !== 200)
        return {
          ok: false,
          detail: `Ollama at ${c.baseUrl} answered ${status}`,
        };
      const names = (
        (body as { models?: { name: string }[] })?.models ?? []
      ).map((m) => m.name);
      const want = c.model.includes(':') ? c.model : `${c.model}:latest`;
      return names.includes(want) || names.includes(c.model)
        ? { ok: true, detail: `Ollama has ${c.model}` }
        : {
            ok: false,
            detail: `Ollama at ${c.baseUrl} doesn't have ${c.model}; run \`ollama pull ${c.model}\``,
            available: hint(names),
          };
    }
    if (c.provider === 'openai_compatible') {
      const { status, body } = await getJson(f, `${c.baseUrl}/models`, {
        ...(c.apiKey && { authorization: `Bearer ${c.apiKey}` }),
      });
      if (status === 401 || status === 403)
        return {
          ok: false,
          detail: `${c.baseUrl} refused the key (${status}); check ${c.keyVar}`,
        };
      if (status !== 200)
        return { ok: false, detail: `${c.baseUrl}/models answered ${status}` };
      const ids = ((body as { data?: { id: string }[] })?.data ?? []).map(
        (m) => m.id,
      );
      return ids.includes(c.model)
        ? { ok: true, detail: `${c.baseUrl} serves ${c.model}` }
        : {
            ok: false,
            detail: `${c.baseUrl} doesn't list ${c.model}`,
            available: hint(ids),
          };
    }
    // anthropic
    const { status } = await getJson(
      f,
      `${c.baseUrl}/v1/models/${encodeURIComponent(c.model)}`,
      { 'x-api-key': c.apiKey!, 'anthropic-version': '2023-06-01' },
    );
    if (status === 200) return { ok: true, detail: `Anthropic has ${c.model}` };
    if (status === 401 || status === 403)
      return {
        ok: false,
        detail: `Anthropic refused the key (${status}); check ${c.keyVar}`,
      };
    if (status === 404)
      return { ok: false, detail: `Anthropic has no model "${c.model}"` };
    return { ok: false, detail: `Anthropic answered ${status}` };
  } catch (e) {
    return {
      ok: false,
      detail: `can't reach ${c.baseUrl}: ${(e as Error).message}`,
    };
  }
}
