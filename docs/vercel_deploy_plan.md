# Vercel deploy plan (parked)

Status: parked on 2026-10-06, for later. Nothing here is decided until the
owner confirms the three decisions below. The work then gets an ADR (the next free number)
and a TODO item (10.6).

## What can deploy

Only the web app (`packages/web`). The local server can't run on Vercel: it
needs SQLite (`var/store.sqlite`), the gcsim binary, the inbox folder and a
local model (Ollama).

The web app already works without the server, so a hosted copy would offer
Start, Roster, Teams, Plan, Optimise and share links. Simulate, Imports, the
chat and AI explain stay hidden, as they do today with no server running.

## What the deploy needs to know

### History

[ADR-0021](adr/0021-local-first-server-architecture.md) removed the fork's
Vercel setup on purpose when the app went local-first: the serverless
explain proxy (`api/explain.ts`), `vercel.json`, Upstash rate limiting and
their environment variables. A hosted web app reverses part of that, so it
needs its own ADR. It deploys only the static client and adds no backend,
so ADR-0021's reasons for dropping the proxy still hold.

### Build

- Node 22 (`engines` in `package.json`, and CI).
- Install: `npm ci` at the repo root (npm workspaces).
- Build: `npm run build` (`tsc -b`, then `vite build` in `packages/web`).
- Output: `packages/web/dist`.
- Routing needs no rewrite: views are `#/view` and build links are `?b=`
  on the root page.

### Security headers

The fork's `vercel.json` is in git history (`git show c223c6f~1:vercel.json`).
Its headers are a good start:

- `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy`;
- Strict-Transport-Security and Permissions-Policy;
- a Content-Security-Policy.

Its CSP needs updating for today's app:

- `img-src` must also allow `https://enka.network` and
  `https://upload-os-bbs.mihoyo.com` (the game images, ADR-0052); as
  written (`'self' data:`) it would block every picture.
- Keep `fonts.googleapis.com` and `fonts.gstatic.com`, and `connect-src
https://enka.network` (the UID import).
- Drop the `/api/` rules and the rewrite.

### The local server from a hosted page

The app checks `http://127.0.0.1:5198` (`VITE_SERVER_URL`,
`packages/web/src/local-server/client.ts`) on start, on focus and every
20 s. From a public HTTPS page that check fails three ways:

- the server answers only local origins (`packages/server/src/api/app.ts`);
- browsers restrict public pages from calling localhost;
- the CSP above blocks it.

### Data and privacy

- The bundle holds only the genshin-db snapshots (`*.generated.json`, the
  per-character `texts/`) and the demo account.
- The owner's account data lives in `var/` and `imports/`, which are ignored
  by git and never bundled.
- Images are linked, not stored, and requested with no referrer.

### Size

The deploy has to keep CI's bundle-size budget (`npm run size:check`). The
first load is about 174 KB gzipped, with every view, the character window
and its data loaded lazily.

### Process

- The full gate before every push: typecheck, lint, `format:check`,
  `docs:check`, test, build and `size:check`.
- Coverage with gcsim hidden (`tools/bin`), as CI has none.
- `BENCH_BASE_SHA=$(git rev-parse origin/main) npm run bench:check`, which
  skips itself without the variable.
- Pass `-R ComeGalletas/genshin_optimizer` to `gh` (it defaults to the
  upstream fork).
- Branches: `main` plus `fix/phase9-qa-majors` only. The work goes on that
  branch, rebased on `main`, through a PR that the main session reviews and
  merges.

## Decisions for the owner (recommendation first)

1. **The server check on the hosted site.** Recommended: off in the hosted
   build (for example `VITE_SERVER_URL=off`, treated as "no server"), so
   the hosted app is client-only, with no failing request every 20 s. The
   alternative is to let the hosted page reach the owner's local server.
   That needs the server to accept the hosted origin, the
   private-network-access preflight, and a CSP `connect-src` entry.
2. **Who touches Vercel.** Recommended: the owner. The agent prepares
   `vercel.json`, the ADR, the docs and a local build done the way Vercel
   does it, plus the exact steps. The owner signs in, links the repo (once
   linked, Vercel builds every push to `main`) and approves the first
   deploy. Agents don't sign into accounts.
3. **Who does the work.** Recommended: a fresh side session with this file
   as its brief, working on `fix/phase9-qa-majors`.

## Acceptance (proposed)

- `vercel build` locally, or the equivalent `npm ci && npm run build`,
  gives `packages/web/dist`, and the gate stays green.
- The hosted page opens empty on Start, loads the demo data, shows game
  images, and opens a share link from the local app.
- It makes no request to `127.0.0.1` (decision 1).
- Its response headers include the CSP above, and the page shows no CSP
  violations in the console.
