# 0013. Per-IP rate limiting on the AI explain proxy

- Status: Superseded by [0021](0021-local-first-server-architecture.md) (the proxy and its Upstash limiter were removed; the local server is localhost-only and single-user)
- Date: 2026-07-03

## Context

[ADR-0010](0010-serverless-proxy-for-ai-explain.md) added `api/explain.ts` as a
serverless proxy so the Anthropic API key stays server-side, and explicitly
rejected IP rate limiting via a KV store at the time: "more robust but adds
infrastructure; out of scope for a portfolio demo (revisit if abuse
appears)." Its cost/abuse guard was strict payload validation + a capped
`max_tokens` + a spend cap set manually in the Anthropic console.

A second-pass audit of the whole repo flagged that this leaves the endpoint's
only cost ceiling as a human noticing a spend spike after the fact — the
`content-length` guard is trivially bypassed (a missing/non-numeric header
reads as `0`), and nothing stops a scripted client from hammering the paid
call at line rate. Unlike the KV-for-rate-limiting call in ADR-0010, this
isn't speculative infrastructure for a hypothetical need — a public POST
endpoint that calls a metered API with no per-caller throttle is a live gap,
not a "revisit if abuse appears" one.

## Decision

Add a per-IP sliding-window rate limit (10 requests / 60s) in front of the
Anthropic call, using [Upstash Redis](https://upstash.com) (REST-based,
serverless-friendly — no persistent connection, fits the existing
one-function-at-a-time proxy model) via `@upstash/ratelimit` +
`@upstash/redis`.

- `api/_ratelimit.ts` — `checkRateLimit(identifier)`, called in
  `api/explain.ts` right after the method/size guards and before the
  `ANTHROPIC_API_KEY`/payload checks (cheapest rejection first).
- Identifier is `x-real-ip` (Vercel's edge sets it to the true connecting IP,
  which a client can't forge), falling back to the first `x-forwarded-for`
  address and then `'unknown'`. The leftmost `x-forwarded-for` entry is
  client-supplied and trivially spoofed to rotate buckets, so it's a
  last-resort fallback only, not the primary key.
- **Graceful no-op when unconfigured**: if `UPSTASH_REDIS_REST_URL` or
  `UPSTASH_REDIS_REST_TOKEN` is unset, `checkRateLimit` always allows the
  request (with a `console.warn`) rather than failing closed — mirrors the
  existing `ANTHROPIC_API_KEY` gate, so `vercel dev`, CI, and this repo's
  test suite need no Upstash account to keep working.
- Over the limit → `429 { error: 'rate limited' }`.

## Consequences

- Two new runtime dependencies (`@upstash/ratelimit`, `@upstash/redis`) —
  the first stateful infrastructure this client-side-only app (ADR-0001)
  depends on, scoped entirely to the existing `api/explain.ts` carve-out.
  ADR-0001's client-side architecture is otherwise unchanged.
- Deploying the rate limit requires provisioning an Upstash Redis database
  and setting its two env vars on Vercel; until then, the endpoint runs
  exactly as it did under ADR-0010 (spend-cap-only). _Superseded by the
  amendment below: this now holds outside production only. In production the
  unconfigured endpoint refuses every request rather than running
  spend-cap-only._
- The spend cap in the Anthropic console remains the hard backstop — the
  rate limit bounds request _rate_, not worst-case total spend.

## Amended 2026-08-21

A security pass tightened two points above: the graceful no-op now applies only
outside production (`VERCEL_ENV === 'production'` with the Upstash env vars
unset fails **closed**, since a dark limiter there means the paid endpoint has
no cost ceiling), and a second sliding window keyed on the fixed `'global'`
bucket (500 requests / 1 h) runs alongside the per-IP one, so worst-case spend
is bounded independent of how many IPs an attacker controls.

A follow-up pass added three further points:

- **The two windows are consumed in sequence, not in parallel.** The per-IP
  window is awaited first and short-circuits on failure, so a request already
  refused never draws from the shared global bucket. Consuming both together
  (the original `Promise.all`) meant one hostile IP could burn the endpoint's
  entire hourly allowance for every other caller while being rejected itself —
  the global cap became a denial-of-service lever instead of a spend ceiling.
- **Unconfigured-in-production is reported as `reason: 'not-configured'` and
  answered `503 { error: 'unavailable' }`**, not `429`. The refusal is a
  server-side misconfiguration, indistinguishable to the caller from the
  existing Upstash-unreachable branch; answering 429 told them to slow down
  when no amount of waiting would help. The condition is also logged
  (`console.error`, once, via the same latch as the non-production warning)
  _before_ returning, so a fail-closed deployment is diagnosable from the logs
  rather than presenting as mysterious throttling.
- **An `Origin` allowlist runs ahead of the limiter** as defence in depth — it
  is not a replacement for the counter (see the rejected alternative below),
  just a cheap way to drop cross-site callers before they spend budget. The
  allowlist is `PUBLIC_ORIGIN` (an optional override, for a custom domain) plus
  the deployment's _own_ origin, derived from `VERCEL_URL` and from the
  request's `x-forwarded-host`/`host` header. Trusting self-origin is safe: a
  cross-site attacker's browser sends the attacker's `Origin`, never ours.
  Deriving it is also necessary — same-origin POSTs still carry `Origin`, and
  each preview deployment has its own hostname, so a `PUBLIC_ORIGIN`-only list
  rejects every real browser request unless that one var is set and current.
  Localhost dev origins are trusted only when `VERCEL_ENV !== 'production'`. An
  **absent** `Origin` still passes, deliberately: non-browser clients are what
  the rate limit and global cap exist to bound, and rejecting them would be
  security theatre against anything scripted.

## Rejected alternatives

- **In-memory counter** — serverless functions are stateless and
  multi-instance; a per-instance counter doesn't bound aggregate request
  rate across instances.
- **Origin/Referer check instead of a counter** — cheaper (no new dependency)
  but trivially spoofed by a direct scripted client; doesn't bound cost the way
  a request counter does. Rejected as a _substitute_; an `Origin` allowlist was
  later added _alongside_ the counter (see the amendment above).
