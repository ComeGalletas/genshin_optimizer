# 0038. From words to a run: a tool-call translator, an "I understood" summary, and specs everywhere a model optimizes

- Status: Accepted
- Date: 2026-10-05
- Amends: [0031](0031-mcp-tool-surface.md)

## Context

ADR-0036 defines the `ConstraintSpec` and ADR-0037 runs it. PLAN Phase 4
asks for the last step: an LLM turns a natural-language request into a
spec, the spec is validated, and the owner sees a readable summary ("I
understood: …") before anything runs. The MCP tool `optimize_build`
(ADR-0031) still took the old request shape, whose constraints replace the
curated defaults; that is what made the Phase 3 acceptance question time
out for the local model.

## Decision

1. **The translator calls a tool.** `packages/server/src/llm/translate.ts`
   gives the configured model one tool, `submit_spec`, whose parameters are
   the spec's own JSON Schema (from the engine's zod/mini schema; `version`
   left out). Tool calling is what local and cloud models do most
   reliably (Phase 3), and it returns structured arguments on every
   provider. The prompt explains the conventions (extend the defaults,
   percent units, which phrase maps to which field) and lists the
   character and set keys.
2. **Every submission is checked, and every problem goes back at once.**
   The spec checks and the account mapping (no weapon to use, an artifact
   id that isn't there) both run on each submission; their issues go back
   to the model as the tool result, all together, for up to three
   attempts. Messages point the model the right way where it predictably
   goes wrong: an unknown weapon says to leave `weapon` out, a character
   key among artifact ids points to `keepEquippedOn`. A model that never
   gets it right yields a 422 with the last issues, and nothing runs.
3. **"I understood".** `describeRun` (engine, pure) writes the run in
   plain words, each condition marked as asked or as the character's
   default: "I understood: build Furina (…) for average damage
   (estimated; default), with 4-piece Golden Troupe (default); …; Energy
   Recharge at least 180%."
4. **Three routes.** `POST /spec/translate` (words → checked spec and
   summary, nothing run), `POST /spec/check` (spec → summary, nothing
   run) and `POST /spec/run` (checked, mapped, searched). A bad spec is a
   400 `invalid_spec` carrying every issue with its path.
5. **`optimize_build` takes a spec** (amends ADR-0031), for MCP clients
   and the chat alike: the client's own model is the translator there,
   and the result carries `understood`, which the tool instructions tell
   the model to say first. An infeasible run carries `why`: a main stat no
   owned piece has, a floor provably out of reach (with the most this
   spec can reach), or, when no single condition is to blame, what to
   relax. The chat now checks tool arguments strictly, so an invented
   argument is reported rather than dropped; MCP clients go through the
   SDK's own validation.

## Consequences

- The Phase 3 question now runs in a fraction of a second for the local
  model (the spec keeps the defaults), and an infeasible answer comes with
  what to change instead of a bare "infeasible".
- The REST `POST /optimize` keeps its old request shape for API callers;
  models use specs.
- 4.4's golden set measures the translator against fixed expected specs;
  4.5 asserts that no invalid spec reaches the optimizer, on every path.
- The web app doesn't call the translator yet: the chat covers requests in
  words, and a "describe the build you want" box can use
  `/spec/translate` and `/spec/run` when the UI phase (8) builds one.

## Rejected alternatives

- **Free-text JSON output** ("answer with only the JSON"). Models wrap it
  in prose or code fences, and Ollama's JSON mode doesn't follow a schema;
  a tool call is structured on every provider.
- **Repairing near-misses silently** (unwrapping `{ "spec": … }`,
  mapping a character in `excludeArtifacts` to `keepEquippedOn`).
  ADR-0022 forbids it: the model is told, and fixes it on the next try.
- **Running first and summarising after.** A misread request would spend
  a search, and on a large account minutes, before the owner could see
  the misreading.
