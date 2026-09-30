/**
 * The language model client (TODO 3.4, ADR-0033): one `chat` call, with
 * optional tools, over the three providers `config/llm.json` can name.
 * Each provider's wire format is translated to and from one neutral shape,
 * so explain (3.4) and the chat tool loop (3.6) never see a provider.
 *
 * Plain `fetch`, no SDKs: three small JSON APIs, and tests swap in a fake
 * `fetch`. The key goes in a header and never into a result or an error.
 * @packageDocumentation
 */

import type { LlmConfig, LlmProvider } from './config';

/** A tool the model may call; `parameters` is a JSON Schema object. */
export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  /** The provider's id, or one made up where it gives none (Ollama). */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatRequest {
  system?: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  /** Overrides the config's `maxOutputTokens` for this call. */
  maxOutputTokens?: number;
}

export interface ChatResponse {
  /** The answer, trimmed, with any `<think>` block removed. */
  text: string;
  toolCalls: ToolCall[];
  /** `tool_calls`: run them and call again. `max_tokens`: cut short. */
  stop: 'end' | 'tool_calls' | 'max_tokens';
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type LlmErrorKind =
  | 'not_ready'
  | 'unreachable'
  | 'timeout'
  | 'auth'
  | 'no_model'
  | 'upstream'
  | 'bad_response';

/** A failed call, with a message for a person. Never carries the key. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface LlmClient {
  readonly provider: LlmProvider;
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

type Fetch = typeof fetch;

/** Anthropic requires `max_tokens`; this is used when nothing sets it. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/** Qwen3 and other reasoning models may put their reasoning inline. */
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;
const cleanText = (s: unknown) =>
  typeof s === 'string' ? s.replace(THINK_BLOCK, '').trim() : '';

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Tool arguments arrive as an object (Ollama, Anthropic) or as a JSON
 *  string (OpenAI-compatible). Anything else is the model's mistake. */
function parseArguments(raw: unknown, name: string): Record<string, unknown> {
  let v = raw ?? {};
  if (typeof v === 'string') {
    try {
      v = v.trim() ? JSON.parse(v) : {};
    } catch {
      throw new LlmError(
        'bad_response',
        `the model called ${name} with arguments that aren't JSON`,
      );
    }
  }
  if (!isObject(v))
    throw new LlmError(
      'bad_response',
      `the model called ${name} with arguments that aren't an object`,
    );
  return v;
}

/** The first readable error message in an error body, shortened. */
function upstreamMessage(body: unknown): string | undefined {
  const e = isObject(body) ? body.error : undefined;
  const m = typeof e === 'string' ? e : isObject(e) ? e.message : undefined;
  return typeof m === 'string' && m ? m.slice(0, 300) : undefined;
}

/** POST JSON and return the parsed body, or throw an `LlmError` saying
 *  what went wrong in terms a person can act on. */
async function postJson(
  f: Fetch,
  c: LlmConfig,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let r: Response;
  try {
    r = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(c.timeoutMs),
    });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new LlmError(
        'timeout',
        `${c.model} didn't answer within ${c.timeoutMs / 1000} s (timeoutMs in config/llm.json)`,
      );
    throw new LlmError(
      'unreachable',
      `can't reach ${c.baseUrl}: ${(e as Error).message}`,
    );
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    // not JSON: the status says enough
  }
  if (r.ok) return json;
  const said = upstreamMessage(json);
  const detail = said ? `: ${said}` : '';
  if (r.status === 401 || r.status === 403)
    throw new LlmError(
      'auth',
      `${c.baseUrl} refused the key (${r.status})${c.keyVar ? `; check ${c.keyVar}` : ''}`,
    );
  if (r.status === 404)
    throw new LlmError(
      'no_model',
      `${c.baseUrl} has no model ${c.model}${detail}` +
        (c.provider === 'ollama' ? `; run \`ollama pull ${c.model}\`` : ''),
    );
  throw new LlmError('upstream', `${c.baseUrl} answered ${r.status}${detail}`);
}

function badShape(c: LlmConfig): never {
  throw new LlmError(
    'bad_response',
    `${c.baseUrl} sent a reply this client can't read`,
  );
}

// ---- Ollama: POST /api/chat --------------------------------------------------

async function chatOllama(
  f: Fetch,
  c: LlmConfig,
  req: ChatRequest,
): Promise<ChatResponse> {
  const messages: unknown[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  for (const m of req.messages)
    if (m.role === 'tool')
      messages.push({ role: 'tool', tool_name: m.name, content: m.content });
    else if (m.role === 'assistant' && m.toolCalls?.length)
      messages.push({
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((t) => ({
          function: { name: t.name, arguments: t.arguments },
        })),
      });
    else messages.push({ role: m.role, content: m.content });
  const maxTokens = req.maxOutputTokens ?? c.maxOutputTokens;
  const options = {
    ...(c.temperature !== undefined && { temperature: c.temperature }),
    ...(maxTokens !== undefined && { num_predict: maxTokens }),
  };
  const body = await postJson(
    f,
    c,
    `${c.baseUrl}/api/chat`,
    {},
    {
      model: c.model,
      messages,
      stream: false,
      // Reasoning models (qwen3) otherwise think first: hundreds of tokens
      // for a two-sentence answer. Harmless for models that can't think.
      think: false,
      ...(req.tools?.length && {
        tools: req.tools.map((t) => ({ type: 'function', function: t })),
      }),
      ...(Object.keys(options).length && { options }),
    },
  );
  if (!isObject(body) || !isObject(body.message)) badShape(c);
  const msg = body.message;
  const raw = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  const toolCalls = raw.map((t: unknown, i): ToolCall => {
    const fn = isObject(t) && isObject(t.function) ? t.function : undefined;
    if (!fn || typeof fn.name !== 'string') badShape(c);
    return {
      id: isObject(t) && typeof t.id === 'string' ? t.id : `call_${i}`,
      name: fn.name,
      arguments: parseArguments(fn.arguments, fn.name),
    };
  });
  return {
    text: cleanText(msg.content),
    toolCalls,
    stop: toolCalls.length
      ? 'tool_calls'
      : body.done_reason === 'length'
        ? 'max_tokens'
        : 'end',
    usage: {
      ...(typeof body.prompt_eval_count === 'number' && {
        inputTokens: body.prompt_eval_count,
      }),
      ...(typeof body.eval_count === 'number' && {
        outputTokens: body.eval_count,
      }),
    },
  };
}

// ---- OpenAI-compatible: POST /chat/completions ------------------------------

async function chatOpenAi(
  f: Fetch,
  c: LlmConfig,
  req: ChatRequest,
): Promise<ChatResponse> {
  const messages: unknown[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  for (const m of req.messages)
    if (m.role === 'tool')
      messages.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content,
      });
    else if (m.role === 'assistant' && m.toolCalls?.length)
      messages.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.arguments) },
        })),
      });
    else messages.push({ role: m.role, content: m.content });
  const maxTokens = req.maxOutputTokens ?? c.maxOutputTokens;
  const body = await postJson(
    f,
    c,
    `${c.baseUrl}/chat/completions`,
    c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {},
    {
      model: c.model,
      messages,
      ...(req.tools?.length && {
        tools: req.tools.map((t) => ({ type: 'function', function: t })),
      }),
      ...(c.temperature !== undefined && { temperature: c.temperature }),
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
    },
  );
  const choice =
    isObject(body) && Array.isArray(body.choices) ? body.choices[0] : undefined;
  if (!isObject(choice) || !isObject(choice.message)) badShape(c);
  const msg = choice.message;
  const raw = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  const toolCalls = raw.map((t: unknown, i): ToolCall => {
    const fn = isObject(t) && isObject(t.function) ? t.function : undefined;
    if (!fn || typeof fn.name !== 'string') badShape(c);
    return {
      id: isObject(t) && typeof t.id === 'string' ? t.id : `call_${i}`,
      name: fn.name,
      arguments: parseArguments(fn.arguments, fn.name),
    };
  });
  const usage = isObject(body) && isObject(body.usage) ? body.usage : {};
  return {
    text: cleanText(msg.content),
    toolCalls,
    stop: toolCalls.length
      ? 'tool_calls'
      : choice.finish_reason === 'length'
        ? 'max_tokens'
        : 'end',
    usage: {
      ...(typeof usage.prompt_tokens === 'number' && {
        inputTokens: usage.prompt_tokens,
      }),
      ...(typeof usage.completion_tokens === 'number' && {
        outputTokens: usage.completion_tokens,
      }),
    },
  };
}

// ---- Anthropic: POST /v1/messages -------------------------------------------

async function chatAnthropic(
  f: Fetch,
  c: LlmConfig,
  req: ChatRequest,
): Promise<ChatResponse> {
  // Tool results go back as `tool_result` blocks in a user turn, and all the
  // results for one assistant turn must share that user turn.
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [];
  for (const m of req.messages) {
    if (m.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
      };
      const last = messages.at(-1);
      if (
        last?.role === 'user' &&
        Array.isArray(last.content) &&
        last.content.every(
          (b) =>
            isObject(b) && (b as { type?: unknown }).type === 'tool_result',
        )
      )
        last.content.push(block);
      else messages.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant' && m.toolCalls?.length)
      messages.push({
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.toolCalls.map((t) => ({
            type: 'tool_use',
            id: t.id,
            name: t.name,
            input: t.arguments,
          })),
        ],
      });
    else messages.push({ role: m.role, content: m.content });
  }
  const body = await postJson(
    f,
    c,
    `${c.baseUrl}/v1/messages`,
    { 'x-api-key': c.apiKey ?? '', 'anthropic-version': '2023-06-01' },
    {
      model: c.model,
      max_tokens:
        req.maxOutputTokens ?? c.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      ...(req.system && { system: req.system }),
      messages,
      ...(req.tools?.length && {
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
      }),
      ...(c.temperature !== undefined && { temperature: c.temperature }),
    },
  );
  if (!isObject(body) || !Array.isArray(body.content)) badShape(c);
  const blocks = body.content.filter(isObject);
  const toolCalls = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b): ToolCall => {
      if (typeof b.id !== 'string' || typeof b.name !== 'string') badShape(c);
      return {
        id: b.id,
        name: b.name,
        arguments: parseArguments(b.input, b.name),
      };
    });
  const text = cleanText(
    blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(''),
  );
  const usage = isObject(body.usage) ? body.usage : {};
  return {
    text,
    toolCalls,
    stop: toolCalls.length
      ? 'tool_calls'
      : body.stop_reason === 'max_tokens'
        ? 'max_tokens'
        : 'end',
    usage: {
      ...(typeof usage.input_tokens === 'number' && {
        inputTokens: usage.input_tokens,
      }),
      ...(typeof usage.output_tokens === 'number' && {
        outputTokens: usage.output_tokens,
      }),
    },
  };
}

const CHAT = {
  ollama: chatOllama,
  openai_compatible: chatOpenAi,
  anthropic: chatAnthropic,
} satisfies Record<LlmProvider, unknown>;

/** A client for a resolved config. A config that isn't ready (a missing
 *  key) still gives a client; every call fails with the reason. */
export function createLlmClient(c: LlmConfig, f: Fetch = fetch): LlmClient {
  return {
    provider: c.provider,
    model: c.model,
    async chat(req) {
      if (c.notReady) throw new LlmError('not_ready', c.notReady);
      return CHAT[c.provider](f, c, req);
    },
  };
}
