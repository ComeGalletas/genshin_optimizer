# 0039. The translator's golden set: 30 requests on the sample account, scored by equivalent runs

- Status: Accepted
- Date: 2026-10-05

## Context

PLAN Phase 4 asks for golden tests: natural-language requests paired with
expected specs, run against the local and cloud models, with accuracy
reported; acceptance is at least 90% exact-match with the cloud model, and
the local model's score reported. The translator (ADR-0038) checks every
spec against the owner's account, so the account the evaluation uses
decides what is expected.

Two specs can differ in their text and still mean the same thing: a
request that spells out Furina's curated set can be translated with or
without it, and `"defaults": "extend"` written out is the default.

## Decision

1. **The cases** live in `packages/server/src/llm/spec-golden.json`: 30
   requests, each with the minimal spec it should become (only what the
   request says), against the committed sample account. A fixed, public
   account makes scores comparable across models and machines and keeps
   the owner's data out of the repository. A test holds the set to its
   rules: 30 unique cases, every expected spec valid and minimal and
   fitting the sample account, every spec field used, every set rule and
   objective form covered.
2. **Two scores.** _Exact_: the model's spec equals the expected one after
   `canonicalSpec` (which drops what can't change the meaning: a written-out
   default, an empty list, a zero weight, the order of a 2+2 or of a
   character list). _Equivalent_: both map to the same run on the account
   (`runKey`: the same request, extras and pool). The headline score, and
   the one the acceptance threshold applies to, is equivalence: a spec that
   runs the same search is not a mistranslation. Exact is reported beside
   it.
3. **The run is the app's own path.** `npm run spec:eval` sends each
   request through `translateSpec`, the same prompt, tool, checks and
   retries as `POST /spec/translate`, against the model in
   `config/llm.json` or one named on the command line (`--provider`,
   `--model`). It reports per case (equivalent, exact, attempts, seconds,
   the field-by-field difference) and writes Markdown with `--out`;
   reports are kept in `docs/spec-eval/`.

4. **Claude without an API key** (`--via claude-code`). The owner has a
   Claude subscription, not an API account, and the in-app `anthropic`
   provider needs an API key. So the cloud score can also come from
   Claude Code (`claude -p`, the subscription's model): each request gets
   the app's translator prompt as the system prompt and one tool, the
   app's own `submit_spec`, served by an evaluation-only MCP server
   (`cli/spec-eval-mcp.ts`, the SDK's low-level server so neither the
   schema nor the checks change). Every submission is checked by the same
   `checkSpec` and problems come back with the same message and the same
   three-attempt cap. What differs from the app's path is the loop around
   them (Claude Code's agent loop instead of `translateRequest`, with no
   reminder after a text answer); the report names the provider
   `claude-code`, so the two are never confused.

## Consequences

- A translator or prompt change can be measured before it ships, on the
  same 30 requests, for any model the owner has.
- The set is a floor, not the whole space: it uses the sample account's
  eight characters, and phrasings a model sees here may differ from the
  owner's. Cases are added when a real request is misread.
- The cloud score can come from the Anthropic API (a key in `.env`, the
  app's exact path) or from Claude Code on the subscription (point 4).
- The golden set was written with Claude's help, and Claude scored 30/30
  on it: its phrasings may suit Claude more than independent requests
  would. Cases from the owner's real requests are the remedy.

## Rejected alternatives

- **The owner's account.** Realistic, but private, and it changes with
  every import, so scores couldn't be compared over time.
- **Exact match only.** It would count spelling out a default as a
  failure; the run is what the owner gets.
- **Equivalence only.** It hides the differences that matter for the
  summary the owner reads ("default" vs "asked"), so exact is kept as a
  second number.
