# TODO: genshin-build-lab

Working checklist for [PLAN.md](PLAN.md). Tick items in the same commit that finishes them. A phase is done only when its **Accept** line is met and the owner confirms it.

**Current phase:** 0 (fork and baseline)
**Next item:** 0.2, npm workspaces

## Housekeeping (done 2026-09-24)

- [x] Local git repo created from `upstream/main` (`natcat38/rpg-build-optimizer` @ `f4ff151`), `core.autocrlf=false`, working on `main`
- [x] Project `CLAUDE.md` replaces the fork's, with the fork's still-relevant workflow rules merged in (ADR index gate, prettier on `.md`, `memory/`, line endings)
- [x] `PLAN.md` moved to `docs/PLAN.md`, and this TODO added
- [x] `.gitignore`: inbox contents, SQLite files, `.cache/`, `tools/bin/` (gcsim binary)
- [x] `imports/inbox/` created (contents git-ignored)
- [x] GitHub home: public repo `ComeGalletas/genshin_optimizer` (standalone, with upstream history), pushed as `origin/main`. Single-branch workflow for now.
- [x] Retired the fork's `ROADMAP.md`. This file replaces it, and the old version stays in git history.
- [x] Dependabot disabled: config removed and its 5 PRs closed. Dependency upgrades happen deliberately on `main`. `CLAUDE.md` is trimmed to 59 lines to fit the OKF 60-line cap.

## Things the fork already has (these change the plan's scope)

- `src/import/`: GOOD parse and validate (`good.ts`), content-hash dedupe (`dedupe.ts`), Enka UID import (`uid.ts`). Phase 2 extends these and doesn't start from scratch.
- `src/damage/` + ADR-0016: a closed-form KQM damage objective (`avg_damage`) with curated damage profiles. Phase 5 has to decide how gcsim relates to it (candidate generator vs. replacement). Record that decision in an ADR.
- `src/plan/composePlan.ts` + ADR-0019: greedy multi-character allocation over one shared inventory (8 Abyss members). This is effectively Phase 7 v1 without the local-search pass.
- `src/ai/` + `api/explain.ts`: the explain feature via a Vercel proxy. Its prompt shaping gets reused in Phase 3.
- `scripts/check-docs.ts`: CI fails unless ADRs are contiguous and listed in `knowledge/index.md`.
- CI (`.github/workflows/ci.yml`) also gates `bench:check`, `size:check`, `format:check`, and dataset regeneration drift. All of these move with the monorepo split.

## Phase 0: Fork and baseline

- [x] 0.1 Baseline on the untouched fork: `npm test`, `typecheck`, `lint`, `docs:check`, `bench`, `build`, `size:check`. Save the numbers to `docs/baseline-phase0.md`: test count, bench timings, bundle sizes, Node version, machine.
  - Recorded in [baseline-phase0.md](baseline-phase0.md). The committed `docs/speed-report.md` is stale, and the restructure regenerates it.
  - Known: on this machine (locale `es-CO`), 659/661 tests pass. The 2 failures are the progress-counter assertions in `App.test.tsx` and `OptimizePanel.test.tsx`: `toLocaleString()` renders `12.345` where the tests expect `12,345`. CI (en-US) is unaffected, and `LANG` doesn't change ICU's locale on Windows.
- [x] 0.1b Make number formatting locale-deterministic. `formatCount` now uses a pinned en-US `Intl.NumberFormat`, and the `OptimizePanel` live region goes through it. A source-scan test fails CI on any new bare `toLocaleString()`. The suite is now 663/663 green locally, and the Phase 0 "identical test results" bar is all 663 passing.
- [ ] 0.2 Set up npm workspaces with `packages/{engine,server,web}` and tsconfig project references. Get root scripts `test`, `typecheck`, `lint` and `bench` fanning out to the packages.
- [ ] 0.3 Move pure logic into `packages/engine`: `optimizer`, `damage`, `import`, `meta`, `game` (+ `genshin/data.generated.json`), `share`, `teams`, `plan`, `roster`, `invest`, `sample` data, and `test-fixtures`. Split mixed directories: `*.tsx` views such as `PlanView`, the roster drawer and the teams view go to `web`.
- [ ] 0.4 Move React, `state/`, `workers/`, `hooks/`, `components/`, `ui/`, `ai/` and the entry point into `packages/web`, importing engine via the workspace package.
- [ ] 0.5 Fix the tooling paths: `scripts/build-dataset.ts` output, the CI dataset `git diff` path, `benchmark.ts`/`check-bench.ts` imports, `size-baseline.json`, the ESLint and Prettier configs, and `vite.config.ts`
- [ ] 0.6 Add a lint rule or test that `packages/engine` has no I/O imports (`fs`, `child_process`, `http`, DOM) and doesn't import from `server` or `web`
- [ ] 0.7 Remove the Vercel parts: `api/`, `vercel.json`, `tsconfig.api.json`, `@upstash/*`, `@vercel/node`, the api leg of `typecheck`, and the Upstash/`PUBLIC_ORIGIN` entries in `.env.example`. Keep `VITE_AI_ENABLED` off so the explain button stays hidden until Phase 3.
- [ ] 0.8 CI cleanup: remove `lighthouse.yml` (it audits upstream's production URL). Decide on `coverage-badge.yml` (it pushes a `badges` branch) and `okf.yml` (external knowledge-bundle standard).
- [ ] 0.9 ADR-0021 "Local-first server architecture". It supersedes 0001, 0010 and 0013: mark those superseded and add ADR-0021 to `knowledge/index.md`.
- [ ] 0.10 Update `README.md` (fork notice and attribution, keeping `LICENSE`/`DATA_LICENSE`), `package.json` metadata, `CONTEXT.md` "What this project is", `FILE-MAP.md`, and `knowledge/` component paths
- [ ] 0.11 Review the `memory/` entries that describe upstream's GitHub setup and mark or trim them
- [ ] **Accept:** identical test results, bench within ±10% of 0.1, web app works client-only (manual smoke: sample build, GOOD import, share link)

## Phase 1: Static data refresh

- [ ] 1.1 Bump `genshin-db` to the latest release and regenerate the snapshot (`npm run build:data`)
- [ ] 1.2 Store `{genshinDbVersion, gameVersion, generatedAt}` in the snapshot. Keep `generatedAt` deterministic (for example from the package release) so the CI drift check stays reproducible.
- [ ] 1.3 Show the snapshot versions in the web UI footer
- [ ] 1.4 Add `npm run data:coverage`: per character/weapon, whether it's in genshin-db, has a curated guide or meta target, has a damage profile, and gcsim support (placeholder column until Phase 5)
- [ ] 1.5 Update `docs/runbooks/patch-refresh.md` for the new metadata and coverage report
- [ ] **Accept:** the snapshot regenerates byte-identically twice in a row, and the coverage report prints

## Phase 2: Multi-source ingest

- [ ] 2.0 Owner: provide a real Irminsul GOOD export and an OCR export (Inventory Kamera / AdeptiScanner) of the same account, taken close together in time. Store them outside git; commit only anonymized fixtures.
- [ ] 2.1 Add `zod` to engine (ADR: runtime validation at every boundary)
- [ ] 2.2 `engine/good/normalize.ts`: zod GOOD schema, key/unit/location normalization. Reconcile it with the existing `import/good.ts` instead of forking it.
- [ ] 2.3 Sidecar for source-specific extras (Irminsul roll data etc.), keyed by artifact fingerprint
- [ ] 2.4 Artifact fingerprint (`set+slot+rarity+level+mainStat+sorted rounded substats`) plus a fuzzy OCR fallback. Decide in an ADR how it relates to the existing `dedupe.ts` content hash.
- [ ] 2.5 Merge with precedence Irminsul > OCR > Enka for values and newest-snapshot for location. Reconciliation report: only-in-A, only-in-B, and mismatches beyond tolerance.
- [ ] 2.6 Scaffold `packages/server`: SQLite (`better-sqlite3`) with a migrations table and schema for immutable snapshots, merged view, and sidecar
- [ ] 2.7 Inbox watcher: detect the source per file, import it as a timestamped snapshot tagged `{source, importedAt, gameVersion?}`, never overwrite
- [ ] 2.8 "What changed since last import" diff: new artifacts, upgrades, re-equips
- [ ] 2.9 Tests: idempotent re-import, precedence, fuzzy match, and a property test that merge never loses an artifact
- [ ] ADR(s): snapshot store and merge model
- [ ] **Accept:** ≥ 98% artifact match between the real Irminsul and OCR exports with no unexplained mismatches, and re-import is idempotent

## Phase 3: Local server, MCP, LLM client

- [ ] 3.1 Fastify API: `/account`, `/characters/:id`, `/optimize`, `/allocate`, `/sim`, `/imports` (the last three can stub until their phases)
- [ ] 3.2 MCP server (official TS SDK) over stdio and streamable HTTP with the tools listed in PLAN Phase 3. Tool I/O schemas come from zod.
- [ ] 3.3 `config/llm.json` + loader (`ollama` | `anthropic` | `openai_compatible`). Keys only in server-side `.env`. Update `.env.example`.
- [ ] 3.4 Rebuild "Explain this build" on the server LLM client, reusing the `src/ai/` prompt shaping
- [ ] 3.5 Web talks to the server when it's reachable and falls back to client-only
- [ ] 3.6 Chat panel with a server-side tool loop (the same tools as MCP). An answer can't contain numbers that aren't in tool results: add a test with a fake model.
- [ ] 3.7 `npm run server` and `npm run dev` (web + server). Document the Claude Desktop / Claude Code MCP config.
- [ ] ADR: MCP tool surface and LLM provider abstraction
- [ ] **Accept:** Claude Desktop over MCP and local Ollama both answer "best Furina build with ≥ 180% ER" from tool results only, with the quality difference noted

## Phase 4: Conditions → ConstraintSpec

- [ ] 4.1 `engine/constraints/spec.ts`: versioned zod schema (set requirements, mainStats, min/max stats, objective, exclusions, `keepEquippedOn`, teamBuffs, enemy)
- [ ] 4.2 Spec → optimizer request mapping, with tests that each field changes optimizer behavior as intended
- [ ] 4.3 LLM translator prompt → zod validation → readable "I understood: ..." summary before running
- [ ] 4.4 Golden set: 30 NL requests with expected specs, plus an eval script that reports exact-match per model
- [ ] 4.5 Test that an invalid spec never reaches the optimizer
- [ ] **Accept:** ≥ 90% exact-match with the cloud model, and the local model's score is reported

## Phase 5: gcsim

- [ ] 5.0 Owner: list the teams actually played (seeds the rotation library)
- [ ] 5.1 Research: current gcsim release, CLI flags, JSON output shape, GOOD import. Check against docs.gcsim.app and the repo, not PLAN.md. Pin it in `config/tools.json`.
- [ ] 5.2 `npm run sim:check`: download or verify the release binary into `tools/bin/` by checksum (no Go toolchain needed), print its version, run the golden configs
- [ ] 5.3 `server/sim/runner.ts`: temp config, timeout, iterations, JSON parse (mean/SD DPS, per-character damage, reactions, energy warnings)
- [ ] 5.4 Bounded worker pool plus a result cache keyed by hash(config + gcsim version)
- [ ] 5.5 `engine/sim/configgen.ts` from our data with exact summed stats. Unit-conversion tests (our totals == gcsim-reported stats), and cross-check against gcsim's own GOOD import.
- [ ] 5.6 `rotations/<archetype>/` template + `meta.json` (slots, required characters, duration, source/credit, validated gcsim version). Seed with 5.0's teams.
- [ ] 5.7 LLM-drafted rotations are saved as `status: draft` and only promoted after a parse, a clean run and owner review
- [ ] 5.8 `objective: sim`: stat optimizer top-K (default 20) → simulate → rank by mean DPS with CIs, flagging ties inside the noise
- [ ] 5.9 Unsupported character/weapon → stat-only with a "not simulated" label, and fill in the gcsim column of the coverage report
- [ ] ADR: gcsim integration, and its relationship to the ADR-0016 `avg_damage` objective
- [ ] **Accept:** 3 community configs within ±2% of published DPS, and a 4-char team, K=20 at 500 iterations in < 2 min

## Phase 6: Team comparisons

- [ ] 6.1 `simulate_team` variants: teammate, weapon, set, rotation, enemy (RES, count, level)
- [ ] 6.2 Comparison view: DPS distribution, damage share, reactions, energy warnings
- [ ] 6.3 Explanations cite sim outputs, with a test that the numbers match tool output exactly
- [ ] **Accept:** a 3-variant comparison from a single chat request, with numbers verified

## Phase 7: Account-wide allocation

- [ ] 7.1 Generalize `composePlan` from the fixed 8 Abyss members to N characters with per-character specs and priority
- [ ] 7.2 v1: the existing greedy pass plus a local-search swap improvement
- [ ] 7.3 v2: ILP over each character's top-M builds (HiGHS WASM, e.g. `highs` on npm), exact within the pool
- [ ] 7.4 Output: the plan, the move list ("move sands X from A to B"), and the farming list for gaps (extends the existing one)
- [ ] 7.5 Tests: v2 ≥ v1 on synthetic inventories, brute-force match on small cases, and a property test for no artifact reuse
- [ ] ADR: allocation v2 (it amends ADR-0019)
- [ ] **Accept:** all the 7.5 properties hold

## Phase 8: UI

- [ ] 8.1 Import center: sources, snapshots, reconciliation report, diff
- [ ] 8.2 Chat panel polish, sim results and comparison view, rotation library browser, allocation plan view
- [ ] 8.3 Share links carry sim results (ADR on size limits, extending ADR-0005)

## Backlog

See [PLAN.md § Backlog](PLAN.md#backlog).
