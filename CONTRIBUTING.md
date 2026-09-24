# Contributing

## Setup

Node >= 20.

```bash
npm install
npm run dev
```

## Scripts

| Script                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `npm run dev`           | Vite dev server                                          |
| `npm run preview`       | Serve the built `packages/web/dist/` locally             |
| `npm test`              | Vitest suite (jsdom)                                     |
| `npm run test:watch`    | Vitest in watch mode                                     |
| `npm run test:coverage` | Vitest with a coverage report                            |
| `npm run typecheck`     | `tsc -b` (strict, project references) + the API tsconfig |
| `npm run lint`          | ESLint                                                   |
| `npm run format`        | Prettier write                                           |
| `npm run format:check`  | Prettier check (no writes) — what CI runs                |
| `npm run build`         | Production build → `packages/web/dist/`                  |
| `npm run build:data`    | Regenerate the frozen `genshin-db` snapshot              |
| `npm run bench`         | Regenerate `docs/speed-report.md`                        |
| `npm run docs:check`    | ADR numbering, knowledge-bundle freshness, dead links    |

`FILE-MAP.md` is hand-maintained — update it in the same commit that adds or moves a top-level source directory.

### What CI checks

`.github/workflows/ci.yml` runs one job, in order: `typecheck` → `lint` → `docs:check` → `bench:check` → `format:check` → `test` → `build` → `build:data`. That last step is a **dataset-drift gate**: it regenerates the snapshot and then runs `git diff --exit-code packages/engine/src/game/genshin/data.generated.json`, so a `genshin-db` bump or a change to `scripts/build-dataset.ts` fails CI unless the regenerated file is committed with it.

`bench:check` (`scripts/check-bench.ts`) is the matching **speed-report gate**: if `packages/engine/src/optimizer/search.ts`, `packages/engine/src/optimizer/score.ts`, `packages/engine/src/optimizer/benchmark.ts`, `packages/engine/src/optimizer/context.ts`, `packages/engine/src/damage/setBonuses.ts`, or `packages/engine/src/damage/profiles.ts` changed in the diff against the base commit but `docs/speed-report.md` did not, it fails — run `npm run bench` and commit the regenerated report. It reads the base from `BENCH_BASE_SHA` (the PR base SHA in CI, the previous commit on a push to `main`) and skips silently when that is unset or the git history is unavailable, so it is a no-op locally unless you set the var yourself.

A second workflow, `.github/workflows/okf.yml`, validates the `knowledge/` bundle against the house standard (this is why `knowledge/index.md` uses root-relative links, and why `docs:check` deliberately skips them).

## Workflow

Write the failing test first, then the implementation. Every task should leave `npm test`, `npm run lint`, and `npm run typecheck` green before it is committed.

`main` is protected: changes land via PR (no direct pushes), history stays linear (merge commits are rejected — rebase or squash), CI must pass before merging, and force-pushes/branch deletion are blocked.

**Windows/CRLF gotcha:** with `core.autocrlf` on, a repo-wide `npm run format:check` fails locally on line endings while CI is green. Format only the files you changed:

```bash
npx prettier --write path/to/changed-file.tsx
```

## Data refresh

Hand-curated tables (`packages/engine/src/meta/metaTargets.ts`, `packages/engine/src/teams/comps.ts`, `packages/engine/src/damage/profiles.ts`, `packages/engine/src/meta/teammates.ts`) are transcribed from KQM guides and go stale each game patch. Follow [`docs/runbooks/patch-refresh.md`](docs/runbooks/patch-refresh.md) when a patch lands.

## Issues

Issues and PRDs are tracked as GitHub issues via the `gh` CLI — conventions in [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md), triage vocabulary in [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

## AI "Explain this build"

Upstream served this button through `api/explain.ts`, a Vercel serverless function that proxied Claude so the Anthropic key never reached the browser bundle ([ADR-0010](docs/adr/0010-serverless-proxy-for-ai-explain.md)), rate-limited with Upstash Redis ([ADR-0013](docs/adr/0013-rate-limit-ai-proxy.md)). This fork removed both (TODO 0.7). The client code in `packages/web/src/ai/` and `ExplainBuild` is kept, but nothing serves `/api/explain` until the local server rebuilds it in Phase 3, so leave `VITE_AI_ENABLED` unset. `ANTHROPIC_API_KEY` stays in `.env.example` for that server; it is never read by the browser bundle.
