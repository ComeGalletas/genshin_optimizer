# 0031. MCP tool surface: one service layer, compact results, no dead tools

- Status: Accepted; amended by [0038](0038-spec-translator.md) (`optimize_build` takes a ConstraintSpec)
- Date: 2026-09-28

## Context

PLAN Phase 3 exposes the engine to LLMs over MCP (official TypeScript SDK),
on stdio for Claude Desktop and Claude Code and on streamable HTTP, with
tools for the account, the optimizer and the imports. CLAUDE.md's third
principle applies to all of it: the model is the interface, every number in
an answer comes from a tool result, and a failed tool is reported, never
estimated. The HTTP API (ADR-0030) answers the same questions for the web
app. ADR-0022 says tool inputs are zod schemas.

## Decision

1. **One service layer.** `packages/server/src/api/services.ts` answers
   everything; the HTTP routes and the MCP tools are thin adapters over it,
   and both take the same zod schemas (`api/schemas.ts`) as input. A
   problem the schema can't see is a `ServiceError` with a status, a code
   and a message naming it.
2. **Tools** (`packages/server/src/mcp/server.ts`), all read-only:
   `get_account_summary`, `list_characters`, `get_character`,
   `query_artifacts`, `optimize_build`, `compare_builds`,
   `get_import_report`. `optimize_build` takes the API's optimize body
   (constraints in the engine's shape) until Phase 4's `ConstraintSpec`
   replaces it. `simulate_team` and `allocate_team` are registered when
   Phases 5 and 7 build them, not before: a tool that always fails costs
   the model a turn and invites it to guess.
3. **Results are compact JSON objects**, in both the text content and
   `structuredContent` (MCP requires an object there, never an array):
   stats rounded to one decimal, artifacts as id, set, slot, level, main
   stat and substats, lists capped (`query_artifacts`: 30 by default, 200
   at most, with the total). The model reads every token.
4. **Errors are tool errors** (`isError`, `code: message`) the model can
   read and act on; invalid input is rejected by the schema before any tool
   code runs.
5. **Server instructions** tell the model the ground rules: numbers only
   from tool results, percent units, dataset keys, and that exact searches
   can take tens of seconds.
6. **Transports:** stdio (`npm run mcp`; stdout carries the protocol, so
   diagnostics go to stderr) and streamable HTTP at `POST /mcp` on the
   local server, stateless (a server and transport per request, JSON
   responses) and behind the same localhost Host and Origin guards as the
   rest of the API. `GET` and `DELETE /mcp` answer 405.
7. **Output schemas wait for Phase 4.** Inputs come from zod now; the
   result shapes are documented in each tool's description, and get zod
   output schemas once `ConstraintSpec` settles what optimize returns.

## Consequences

- On the owner's store, over stdio with the official client: every tool
  answers in 6–30 ms except `optimize_build` (1.5 s for Furina over
  unequipped pieces), and `compare_builds` works directly on the ids the
  other tools return. The same tools answer over HTTP.
- The REST API gains `POST /artifacts/query`, `POST /compare` and
  `GET /imports/report`, the same operations as the matching tools.
- The first version returned a bare array from `list_characters`, which
  the client rejected; results are now wrapped objects, and the helper
  that builds them refuses anything else.

## Rejected alternatives

- **Separate MCP logic.** Two implementations of "the current account" and
  "optimize" would drift.
- **Full artifact objects in results.** Several times the tokens for fields
  a model doesn't use (internal ids of stats, main-stat keys it can't read).
- **A stateful HTTP transport with sessions.** Nothing here needs server
  state between calls; sessions would add storage and cleanup for nothing.
