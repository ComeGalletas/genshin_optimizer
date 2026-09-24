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
| `npm run preview`       | Serve the built `dist/` locally                          |
| `npm test`              | Vitest suite (jsdom)                                     |
| `npm run test:watch`    | Vitest in watch mode                                     |
| `npm run test:coverage` | Vitest with a coverage report                            |
| `npm run typecheck`     | `tsc -b` (strict, project references) + the API tsconfig |
| `npm run lint`          | ESLint                                                   |
| `npm run format`        | Prettier write                                           |
| `npm run format:check`  | Prettier check (no writes) — what CI runs                |
| `npm run build`         | Production build → `dist/`                               |
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

## AI "Explain this build" — local setup

The button calls `api/explain.ts`, a Vercel serverless function that proxies Claude (`claude-haiku-4-5`) so the Anthropic key never reaches the browser bundle ([ADR-0010](docs/adr/0010-serverless-proxy-for-ai-explain.md)).

- `ANTHROPIC_API_KEY` — server-side Vercel project env var.
- `VITE_AI_ENABLED=true` — build-time flag that renders the button. Keep it off until the key is deployed. It stays off on the public demo: the deployed proxy runs against a personal Anthropic account, so the feature is a local/self-hosted opt-in.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — from an [Upstash](https://upstash.com) Redis database, enabling per-IP rate limiting (10 requests/60s) plus a global budget cap (500 requests/1h, [ADR-0013](docs/adr/0013-rate-limit-ai-proxy.md)). **Required in production**: the gate keys on `VERCEL_ENV === 'production'`, and with the vars unset there the endpoint fails closed — every request is rejected with `503 { error: 'unavailable' }`. Outside production they are optional: the limiter is a no-op that logs one warning, so `vercel dev` and CI run unthrottled.
- `PUBLIC_ORIGIN` — optional. The function already accepts its own deployment origin (from `VERCEL_URL` / the request host), so set this only when the app is served from a custom domain. A present-but-unlisted `Origin` gets a 403; an absent one is allowed through to the rate limiter.
- Set a spend cap in the Anthropic console — it is the feature's hard cost ceiling.

`.env.example` at the repo root lists all five names with no values — copy it to `.env.local` and fill it in.

Run `vercel dev` (not `npm run dev`) locally to serve the `/api` function.
