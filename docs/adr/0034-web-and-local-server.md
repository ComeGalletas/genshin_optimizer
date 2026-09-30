# 0034. The web app and the local server: probe, degrade, and load the server's account by replacing

- Status: Accepted
- Date: 2026-09-30

## Context

ADR-0021 §3 says the web app keeps working client-only, and that features
needing the server appear only when it is reachable. TODO 3.5 builds that.
Two features need the server today: "Explain this build" (ADR-0033) and
the account the server merged from every import (ADR-0027, ADR-0028). The
web app keeps its own inventory and roster in `localStorage`, filled from
uploaded files. The chat (3.6) will answer from the server's account, so
the two can disagree unless the web app can take the server's copy.

Until now explain was gated by a build flag, `VITE_AI_ENABLED`, because
nothing served it.

## Decision

1. **Probe, don't configure.** The web app calls `GET /health` and
   `GET /llm` (`packages/web/src/local-server/`) on start and whenever its
   tab regains focus, with a 2 s limit, so starting `npm run server` later
   needs no reload. The result is app state (`useServer`), not persisted.
   Re-checks keep the last known state until they answer, so the
   server-only controls don't flicker.
2. **Server-only features follow the probe.** Explain shows only while
   the server is online and its model is ready. `VITE_AI_ENABLED` is
   removed. A header chip names the state ("Client-only", "Local server ·
   <model>", or "no model", with the reason in its label) and checks again
   when pressed.
3. **Direct calls, no dev proxy.** The browser calls
   `http://127.0.0.1:5198` directly; the server's localhost Origin check
   and CORS (ADR-0030) already allow a local page. An IP rather than
   `localhost` so the browser never tries `::1` first. `VITE_SERVER_URL`
   moves it; it is an address, not a secret (ADR-0021 §4).
4. **The server's account comes as a GOOD file.** `GET /account/good`
   returns the merged artifacts (with locks) and the best-ranked
   snapshot's roster and weapons, written by the engine's `toGOODAccount`
   (the inverse of `normalizeGOOD`, round-trip tested). The web app reads
   it through the same `parseGOOD` / `parseGOODRoster` path as an uploaded
   file, so there is one import path to keep correct.
5. **Loading it replaces; it doesn't merge.** The server's account is
   already the merge of every import, and deduping it against an older
   browser copy would keep a levelled piece twice. When the browser holds
   gear the player imported, the button takes a second press ("Confirm
   Replace", with Cancel and the same 5 s reset as Clear); the sample bag
   is replaced without asking, as any import does.
6. **Tests never reach the network.** The web test setup replaces `fetch`
   with one that rejects, so a developer's running server can't change
   test results; tests that need fetch stub it.

## Consequences

- The chat panel (3.6) uses the same probe and `serverJson` helper, and
  appears under the same rule as explain.
- Errors from the server reach the user in its own words (a model timeout,
  a missing key, "no account imported yet"), through `ServerError`.
- The browser's inventory can still drift from the server's after new
  imports; loading again replaces it. Syncing automatically is not done:
  it would overwrite gear entered by hand without asking.
- On Windows a refused connection to 127.0.0.1 takes about 2 s, so the
  first probe with no server reads as a timeout; the app is fully usable
  meanwhile.

## Rejected alternatives

- **A Vite dev proxy for `/api`.** Works only under `npm run dev`, not for a
  built app opened from `preview` or another local port.
- **Keeping `VITE_AI_ENABLED`.** A build flag can't know whether the
  server is running now, or whether its model has a key.
- **Merging the server's account into the browser's.** See 5.
- **A new web import path for the server's own JSON.** A second parser to
  keep in step with GOOD; the round-trip test makes GOOD sufficient.
