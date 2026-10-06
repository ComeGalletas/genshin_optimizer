# Contributing

## Setup

Node >= 22.

```bash
npm install
npm run dev
```

## Scripts

| Script                  | What it does                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`           | Web app and local server together ([runbook](docs/runbooks/local-server.md))       |
| `npm run dev:web`       | Vite dev server only (client-only)                                                 |
| `npm run preview`       | Serve the built `packages/web/dist/` locally                                       |
| `npm test`              | Vitest suite (jsdom)                                                               |
| `npm run test:watch`    | Vitest in watch mode                                                               |
| `npm run test:coverage` | Vitest with a coverage report                                                      |
| `npm run typecheck`     | `tsc -b` (strict, project references) + `tsconfig.scripts.json`                    |
| `npm run lint`          | ESLint                                                                             |
| `npm run format`        | Prettier write                                                                     |
| `npm run format:check`  | Prettier check (no writes) — what CI runs                                          |
| `npm run build`         | Production build → `packages/web/dist/`                                            |
| `npm run build:data`    | Regenerate the frozen `genshin-db` snapshot                                        |
| `npm run data:coverage` | Which characters and weapons each curated table covers                             |
| `npm run bench`         | Regenerate `docs/speed-report.md`                                                  |
| `npm run docs:check`    | ADR numbering, knowledge-bundle freshness, dead links                              |
| `npm run size:check`    | Bundle-size budget against `scripts/size-baseline.json` (`size:update` to refresh) |

The local server's commands (`server`, `mcp`, `inbox`, `sim:check`, `rotations` and more) are in the [local server runbook](docs/runbooks/local-server.md).

`FILE-MAP.md` is hand-maintained — update it in the same commit that adds or moves a top-level source directory.

### What CI checks

`.github/workflows/ci.yml` runs one job, in order: `typecheck` → `lint` → `docs:check` → `bench:check` → `format:check` → `test:coverage` → `build` → `size:check` → `build:data`. `size:check` is a **bundle-size gate** (`npm run size:update` when growth is intentional). The last step is a **dataset-drift gate**: it regenerates the snapshot and then runs `git diff --exit-code` on the generated files in `packages/engine/src/game/genshin/` (`data.generated.json`, `images.generated.json`, `details.generated.json` and `texts/`), so a `genshin-db` bump or a change to `scripts/build-dataset.ts` fails CI unless the regenerated files are committed with it.

`bench:check` (`scripts/check-bench.ts`) is the matching **speed-report gate**: if `packages/engine/src/optimizer/search.ts`, `score.ts`, `benchmark.ts` or `context.ts`, `packages/engine/src/game/genshin/adapter.ts` or `passives.ts`, or `packages/engine/src/damage/setBonuses.ts` or `profiles.ts` changed in the diff against the base commit but `docs/speed-report.md` did not, it fails — run `npm run bench` and commit the regenerated report. It reads the base from `BENCH_BASE_SHA` (the PR base SHA in CI, the previous commit on a push to `main`) and skips silently when that is unset or the git history is unavailable, so it is a no-op locally unless you set the var yourself.

A second workflow, `.github/workflows/okf.yml`, validates the `knowledge/` bundle against the house standard (this is why `knowledge/index.md` uses root-relative links, and why `docs:check` deliberately skips them).

## Workflow

Write the failing test first, then the implementation. Every task should leave `npm test`, `npm run lint`, and `npm run typecheck` green before it is committed.

Upstream protects `main` (PRs only, linear history); this fork doesn't. Changes land on `main` directly or through a PR, as [CLAUDE.md](CLAUDE.md) describes, and CI runs on both: keep it green.

**Windows/CRLF gotcha:** with `core.autocrlf` on, a repo-wide `npm run format:check` fails locally on line endings while CI is green. Format only the files you changed:

```bash
npx prettier --write path/to/changed-file.tsx
```

## Data refresh

Hand-curated tables (`packages/engine/src/meta/metaTargets.ts`, `packages/engine/src/teams/comps.ts`, `packages/engine/src/damage/profiles.ts`) are transcribed from KQM guides and go stale each game patch. Follow [`docs/runbooks/patch-refresh.md`](docs/runbooks/patch-refresh.md) when a patch lands.

## Issues

Issues and PRDs are tracked as GitHub issues via the `gh` CLI — conventions in [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md), triage vocabulary in [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

## AI "Explain this build"

Upstream served this button through `api/explain.ts`, a Vercel serverless function that proxied Claude so the Anthropic key never reached the browser bundle ([ADR-0010](docs/adr/0010-serverless-proxy-for-ai-explain.md)), rate-limited with Upstash Redis ([ADR-0013](docs/adr/0013-rate-limit-ai-proxy.md)). This fork removed both ([ADR-0021](docs/adr/0021-local-first-server-architecture.md)). The client code in `packages/web/src/ai/` and `ExplainBuild` is kept, and the local server serves it at `POST /explain` on the model `config/llm.json` selects ([ADR-0033](docs/adr/0033-llm-provider-client.md)); the button shows while the server runs with a ready model ([ADR-0034](docs/adr/0034-web-and-local-server.md)). `ANTHROPIC_API_KEY` stays in `.env.example` for that server; it is never read by the browser bundle.
