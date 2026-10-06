# 0050. Server views in the web app

- Status: Accepted
- Date: 2026-10-05

## Context

Phase 8.2 brings the server's Phase 5 to 7 work into the web app: the
rotation library, the comparison view's details, the account-wide
allocation, the simulated ranking of builds, and a better chat. The web
app works client-only (ADR-0021 §3); all of this needs the local server,
its gcsim and its account. Two of the views run something the client
already has a version of (the Plan page's greedy allocation, the Optimise
panel's search), with the server's account instead of the page's.

## Decision

- **Server-only sections, lazy**, as Compare Teams is (ADR-0046): the
  Rotation Library before Compare Teams, Rank by Team DPS after Results,
  and the joint allocation inside the Plan page, each loaded only while
  the server runs. Each says it uses the server's account.
- **The Optimise panel's request, said as a spec** (`simSpecFromRequest`):
  `defaults: "replace"`, so the server searches exactly the panel's
  conditions (set, main stats, floors, ceilings; its objective as
  `sim.by`) and no curated default creeps in. The crit-ratio tiebreak and
  a weighted objective have no spec form and are left out.
- **The joint allocation keeps the plan's members**: the Plan page's eight,
  in its picking order, each weighted by the slot's role (ADR-0048), so the
  two plans differ only in how the pieces are shared.
- **The chat's "Stop Waiting"** stops the browser waiting
  (`RequestStopped`, a caller's signal through `serverJson`) and puts the
  question back; the server finishes the request on its own. Cancelling
  a model run or an exact search mid-way needs the server's cooperation
  and is not worth it for a local tool.
- **The bundle**: the size baseline rose from 184,062 to 194,003 B for
  the lazy server-only chunks, which never load client-only. The chat
  panel is in the entry chunk (it mounts with the page), so its polish adds
  about 1.2 KB to the first load.

## Consequences

- With the server stopped, the page is exactly the client-only app.
- A page whose inventory came from a GOOD file, not from the server, can
  show a server view about different gear; each view says whose account
  it uses, and Load Account (step 01) aligns them.
- ADR-0038's "describe the build you want" box (`/spec/translate` and
  `/spec/run` from the page) stays open: the chat answers such requests
  already, with the same spec and tools.
