# 0010. Serverless proxy for the AI "Explain this build" feature

- Status: Superseded by [0021](0021-local-first-server-architecture.md) (the proxy was removed; explain moves to the local server. The no-`VITE_`-secrets rule carries over)
- Date: 2026-06-17

## Context

The "Explain this build" feature calls the Anthropic API to turn the optimiser's
output + gap report into a short natural-language explanation. The app is a
static, client-side SPA (ADR-0001) deployed on Vercel. An API key must never
ship to the browser: any `VITE_`-prefixed variable is inlined into the public
bundle by Vite, which would leak the key to every visitor.

## Decision

- Add a single Vercel serverless function, `api/explain.ts`, that reads
  `ANTHROPIC_API_KEY` from server-side env and proxies the call. The key never
  reaches the client.
- Keep the function thin; all logic (validation, prompt building) lives in pure,
  unit-tested modules under `src/ai/` shared with the client contract.
- Model: `claude-haiku-4-5` — cheapest and fast, sufficient for a 2–3 sentence
  grounded summary.
- Cost/abuse guard ("Lightweight"): strict `parseExplainPayload` validation +
  `max_tokens: 200` + a spend cap set manually in the Anthropic console. No KV /
  rate-limiting infrastructure.
- No PII is sent: only character key, objective, the build's stat totals, and the
  gap-report strings. No UID, inventory, or share data.
- Graceful degradation: a build-time `VITE_AI_ENABLED` flag gates the button so
  nothing AI-related renders until the key is deployed; runtime failures show an
  inline retry message.

## Consequences

- Local AI testing requires `vercel dev` (plain Vite does not serve `/api`).
- The hard cost ceiling depends on the manually-set console spend cap.
- `vercel.json` excludes `/api` from the SPA rewrite so the function is reachable.

## Rejected alternatives

- **`VITE_ANTHROPIC_API_KEY` in the client** — leaks the key in the public
  bundle. Non-starter.
- **IP rate limiting via Vercel KV** — more robust but adds infrastructure;
  out of scope for a portfolio demo (revisit if abuse appears). _Revisited
  and adopted (via Upstash, not Vercel KV) in
  [ADR-0013](0013-rate-limit-ai-proxy.md)._
