# 0030. Local HTTP API: localhost guards, defaults from the Plan, search off the event loop

- Status: Accepted
- Date: 2026-09-28

## Context

ADR-0021 puts a Fastify API on the local server, on localhost only, with no
accounts. TODO 3.1 asks for `/account`, `/characters/:id`, `/optimize`,
`/allocate`, `/sim` and `/imports`, the last three allowed to stub. The web
app (3.5), the MCP server (3.2) and the chat loop (3.6) will all call the
same engine through it.

Measured on the owner's 1,650-piece account, the exact search behind
`/optimize` takes 3 s (Furina over unequipped pieces), 11 s (Furina with
her meta defaults over everything) and 34 s (Furina, crit value with
ER ≥ 180% and no set requirement, the Phase 3 acceptance question).

## Decision

`packages/server/src/api/` (Fastify 5, `npm run server`):

1. **Localhost, enforced per request.** The server listens on 127.0.0.1.
   Every request must carry a localhost `Host` header, or it gets a 403:
   that stops a web page from reaching the server through DNS rebinding. A
   request with an `Origin` (from a browser) must come from a localhost
   origin, which then gets CORS headers; any other origin gets a 403, so a
   foreign page can't even send a simple POST. Exposing the server beyond
   localhost still needs its own ADR (ADR-0021 §6).
2. **Endpoints:**
   - `GET /health`: versions.
   - `GET /account`: the current merge and account counts.
   - `GET /characters`, `GET /characters/:id`: the roster, the equipped
     pieces, the sheet totals with them, and the default objective and
     constraints.
   - `POST /optimize`: the engine's exact search over the current account.
   - `GET /imports`, `GET /imports/:id/changes`, `POST /imports/scan`: the
     snapshot store (ADR-0028) and the import diff (ADR-0029).
   - `POST /allocate`, `POST /sim`: 501 until Phases 7 and 5.
3. **The roster behind the account** comes from the best-ranked snapshot in
   the current merge that has characters (ADR-0027's precedence), since OCR
   scans often carry artifacts only.
4. **Defaults are the Plan page's.** A request may omit the weapon (the
   equipped one), build level (the roster's), objective and constraints;
   the last two come from `optimizer/defaults.ts`, which `composePlan` now
   uses too, so the web and the server can't drift.
5. **Parse once, name the problem** (ADR-0022). Inputs go through zod
   (the full API, server-side), including vocabulary: an unknown character,
   weapon, set or stat key, or a weapon the character can't wield, is a 400
   saying which. Every error is `{ error, message, issues? }`.
6. **Searches run on a worker thread,** one at a time, with a time limit
   (120 s by default; a timeout is a 504 that suggests narrowing the
   request). The event loop stays free: `/health` answers in ms during a
   34 s search. The worker loads the engine's TypeScript through a small
   bootstrap that registers tsx, since worker threads don't inherit the
   loader.

## Consequences

- The server needs `tsx` at runtime while it runs from TypeScript source
  (root dev dependency today); a build step would remove that, if one is
  ever added.
- A 34 s answer to the acceptance question works but is slow for chat. The
  search itself is the engine's; making it faster (a tighter bound for
  `avg_damage`, or presolving pools) is engine work, measured by the
  benchmark, not an API concern.
- Responses carry the pieces in full, so a client never needs a second call
  to show a build.

## Rejected alternatives

- **Run the search inline.** Simple, but the whole server, MCP and chat
  included, would freeze for tens of seconds.
- **`@fastify/cors`.** The policy is two lines (localhost origins only);
  a plugin would add configuration to get wrong.
- **No Host check.** Binding to 127.0.0.1 alone doesn't stop DNS
  rebinding; the Host check does, at no cost.
