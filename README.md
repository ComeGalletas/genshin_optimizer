# genshin-build-lab

A local Genshin Impact account advisor. It imports your whole inventory, finds the best builds from the gear you actually own, and (on the roadmap) scores teams with a real combat rotation simulator. An LLM, local or cloud, becomes the conversational interface: it turns goals into constraints and explains results, but every number comes from a tool, never from the model.

> **Fork notice.** This project is a fork of [natcat38/rpg-build-optimizer](https://github.com/natcat38/rpg-build-optimizer), kept as a standalone repository with upstream's history. The optimizer, importers, roster, teams and plan views below are upstream's work, and the web app still runs exactly as upstream built it. Upstream's hosted demo is at https://rpg-build-optimizer.vercel.app; this fork has no hosted version. Upstream's [MIT license](./LICENSE) and [data attribution](./DATA_LICENSE) carry over unchanged.

[![CI](https://github.com/ComeGalletas/genshin_optimizer/actions/workflows/ci.yml/badge.svg)](https://github.com/ComeGalletas/genshin_optimizer/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FComeGalletas%2Fgenshin_optimizer%2Fbadges%2Fcoverage.json)](https://github.com/ComeGalletas/genshin_optimizer/actions/workflows/coverage-badge.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

![Demo: load the sample inventory, run the exact search, and get the ranked builds with full stat sheets](docs/demo.gif)

---

## Status

Phase 0 of the [roadmap](docs/PLAN.md), fork and baseline, is nearly done; [docs/TODO.md](docs/TODO.md) is the live checklist. The code is now three packages, the Vercel parts are gone, and the architecture is recorded in [ADR-0021](docs/adr/0021-local-first-server-architecture.md). Nothing user-visible has changed yet. The phases after it:

1. Refresh the static game data and report what each character and weapon supports.
2. Import from several sources (Irminsul, OCR scanners, Enka), merge them, and keep snapshot history.
3. A local server and MCP server, so an LLM can drive the engine through tools.
4. Natural-language conditions turned into a validated constraint spec.
5. Combat simulation with [gcsim](https://gcsim.app): re-rank the optimizer's top builds by simulated team DPS.
6. Team comparisons (swap a teammate, weapon, set or rotation).
7. Account-wide allocation: builds for several characters at once without sharing artifacts.
8. The UI for it: an import center, a chat panel, simulation and comparison views, and an allocation plan view.

## Features (inherited from upstream)

- **Optimise over your real inventory** — import a GOOD-format `.json`, fetch showcased characters by UID via [Enka.Network](https://enka.network), or add pieces by hand.
- **Define what "best" means** — pick a character, weapon, and build level, set constraints, and choose the stat to maximise.
- **Provably optimal results** — an exact search returns the genuine top builds, each with its full stat sheet.
- **Shareable links** — every build encodes into a self-contained URL; no account, nothing stored server-side.
- **Try a sample build** — one click loads a curated sample inventory and runs the optimiser.

A GOOD-file upload unlocks the four account-level features — Roster, Teams, Plan, and Investment:

- **Roster assessment** — a 0–100 build score for every owned character, broken down into five components: level, talents, weapon, artifact count, and artifact quality.
- **Abyss team recommendations** — two halves that share no character, matched from curated comp archetypes.
- **Damage-ranked builds** — where a curated damage profile exists, the optimiser maximises estimated average damage instead of a proxy stat, and stays exact.
- **One plan** — optimised builds for all eight members over your shared inventory, plus one farming list.
- **Investment advice** — which characters to pull for and which weapons to craft, ranked by the team-score points each would unlock.

## Quick start

Requires Node 22 or newer.

```bash
npm install
npm run dev   # the web app on http://localhost:5199
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev workflow and [FILE-MAP.md](FILE-MAP.md) for the code layout.

## Architecture

- **`packages/engine`**: pure TypeScript with no I/O: GOOD import, the exact optimizer, damage model, teams and plan logic. A type gate and an import-boundary test keep Node, DOM, `web` and `server` out of it.
- **`packages/web`**: upstream's React app. It works entirely in the browser, with or without the server.
- **`packages/server`**: the local, single-user server (Fastify API, MCP server, SQLite snapshots, import watcher, gcsim runner, LLM client). A placeholder until Phase 2.

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
- **Decisions are documented**: 21 ADRs. Upstream's 0001–0020 record what was built, what was rejected and why; this fork's start at [0021](docs/adr/0021-local-first-server-architecture.md).

## Tech stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS · Zustand · Web Workers · Vitest + Testing Library · native `CompressionStream`, in an npm-workspaces monorepo; CI via GitHub Actions. Planned for the server: Fastify, the MCP TypeScript SDK, SQLite (`better-sqlite3`) and the gcsim CLI. Tokens and component classes: [docs/design-system.md](docs/design-system.md).

## AI: Explain this build

An optional Claude-powered plain-English explanation of the optimised build. Upstream serves it through a Vercel serverless function so the API key stays server-side ([ADR-0010](docs/adr/0010-serverless-proxy-for-ai-explain.md)). This fork removed that function, and the feature comes back on the local server in Phase 3 ([ADR-0021](docs/adr/0021-local-first-server-architecture.md)). Until then the button stays hidden behind the `VITE_AI_ENABLED` build flag.

## Non-goals

- **Scanners or packet capture**: inventory comes from external tools (Irminsul, OCR scanners, Enka) as GOOD files dropped into `imports/inbox/`. This project imports them and never captures or decodes game traffic itself.
- **Hosting or accounts**: the server runs on the owner's machine for one account, on localhost only ([ADR-0021](docs/adr/0021-local-first-server-architecture.md)).
- **i18n**: all copy is curated, hand-written English content (labels, meta targets, comp archetypes); translating it is out of scope for a personal project.
- **Multi-game support**: the speculative `GameAdapter` seam for a second game was removed as unearned complexity; `genshinAdapter` is a concrete, Genshin-specific object ([ADR-0012](docs/adr/0012-collapse-gameadapter-seam-to-concrete-adapter.md)).

## Data & license

Game reference data is derived at build time from [genshin-db](https://github.com/theBowja/genshin-db) and bundled as a frozen snapshot — numeric data only, no game assets ([`DATA_LICENSE`](./DATA_LICENSE)). On top of it sits a hand-curated layer transcribed from KQM sources — 52 meta build recipes, 30 comp archetypes, 18 damage profiles — re-verified each patch ([docs/runbooks/patch-refresh.md](docs/runbooks/patch-refresh.md)).

Code is [MIT](./LICENSE) licensed; upstream's copyright notice stays in `LICENSE`. Not affiliated with HoYoverse.
