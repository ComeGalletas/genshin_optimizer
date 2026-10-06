# genshin-build-lab

A local Genshin Impact account advisor. It imports your whole inventory, finds the best builds from the gear you actually own, and scores teams with a real combat rotation simulator ([gcsim](https://gcsim.app)). An LLM, local or cloud, becomes the conversational interface: it turns goals into constraints and explains results, but every number comes from a tool, never from the model.

> **Fork notice.** This project is a fork of [natcat38/rpg-build-optimizer](https://github.com/natcat38/rpg-build-optimizer), kept as a standalone repository with upstream's history. The optimizer, importers, roster, teams and plan views below started as upstream's work; the web app has since been reorganised into separate views with a start screen, game images, in-app help and a character window (Phase 9), and still runs client-only. Upstream's hosted demo is at https://rpg-build-optimizer.vercel.app; this fork has no hosted version. Upstream's [MIT license](./LICENSE) and [data attribution](./DATA_LICENSE) carry over unchanged.

[![CI](https://github.com/ComeGalletas/genshin_optimizer/actions/workflows/ci.yml/badge.svg)](https://github.com/ComeGalletas/genshin_optimizer/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FComeGalletas%2Fgenshin_optimizer%2Fbadges%2Fcoverage.json)](https://github.com/ComeGalletas/genshin_optimizer/actions/workflows/coverage-badge.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

![Upstream's demo, from before this fork's UI changes: load the sample inventory, run the exact search, and get the ranked builds with full stat sheets](docs/demo.gif)

---

## Status

Phases 0 to 9 of the [roadmap](docs/PLAN.md) are done and accepted, and Phase 10 (a reorganization) is under way; [docs/TODO.md](docs/TODO.md) is the live checklist. The architecture is recorded in [ADR-0021](docs/adr/0021-local-first-server-architecture.md). The phases:

1. Refresh the static game data and report what each character and weapon supports.
2. Import from several sources (Irminsul, OCR scanners, Enka), merge them, and keep snapshot history.
3. A local server and MCP server, so an LLM can drive the engine through tools.
4. Natural-language conditions turned into a validated constraint spec.
5. Combat simulation with [gcsim](https://gcsim.app): re-rank the optimizer's top builds by simulated team DPS.
6. Team comparisons (swap a teammate, weapon, set or rotation).
7. Account-wide allocation: builds for several characters at once without sharing artifacts.
8. The UI for it: an import center, a chat panel, simulation and comparison views, and an allocation plan view.
9. A UI refresh: separate views, a start screen with demo data, game images, in-app help and a character window.
10. A reorganization, its scope still being set.

## Features

- **Optimise over your real inventory** — import a GOOD-format `.json`, fetch showcased characters by UID via [Enka.Network](https://enka.network), or add pieces by hand.
- **Define what "best" means** — pick a character, weapon, and build level, set constraints, and choose the stat to maximise.
- **Provably optimal results** — an exact search returns the genuine top builds, each with its full stat sheet.
- **Shareable links** — every build encodes into a self-contained URL; no account, nothing stored server-side.
- **Demo data** — one click loads a made-up account (eight characters in two teams, each wearing a build) to look around before loading your own.

With a roster loaded (from a GOOD file, the local server's account or the demo data), the account-level views work: Roster, Teams and Plan, with investment advice in Plan:

- **Roster assessment** — a 0–100 build score for every owned character, broken down into five components: level, talents, weapon, artifact count, and artifact quality.
- **Abyss team recommendations** — two halves that share no character, matched from curated comp archetypes.
- **Damage-ranked builds** — where a curated damage profile exists, the optimiser maximises estimated average damage instead of a proxy stat, and stays exact.
- **One plan** — optimised builds for all eight members over your shared inventory, plus one farming list.
- **Investment advice** — which characters to pull for and which weapons to craft, ranked by the team-score points each would unlock.

## Quick start

Requires Node 22 or newer.

```bash
npm install
npm run dev   # the web app on http://localhost:5199 and the local server on 127.0.0.1:5198
```

The web app also works on its own (`npm run dev:web`). With the server it can load the account you imported into `imports/inbox/`, explain builds, and answer questions in a chat, using a local [Ollama](https://ollama.com) model by default. To use your account from Claude Desktop or Claude Code over MCP, run `npm run mcp:config`. Both are covered in the [local server runbook](docs/runbooks/local-server.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev workflow and [FILE-MAP.md](FILE-MAP.md) for the code layout.

## Architecture

- **`packages/engine`**: pure TypeScript with no I/O: GOOD import, the exact optimizer, damage model, teams and plan logic. A type gate and an import-boundary test keep Node, DOM, `web` and `server` out of it.
- **`packages/web`**: the React app, upstream's reworked into views ([ADR-0053](docs/adr/0053-views-and-starting-empty.md)). It works entirely in the browser, and uses the local server when it runs.
- **`packages/server`**: the local, single-user server (Fastify API, MCP server, SQLite snapshots, inbox import, gcsim runner, LLM client).

The ground rules: the GOOD file (the community inventory-export format scanners produce) is the contract every data source produces; exact search runs first and simulation only re-ranks its top candidates; the LLM is the interface, not the solver; and correctness is tested, not assumed. See [ADR-0021](docs/adr/0021-local-first-server-architecture.md).

## How it works

The optimiser is an exact branch-and-bound search running in a Web Worker: it walks the slots in order and prunes any branch whose best possible completion can't beat the current top-K, so it returns the provably optimal build while evaluating a sliver of the brute-force space (see [docs/speed-report.md](docs/speed-report.md), regenerated by `npm run bench`). A brute-force oracle test proves the returned top-K matches exhaustive enumeration.

Every architectural decision and its rationale lives in [`docs/adr/`](./docs/adr); the domain vocabulary is defined once in [`CONTEXT.md`](./CONTEXT.md).

## Engineering highlights

- **Exact optimisation, proven by test**: the branch-and-bound search is checked against a brute-force oracle, so the returned top-K must match exhaustive enumeration ([docs/speed-report.md](docs/speed-report.md)).
- **A pure engine, enforced**: engine source typechecks with neither Node nor DOM types, and a test fails on any I/O, `web` or `server` import.
- **Client-only web app**: imports, the optimizer, roster scoring and share links all run in the browser. Builds encode into self-contained URLs via the native `CompressionStream` API ([ADR-0005](docs/adr/0005-self-contained-share-links.md)).
- **Off the main thread**: the search runs in a Web Worker with live progress, cancellation and run-superseding, so the UI never freezes mid-search.
- **CI as a quality gate**: typecheck, lint, format, docs checks, tests with coverage, a bundle-size budget, a benchmark-staleness check and a dataset-drift check run on every push to `main`.
- **Decisions are documented**: upstream's ADRs 0001–0020 record what was built, what was rejected and why; this fork's continue from [0021](docs/adr/0021-local-first-server-architecture.md).

## Tech stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS · Zustand · Web Workers · Vitest + Testing Library · zod (`zod/mini`, runtime validation) · native `CompressionStream`, in an npm-workspaces monorepo; CI via GitHub Actions. The local server: Fastify, the MCP TypeScript SDK, SQLite (`better-sqlite3`) and the gcsim CLI. Tokens and component classes: [docs/design-system.md](docs/design-system.md).

## AI: Explain this build

An optional Claude-powered plain-English explanation of the optimised build. Upstream serves it through a Vercel serverless function so the API key stays server-side ([ADR-0010](docs/adr/0010-serverless-proxy-for-ai-explain.md)). This fork removed that function and serves it from the local server instead: `POST /explain` calls whichever model `config/llm.json` selects, a local Ollama model by default ([ADR-0021](docs/adr/0021-local-first-server-architecture.md), [ADR-0033](docs/adr/0033-llm-provider-client.md)). The web app shows the button while the server is running with a ready model, and hides it when it runs client-only ([ADR-0034](docs/adr/0034-web-and-local-server.md)). With the server running, the Start view's Your Account card can also load the account it merged from your imports, and an **Ask** button opens a chat whose model answers from the same tools as MCP, with every number checked against the tool results ([ADR-0035](docs/adr/0035-chat-tool-loop.md)).

## Non-goals

- **Scanners or packet capture**: inventory comes from external tools (Irminsul, OCR scanners, Enka) as GOOD files dropped into `imports/inbox/`. This project imports them and never captures or decodes game traffic itself.
- **Hosting or accounts**: the server runs on the owner's machine for one account, on localhost only ([ADR-0021](docs/adr/0021-local-first-server-architecture.md)).
- **i18n**: all copy is curated, hand-written English content (labels, meta targets, comp archetypes); translating it is out of scope for a personal project.
- **Multi-game support**: the speculative `GameAdapter` seam for a second game was removed as unearned complexity; `genshinAdapter` is a concrete, Genshin-specific object ([ADR-0012](docs/adr/0012-collapse-gameadapter-seam-to-concrete-adapter.md)).

## Data & license

Game reference data is derived at build time from [genshin-db](https://github.com/theBowja/genshin-db) and bundled as a frozen snapshot — numbers and game text, no game assets ([`DATA_LICENSE`](./DATA_LICENSE)). Game images are linked from Enka and HoYoverse by asset name, never copied into the repo ([ADR-0052](docs/adr/0052-game-images-by-reference.md)). On top of it sits a hand-curated layer transcribed from KQM sources — 52 meta build recipes, 31 comp archetypes, 18 damage profiles — re-verified each patch ([docs/runbooks/patch-refresh.md](docs/runbooks/patch-refresh.md)). The combat rotations in [`rotations/`](./rotations/) come from community gcsim configs in the [KQM Sim Database](https://db.kqm.gg), credited per rotation and kept with their published assumptions; simulations run on [gcsim](https://github.com/genshinsim/gcsim) as an external program ([`DATA_LICENSE`](./DATA_LICENSE)).

Code is [MIT](./LICENSE) licensed; upstream's copyright notice stays in `LICENSE`. Not affiliated with HoYoverse.
