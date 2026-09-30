# 0033. LLM provider client: one neutral chat shape over plain fetch, explain on the server

- Status: Accepted
- Date: 2026-09-30

## Context

ADR-0032 decides which model the server uses (`config/llm.json`, keys in
`.env`). Phase 3 still needs the client that talks to it: "Explain this
build" (TODO 3.4) and the chat panel's tool loop (3.6) both call the model,
and the Phase 3 acceptance compares a cloud model with a local one on the
same question, so switching providers must not change either feature.
ADR-0021 §5 moves explain from the fork's serverless proxy (ADR-0010) to
the server, reusing the web app's payload validation and prompt shaping.

The three providers differ in the details that matter for tools. The first
real run against Ollama 0.35.0 with `qwen3:8b` (TODO 3.3) showed some of
them: Ollama returns tool-call arguments as an object where
OpenAI-compatible servers send a JSON string; qwen3 reasons before every
answer unless told not to (360 tokens for one sentence); Ollama may omit
tool-call ids. Anthropic wants tool results as `tool_result` blocks in a
user turn, all results for one assistant turn in the same one.

## Decision

1. **One neutral shape.** `packages/server/src/llm/client.ts` exposes
   `createLlmClient(config).chat({ system, messages, tools, maxOutputTokens })`
   returning `{ text, toolCalls, stop, usage }`. Messages are `user`,
   `assistant` (with `toolCalls`) and `tool` (a result for a call id);
   tools are `{ name, description, parameters }` with a JSON Schema. Each
   provider adapter translates both ways; nothing above it knows which
   provider answered. `stop` is `tool_calls`, `max_tokens` or `end`.
2. **Plain `fetch`, no SDKs.** Three small JSON endpoints (Ollama
   `/api/chat`, OpenAI-compatible `/chat/completions`, Anthropic
   `/v1/messages`) don't justify three dependencies, and tests replace
   `fetch` the same way the ADR-0032 check does. No streaming yet: explain
   answers in under a second warm, and 3.6 can add it if the chat needs it.
3. **Normalized at the edge:** arguments parsed to an object (a string
   that isn't JSON, or a non-object, is the model's error, reported as
   such); missing ids numbered; inline `<think>` blocks removed from the
   text; Ollama always gets `think: false` (checked to be harmless on a
   model without thinking, llama3.1). Anthropic's required `max_tokens`
   defaults to 1024 when neither the call nor the config sets it.
4. **Failures are typed, readable and keyless.** `LlmError` has a kind
   (`not_ready`, `unreachable`, `timeout`, `auth`, `no_model`, `upstream`,
   `bad_response`) and a message a person can act on (which variable to
   check, the `ollama pull` to run, the `timeoutMs` to raise). The key
   travels only in a request header. A config that isn't ready still makes
   a client whose every call fails with the reason, without a request. The
   API answers 503 for `not_ready`, 504 for `timeout` and 502 for the
   rest, with the code `llm_<kind>`.
5. **Explain on the server.** The payload validation and prompt shaping
   move from `packages/web/src/ai/explainShared.ts` to the engine
   (`packages/engine/src/explain/explain.ts`, pure), so the server and the
   web client share one definition. `POST /explain` refuses a body over
   16 KB before parsing and an invalid payload before any prompt is built,
   then makes one call capped at 400 output tokens (the fork's proxy used
   200 for Claude Haiku; local models are wordier) and returns
   `{ explanation, provider, model }`. An empty answer is an error, not an
   empty explanation. The web app starts calling it in 3.5.

## Consequences

- 3.6's tool loop only has to run tools and append messages; the provider
  quirks are handled once, in tested adapters.
- Adding a provider is one adapter and its tests, plus a `config.ts`
  default.
- Explain still sends the web app's numbers, not the server's. A
  server-side "explain my character" that computes them from the current
  account can reuse the same prompt.
- The Phase 3 line "ADR: MCP tool surface and LLM provider abstraction" is
  covered by ADR-0031 (the tools), ADR-0032 (the config) and this one.

## Rejected alternatives

- **The providers' SDKs** (`@anthropic-ai/sdk`, `openai`, `ollama`). Three
  dependencies and three error models for what is one POST each; the
  OpenAI SDK against Ollama's compatible endpoint would also lose
  `think: false`.
- **Ollama through its OpenAI-compatible endpoint only.** One adapter
  fewer, but no way to turn reasoning off, and less precise errors.
- **Keeping the prompt code in `web` and importing it from the server.**
  The server would depend on the React package; the code is pure and
  belongs in the engine.
