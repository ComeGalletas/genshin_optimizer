# 0021. Local-first server architecture

- Status: Accepted
- Date: 2026-09-24
- Supersedes: [0001](0001-client-side-only-architecture.md), [0010](0010-serverless-proxy-for-ai-explain.md) and [0013](0013-rate-limit-ai-proxy.md)

## Context

Upstream is a static, client-side SPA ([0001]) with one serverless carve-out:
a Vercel function that proxies the AI explain call ([0010]), rate-limited with
Upstash Redis ([0013]).

This fork (genshin-build-lab) is a personal account advisor that runs on the
owner's machine for one account. Its roadmap ([PLAN.md](../PLAN.md)) needs
things a browser tab cannot do:

- watch `imports/inbox/` and import GOOD files dropped there by external
  scanners (Irminsul, OCR tools, `genshin-agent`),
- keep every import as a timestamped snapshot, with history, in SQLite,
- run the gcsim CLI (a Go binary) as a child process,
- expose the engine to an LLM as MCP tools, over stdio and HTTP,
- call a local (Ollama) or cloud LLM with keys the browser must never see.

Phase 0 already removed the Vercel parts (TODO 0.7) and parked the Lighthouse
job that audited upstream's deploy (TODO 0.8). There is no public deployment.

## Decision

1. **Three packages, one I/O boundary.** `packages/engine` is pure TypeScript
   with no I/O: no files, network, child processes, DOM or Node APIs.
   `packages/server` owns all I/O. `packages/web` is the React app. The engine
   boundary is enforced by the `tsconfig.lib.json` type gate (no Node types,
   no DOM lib) and by `packages/engine/src/boundaries.test.ts` (no Node
   built-ins, third-party packages, `web`/`server` imports, or relative
   imports that leave the package).
2. **A local server.** `packages/server` runs on the owner's machine and
   listens on localhost only. It hosts a Fastify HTTP API and an MCP server
   (official TypeScript SDK, stdio and streamable HTTP) over the same engine,
   stores snapshots in SQLite (`better-sqlite3`), watches the import inbox,
   runs gcsim at the version pinned in `config/tools.json`, and holds the LLM
   client configured in `config/llm.json` (`ollama` by default,
   `anthropic` or `openai_compatible` optional). It is single-user: no
   accounts, no sign-in, no public deployment. Each of those parts gets its
   own ADR when it is built (snapshot store, MCP tool surface, gcsim
   integration); this one only fixes where they live.
3. **The web app still works client-only.** Everything it does today (GOOD
   import, the optimizer in a Web Worker, roster, teams, plan, share links)
   keeps working with no server running. Features that need the server
   (snapshot history, simulation, chat, explain) appear only when it is
   reachable. Share links stay self-contained ([0005](0005-self-contained-share-links.md)).
4. **Secrets stay server-side.** API keys live only in `.env` on the server.
   Nothing secret gets a `VITE_` prefix, because Vite inlines those into the
   public bundle. This is the one rule carried over from [0010].
5. **"Explain this build" moves to the server.** It is rebuilt in Phase 3 on
   the server's LLM client, reusing the web app's payload validation and
   prompt shaping (`packages/web/src/ai/`). `VITE_AI_ENABLED` stays unset
   until then.
6. **No rate limiter.** A localhost, single-user server has no anonymous
   callers to throttle. The cost ceiling for a cloud model is the provider's
   spend cap, and a local model costs nothing per call. Exposing the server
   beyond localhost needs a new ADR that adds authentication and limits
   first.
7. **Bundle tripwires.** The optimize worker imports `labels-core`
   (`workers/optimize.worker.ts` → `workers/protocol.ts` →
   `optimizer/search.ts` → `optimizer/diagnostics.ts` → `labels-core.ts`), so
   `labels-core` must stay free of the game adapter or the worker bundle
   gains the ~320 KB dataset. That check stays, now filed under the worker
   boundary. The checks that `ai/explainShared.ts` and
   `game/artifactValidation.ts` stay adapter-free protected only the deleted
   serverless bundle; neither file is on the worker path, and the server runs
   under Node where bundle size doesn't matter, so they are retired.

## Consequences

- [0001] is superseded: the project now has a backend. What [0001] promised
  the web app (runs in the browser, no accounts, self-contained links,
  bundled data per [0002](0002-frozen-bundled-reference-dataset.md)) still
  holds for the client-only mode.
- [0010] and [0013] are superseded: `api/explain.ts`, `vercel.json`, Upstash
  and their environment variables are gone. `.env.example` keeps
  `ANTHROPIC_API_KEY` for the server and `VITE_AI_ENABLED`.
- The security headers that lived in `vercel.json` went with it. When the
  server starts serving the web app (Phase 3), it sets its own.
- The full feature set needs the server running. The client-only app stays
  the fallback and the thing CI builds and size-checks.
- Tests run in two environments: jsdom for `web`, Node for `engine` and
  `server`. The Vitest projects already split them.
- Account data never leaves the machine or enters git: the inbox, the SQLite
  store and the sim cache are all in `.gitignore`.

## Rejected alternatives

- **Stay browser-only** ([0001] extended). A tab cannot watch a folder, run
  the gcsim binary, host an MCP stdio server or keep an API key.
- **Keep the Vercel proxy next to the local server.** Two backends for one
  user, a public paid endpoint that needs its own rate limiter, and secrets
  on a third-party host, all for a feature the local server can serve.
- **Server-only UI** (drop the client-only mode). It would break share
  links for anyone without the server and the Phase 0 acceptance line that
  the web app works client-only as before.

[0001]: 0001-client-side-only-architecture.md
[0010]: 0010-serverless-proxy-for-ai-explain.md
[0013]: 0013-rate-limit-ai-proxy.md
