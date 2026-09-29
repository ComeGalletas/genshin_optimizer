# 0032. Language model configuration: one committed file, keys only in the server's environment

- Status: Accepted
- Date: 2026-09-29

## Context

Phase 3's LLM features (explain, 3.4; chat, 3.6) need a model. CLAUDE.md
names `config/llm.json` with `provider` (`ollama` | `anthropic` |
`openai_compatible`), `baseUrl` and `model`, Ollama on
`http://localhost:11434` by default, and API keys only in the server's
`.env`, never in the client bundle (ADR-0021 §4). The repository is public,
so a key in any committed file leaks.

## Decision

1. **`config/llm.json`, committed,** selects one provider and model:
   `provider`, `model`, and optionally `baseUrl`, `temperature`,
   `maxOutputTokens`, `timeoutMs` (default 120 s). It ships as Ollama with
   `qwen3:8b` (a local model with tool calling); the owner edits it to
   switch. Examples:
   - `{ "provider": "anthropic", "model": "claude-sonnet-5" }`
   - `{ "provider": "openai_compatible", "model": "<id>", "baseUrl": "http://localhost:1234/v1" }`
2. **Keys come from the server's environment only:** `ANTHROPIC_API_KEY`
   (required for `anthropic`) and `OPENAI_API_KEY` (optional for
   `openai_compatible`; local servers don't check one), read from
   `.env.local` then `.env` at the repository root (both git-ignored) by the
   server's entry points. Variables already set win.
3. **The loader** (`packages/server/src/llm/config.ts`) checks the file with
   zod, refuses any field that looks like a secret (`key`, `token`,
   `secret`, `password`) with "API keys go in .env", and fills provider
   defaults (base URLs, which variable holds the key). A missing required
   key doesn't stop the server: the config is marked not ready, with the
   reason, and only LLM features are affected. A malformed file does stop
   `npm run server`, with the reason.
4. **Nothing returns the key.** `describeLlm` (used by `GET /llm` and
   `npm run llm:check`) says only whether it is set.
5. **`npm run llm:check`** asks the provider, with a call that costs
   nothing, whether the model exists: Ollama's `/api/tags` (with the
   `ollama pull` command to run if it's missing), an OpenAI-compatible
   `/models`, Anthropic's `/v1/models/{model}` (the key in a header).

## Consequences

- The LLM client (3.4) reads a resolved `LlmConfig` and never touches files
  or the environment itself.
- Switching models is an edit to one committed file, reviewed like any
  other change; switching accounts or keys never is.
- Phase 3's acceptance compares a cloud model with a local one: the
  owner switches `config/llm.json` between the two runs.

## Rejected alternatives

- **Keys in `config/llm.json`, git-ignored.** One file for both would make
  a committed key one `git add -f` away; the loader's refusal keeps the
  two apart.
- **Several named profiles in one file.** More to validate for a
  single-user app; one active config plus the examples above is enough.
- **Call the model to check it** (a tiny completion). Costs tokens on
  cloud providers; the model-listing endpoints answer the same question
  for free.
