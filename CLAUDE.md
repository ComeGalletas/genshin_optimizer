# genshin-build-lab

A local Genshin Impact account advisor. It imports the owner's full inventory, finds the best builds from gear they actually own, and scores teams with a real combat rotation simulator. An LLM (local or cloud) is the conversational interface and translates goals into constraints. **It never does the math itself.**

Base: a fork of `natcat38/rpg-build-optimizer` (MIT). Keep its LICENSE, DATA_LICENSE and attribution. Read its `README.md`, `CONTEXT.md`, `FILE-MAP.md` and `docs/adr/` before changing anything, and follow its ADR habit: every architectural decision we add gets a new ADR (numbering continues after the fork's last one).

## Core principles

1. **The GOOD file is the contract.** Every data source (Irminsul, OCR scanner, Enka) produces GOOD JSON. Everything downstream only reads normalized GOOD plus our sidecar fields. Scanners are external tools. We import their files and never implement packet capture or decoding ourselves.
2. **Exact search first, simulation second.** The fork's branch-and-bound optimizer produces the top-K builds by stat objective (fast and provably exact). gcsim then re-ranks those candidates by simulated team DPS (slow, Monte Carlo). Never run gcsim over the raw combinatorial space.
3. **The LLM is the interface, not the solver.** It converts natural-language conditions into a validated `ConstraintSpec` JSON, calls tools, and explains results. Every number in an answer must come from a tool result. If a tool fails, say so instead of estimating.
4. **Correctness is tested, not assumed.** Keep and extend the fork's brute-force oracle tests. Any optimizer change must pass them. The gcsim integration has golden tests against known community configs.

## Stack

- TypeScript (strict) monorepo, keeping the fork's Vite, React, Zustand and Vitest setup.
- New `packages/server`: a local Node server (Fastify) plus an MCP server (official TS SDK) that exposes the same engine. It stores data in SQLite (`better-sqlite3`), including import snapshots and history.
- gcsim runs as an external CLI binary (Go). Pin a version in `config/tools.json`, then call it via child process with generated configs and parse the JSON output.
- Static data comes from a `genshin-db` snapshot generated at build time (the fork already does this in `scripts/build-dataset.ts`). Record the game version of the snapshot.
- LLM access is configured in `config/llm.json` (`provider`: `ollama` | `anthropic` | `openai_compatible`, `baseUrl`, `model`). Local default is Ollama on `http://localhost:11434`. API keys live only in `.env` on the server side, never in the client bundle (see the fork's ADR-0010 for why).
- The external `genshin-agent` project (Python) may produce GOOD files from its own OCR. It connects only by dropping files into `imports/inbox/`.

## Layout (target)

```
packages/
  engine/      # pure TS: GOOD types, normalize, merge, optimizer (from fork), constraint spec, gcsim config gen/parse
  server/      # Fastify API + MCP server + import watcher + gcsim runner + LLM client
  web/         # the fork's React app, now talking to server when available (still works client-only)
data/          # genshin-db snapshot, curated guides (from fork), rotation library
rotations/     # gcsim rotation templates per team archetype (*.gcsl.tmpl + meta.json)
imports/inbox/ # drop GOOD files here (Irminsul, OCR scanners, genshin-agent)
config/
docs/{PLAN.md, adr/}
```

## Conventions

- Before every commit, run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prettier --check` on changed files (CI checks Markdown too). CI must stay green.
- Engine code is pure with no I/O. All I/O (files, SQLite, child processes, HTTP, LLM) lives in `server`.
- Engine stats stay in percent, as GOOD and the fork store them (crit rate 31.1, not 0.311; ADR-0023). Convert only at the gcsim boundary, and test that conversion.
- Never overwrite an import. Each import is a timestamped snapshot, and "current account" is a view over the latest merged snapshot.
- When game data is missing for a new character or item (genshin-db or gcsim lagging behind the game), degrade gracefully: stat-only mode with an explicit "not simulated" flag. Never crash, and never guess.

## Repo workflow

- Plan and progress: `docs/PLAN.md` is the roadmap. Work phase by phase and don't skip acceptance criteria. `docs/TODO.md` is its checklist. Read it at session start, state the current phase and next unchecked item, and tick items in the same commit that finishes them.
- Git: `upstream` is `natcat38/rpg-build-optimizer`. `origin` is `ComeGalletas/genshin_optimizer` (public). For now all work happens on `main` in this single checkout, with no parallel branches or worktrees, until work is split into simultaneous tasks. Pull upstream changes deliberately (`git fetch upstream` then merge), never blindly.
- ADRs: the fork's last one is 0020, so ours start at **0021**. `npm run docs:check` (in CI) fails unless ADR numbers are contiguous **and** every ADR is linked from `knowledge/index.md`, so add it to its topic line there in the same commit.
- Glossary: `CONTEXT.md` is the canonical vocabulary. New domain terms (snapshot, sidecar, fingerprint, ConstraintSpec, rotation template, ...) get an entry there when introduced. Keep `FILE-MAP.md` current when adding or moving a top-level source directory.
- Line endings: `.gitattributes` forces LF and this checkout sets `core.autocrlf=false`. Don't reformat the tree to fix CRLF noise.
- Shared agent memory: `memory/` (index `memory/MEMORY.md`) is the repo's tool-agnostic memory, inherited from the fork. Entries marked _(upstream, unconfirmed)_ need the owner's confirmation before you follow them. Plain-text notes worth keeping go in `.claude/notes/`.

## Commands (target)

- `npm run dev`: web + server
- `npm run server`: API + MCP (stdio and HTTP)
- `npm run sim:check`: verify the gcsim binary, version, and golden configs
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run bench`, `npm run build:data` (regenerate the genshin-db snapshot)
