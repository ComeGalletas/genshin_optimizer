# TODO: genshin-build-lab

Working checklist for [PLAN.md](PLAN.md). Tick items in the same commit that finishes them. A phase is done only when its **Accept** line is met and the owner confirms it.

**Current phase:** 1 (static data refresh). Phase 0 was accepted by the owner on 2026-09-24.
**Next item:** Phase 1 acceptance: the owner confirms, then Phase 2

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
- [x] 0.2 Set up npm workspaces with `packages/{engine,server,web}` and tsconfig project references. Get root scripts `test`, `typecheck`, `lint` and `bench` fanning out to the packages.
  - Packages are `@genshin-build-lab/{engine,server,web}` and export TypeScript source directly (no build step). `web` is an empty placeholder until 0.4.
  - `npm test` runs Vitest projects `app` (root `src/` + `api/`, jsdom), `engine` and `server` (node), with one coverage report. `tsc -b` references each package. There's one root ESLint config. Result: 665/665 tests (663 + 2 package smoke tests), and every CI step is green locally.
  - Head start on 0.6: `packages/engine/tsconfig.lib.json` typechecks non-test source with no Node or DOM types (verified that `node:fs`, `document` and `process` fail). The import-boundary part (no `server`/`web` imports) is still open. `optimizer/benchmark.ts` uses `performance`, so it needs a small ambient declaration or an injected clock when it moves in 0.3.
- [x] 0.3 Move pure logic into `packages/engine`: `optimizer`, `damage`, `import`, `meta`, `game` (+ `genshin/data.generated.json`), `share`, `teams`, `plan`, `roster`, `invest`, `sample` data, and `test-fixtures`. Split mixed directories: `*.tsx` views such as `PlanView`, the roster drawer and the teams view go to `web`.
  - 62 files moved with `git mv`, keeping history. The app imports engine modules by subpath (`@genshin-build-lab/engine/optimizer/search`), not a barrel, so the module graph and bundle are unchanged: JS within 0.03 kB, and the CSS hash is identical to the baseline. The views stay in root `src/` until 0.4.
  - Also moved: `labels-core.ts`, and the adapter-bound half of `labels.ts`. The root `src/labels.ts` now re-exports the engine copy and keeps the UI tone mappings. `state/artifactValidation.ts` moved to `game/artifactValidation.ts`.
  - `import/uid.ts` is split: the pure `parseEnkaResponse` is in the engine as `import/enka.ts`, and `fetchUidArtifacts` (the network call) stays in `src/import/uid.ts`.
  - Engine purity: `tsconfig.lib.json` adds a reviewed allowlist of web-standard, non-I/O globals (`types/web-globals.d.ts`: `performance.now`, `crypto.randomUUID`, base64, text encoding, compression streams). Everything else from DOM or Node is still a type error.
  - Tests: 667/667 (337 app in jsdom, 329 engine in node, 1 server). Bundle-boundary tripwires are split between `packages/engine/src/labels-core.test.ts` and `src/bundleBoundaries.test.ts`, and the locale scan now covers both trees. Explored/pruned counts are identical to the baseline, and side-by-side timings against the pre-move commit are within ±7% (see [baseline-phase0.md](baseline-phase0.md)).
  - Found and fixed: Tailwind only scanned `src/`, so the move silently dropped about 0.3 kB of CSS. `tailwind.config.js` now scans the engine too.
  - Living docs (CONTEXT, CONTRIBUTING, runbooks, knowledge, FILE-MAP) point at the new paths. ADR prose was left as history, and only broken ADR links were fixed.
- [x] 0.4 Move React, `state/`, `workers/`, `hooks/`, `components/`, `ui/`, `ai/` and the entry point into `packages/web`, importing engine via the workspace package.
  - The whole root `src/` moved to `packages/web/src` with `git mv`, together with `index.html`, `public/`, `tailwind.config.js` and `postcss.config.js`. `tsconfig.app.json` became `packages/web/tsconfig.json`, referenced from the root `tsc -b`. React, `react-dom`, `vaul` and `zustand` are now dependencies of `web` (the lockfile was edited by hand, since npm 10 strips its `libc` fields).
  - Vite is split in two. `packages/web/vite.config.ts` owns dev (port 5199), build (output `packages/web/dist`) and preview, and reads `.env` from the repo root. The root `vite.config.ts` became `vitest.config.ts`, test projects and coverage only. Root `dev`, `build` and `preview` delegate to the workspace. Tailwind globs are `relative` and PostCSS pins the Tailwind config, so the CSS is the same from any cwd. Prettier's Tailwind plugin points at the moved config.
  - Result: every file in `dist/` is byte-identical to the pre-move build (CSS `index-BEd0SRuD.css`, JS 162,637 B gzip). 667/667 tests, coverage above the floors, and the dataset rebuild is a no-op. Smoke test with Playwright on both dev and preview: live hero solve, sample Nahida optimise, GOOD import of the fixture (20 artifacts), and a share link that decodes in a fresh browser context.
- [x] 0.5 Fix the tooling paths: `scripts/build-dataset.ts` output, the CI dataset `git diff` path, `benchmark.ts`/`check-bench.ts` imports, `size-baseline.json`, the ESLint and Prettier configs, and `vite.config.ts`
  - Done in 0.3 (CI had to stay green): `build-dataset.ts` output, the CI dataset diff path, `benchmark.ts` imports, `check-bench.ts` watched paths, `.prettierignore`, and Tailwind content. The speed report is regenerated, which fixes its staleness. Done in 0.4: `vite.config.ts`, `index.html`/`public/`, `check-size.ts`'s `dist` path (the baseline value is unchanged), and the ESLint globs (`**/dist`, with `packages/web/src` covered by `packages/*/src`). Left alone: `vercel.json` would need `outputDirectory: packages/web/dist`, but 0.7 deletes it.
  - Closed out in 0.5: verified every listed tool from the new layout. `build:data` is a no-op on the dataset, `size:check` reads `packages/web/dist`, and `bench:check` passes against both the pre-0.3 and pre-0.4 bases. `npm run bench` gives explored/pruned counts identical to the committed report; timings from this container weren't committed. Two fixes: `bench` now runs Prettier on the report it writes (before, following the runbook left `format:check` red), and `packages/web/tsconfig.node.json` typechecks the web Vite config inside its own package, while the root `tsconfig.node.json` keeps only `vitest.config.ts`.
- [x] 0.6 Add a lint rule or test that `packages/engine` has no I/O imports (`fs`, `child_process`, `http`, DOM) and doesn't import from `server` or `web`
  - A test rather than a lint rule: `packages/engine/src/boundaries.test.ts` reads every engine file's imports with TypeScript's own scanner (`import type`, `export … from`, `import()` and `require()` included). Source may not import Node built-ins, third-party packages (the engine has no runtime dependencies), `@genshin-build-lab/web`/`server`, or relative paths that leave the package. Tests may read fixtures with `node:` modules and use `vitest`, but the `web`/`server` rule applies to them too.
  - DOM and Node globals stay with the type-level gate from 0.2/0.3 (`tsconfig.lib.json`). A second test fails if that gate is loosened (non-empty `types`, or a DOM/WebWorker lib).
  - The checker itself is tested: 14 planted imports must be flagged and 6 legitimate ones must pass. Planting an escaping import in `optimizer/score.ts` and adding `DOM` to the gate each turned the suite red; both were reverted.
- [x] 0.7 Remove the Vercel parts: `api/`, `vercel.json`, `tsconfig.api.json`, `@upstash/*`, `@vercel/node`, the api leg of `typecheck`, and the Upstash/`PUBLIC_ORIGIN` entries in `.env.example`. Keep `VITE_AI_ENABLED` off so the explain button stays hidden until Phase 3.
  - Removed `api/` (4 files, 31 tests: 684 → 653), `vercel.json`, `tsconfig.api.json`, `@upstash/ratelimit`, `@upstash/redis` and `@vercel/node`, plus `@anthropic-ai/sdk`, whose only user was `api/explain.ts` (the Phase 3 server adds it back to its own package). The root `package.json` now has no runtime dependencies. The lockfile was regenerated with npm 11: 141 entries removed (the Vercel/Upstash/Anthropic trees), none added, no version changed.
  - `.env.example` keeps only `ANTHROPIC_API_KEY` (for the local server) and `VITE_AI_ENABLED`. ESLint, Vitest, `.gitignore` and the `typecheck` script no longer mention `api/` or `.vercel`.
  - The web explain client (`ai/`, `ExplainBuild`) stays, hidden. The "serverless bundle boundary" tripwires in `labels-core.test.ts` and `bundleBoundaries.test.ts` stay too; their comments now say the consumer is gone, and ADR-0021 (0.9) decides whether the split still matters. The CSP headers that lived in `vercel.json` went with it; Phase 3's server decides its own.
  - Docs: FILE-MAP, CONTRIBUTING, the testing runbook, and README's AI section. The rest of README (upstream demo link, badges) is 0.10.
- [x] 0.8 CI cleanup: remove `lighthouse.yml` (it audits upstream's production URL). Decide on `coverage-badge.yml` (it pushes a `badges` branch) and `okf.yml` (external knowledge-bundle standard).
  - Owner's decisions (2026-09-24). `lighthouse.yml` stays in the tree but is parked: no push or schedule trigger (manual `workflow_dispatch` only), and the job skips unless the repo variable `LIGHTHOUSE_URL` names a deploy. It no longer audits upstream's Vercel site or publishes reports. `coverage-badge.yml` keeps pushing the `badges` branch for now; its comment now gives this repo's badge URL, and README keeps upstream's badge until 0.10. `okf.yml` is unchanged.
  - Coverage badge history: 11/11 runs green since the fork, badge at 97.4% lines after 0.7.
- [x] 0.9 ADR-0021 "Local-first server architecture". It supersedes 0001, 0010 and 0013: mark those superseded and add ADR-0021 to `knowledge/index.md`.
  - [ADR-0021](adr/0021-local-first-server-architecture.md): pure `engine` / I/O-owning `server` / `web`; a localhost-only, single-user server (Fastify, MCP over stdio and HTTP, SQLite, inbox watcher, gcsim, LLM client); the web app keeps working client-only; secrets only in the server's `.env`; explain rebuilt on the server in Phase 3; no rate limiter while the server stays on localhost. 0001, 0010 and 0013 are marked superseded, and `knowledge/index.md` lists 0021.
  - Settles the tripwires 0.7 left open. `labels-core` is on the optimize worker's import path (`protocol` → `search` → `diagnostics` → `labels-core`), so its adapter-free check stays, moved under the worker boundary; planting an adapter import in it turns the suite red. The `explainShared` and `artifactValidation` checks guarded only the deleted serverless bundle and are retired (653 → 651 tests).
  - The index entry pushed `knowledge/index.md` to 61 lines and OKF failed (60-line cap). Fixed by rewriting the index intro, which still said "no backend", and tightening the closing paragraph (59 lines now, so one more ADR fits). `docs:check` now enforces OKF's known line caps (`CLAUDE.md`, `knowledge/index.md`) locally.
  - Follow-up: the index's ADR list is grouped by topic (one line per topic, ADRs linked inline) instead of one line per ADR, so new ADRs no longer cost a line. 59 → 43 lines; `CLAUDE.md`'s ADR rule says "add it to its topic line".
- [x] 0.10 Update `README.md` (fork notice and attribution, keeping `LICENSE`/`DATA_LICENSE`), `package.json` metadata, `CONTEXT.md` "What this project is", `FILE-MAP.md`, and `knowledge/` component paths
  - README rewritten for the fork: fork notice and attribution (upstream repo, its hosted demo, `LICENSE` and `DATA_LICENSE` unchanged), this repo's CI and coverage badges, a status section with the roadmap phases, the three-package architecture, and highlights, tech stack and non-goals brought in line with ADR-0021 (no Vercel, Lighthouse or "zero backend" claims). Upstream's feature list, "How it works" and data credits stay.
  - `package.json` (and the lockfile's two name fields): name `genshin-build-lab`, new description, homepage and repository. `CONTEXT.md` title and "What this project is"; `knowledge/index.md` title; `share-link.md` cites ADR-0021 instead of the superseded ADR-0001. `DATA_LICENSE` keeps its text, with its two file paths updated to `packages/engine`.
  - Checked and already current: FILE-MAP (30 directories, 158 files, every count matches the tree) and the `knowledge/` component paths (fixed in 0.3).
  - Still upstream's: `CHANGELOG.md`, and the app's own name in `packages/web/index.html` and the header ("RPG Build Optimizer"). The owner decided to keep that name (2026-09-24).
- [x] 0.11 Review the `memory/` entries that describe upstream's GitHub setup and mark or trim them
  - `autocrlf-formatcheck-gotcha` rewritten for this fork: LF everywhere (`.gitattributes` `eol=lf`, `core.autocrlf=false`), one `verify` CI job, and the lesson that still applies (`format:check` includes Markdown, so prettier every changed file). Upstream's Windows/autocrlf setup, its two CI jobs and PR #18 are kept only as labelled history.
  - The other four (Artifacts preference, spend-limit behaviour, subagent Write, token economy) record upstream's maintainer's preferences and sessions. Marked, not deleted: `origin` in their frontmatter, a note at the top, and _(upstream, unconfirmed)_ in `MEMORY.md`. `CLAUDE.md` says not to follow them until the owner confirms; the owner can keep, adopt or delete each.
  - Owner's decisions (2026-09-24): Artifacts preference kept; spend-limit entry deleted (it described upstream's account); subagent-Write entry adopted and extended so agents may leave plain-text notes in `.claude/notes/` (outside the code, skipped by Prettier); token-economy rules kept as written. No entry is marked unconfirmed now.
- [x] **Accept:** identical test results, bench within ±10% of 0.1, web app works client-only (manual smoke: sample build, GOOD import, share link)
  - Accepted by the owner on 2026-09-24. Evidence: [baseline-phase0.md](baseline-phase0.md#phase-0-result-2026-09-24-head-c06df45).

## Phase 1: Static data refresh

- [x] 1.1 Bump `genshin-db` to the latest release and regenerate the snapshot (`npm run build:data`)
  - 5.2.13 → 5.2.14 (released 2026-09-21), installed with npm 11 so the lockfile only changes that package. The snapshot gains 2 characters (Vesna, Vodyanitsa) and 6 weapons, all game version 7.1 per genshin-db. Nothing existing changed or went missing; sets and main-stat tables are identical. Rebuilding twice gives byte-identical output.
  - 651/651 tests, benchmark explored/pruned counts unchanged, bundle +367 B gzip (size:check ok). The two build warnings (a duplicate Prized Isshin Blade entry, dropped) also appear with 5.2.13.
  - `patch` stays `'6.7'` on purpose. The old snapshot already held 7.0 content (Alyosha, Odette, 12 weapons), so as a data version it was stale before this bump. But the same value also drives the Teams note "Curated from KQM guides for patch 6.7", and the curated tables were not re-verified for 7.0/7.1, so bumping it would make that claim false. 1.2 splits the two.
- [x] 1.2 Store `{genshinDbVersion, gameVersion, generatedAt}` in the snapshot. Keep `generatedAt` deterministic (for example from the package release) so the CI drift check stays reproducible.
  - From 1.1: `patch` currently means two things, the data's game version (header chip, footer) and the patch the curated tables were checked against (Teams note). Derive `gameVersion` from genshin-db (the newest `version` among included items: 7.1 as of 5.2.14) and keep a separate curation patch for the Teams note.
  - Done. The snapshot stores `genshinDbVersion` 5.2.14 (read from the installed package), `gameVersion` 7.1 (newest `version` genshin-db gives any included character, weapon or set) and `generatedAt` 2026-09-21 (that release's publish date, pinned with the version in `GENSHIN_DB_RELEASE` in `build-dataset.ts`; the build refuses to run if the pin and the installed package disagree). The old `patch` field is gone. Rebuilds stay byte-identical.
  - `CURATION_PATCH = '6.7'` (new `packages/engine/src/curation.ts`) drives the Teams note; the header chip, footer and speed-report header now show `gameVersion`. New glossary entries in CONTEXT; the runbook's version step and `DATA_LICENSE` updated.
  - The owner asked to mark new characters without usable data and fall back to the newest usable version. Checked: Vesna and Vodyanitsa have complete stats at every level, talents and constellations; all 3★+ weapons, the six 7.1 ones included, have passive text and full stat curves. HoYoverse launched 7.1 on 2026-09-23. So nothing is marked and `gameVersion` stays 7.1. They are optimised like any character, but have no curated meta target, damage profile or team entry until the curation catches up.
  - Tests: snapshot built from the installed genshin-db (fails on a bump without a rebuild; verified), version/date formats, and `CURATION_PATCH` never newer than `gameVersion`. The build's pin check was verified by setting a wrong pin.
- [x] 1.3 Show the snapshot versions in the web UI footer
  - Footer: "Data from genshin-db 5.2.14 (released 2026-09-21), game version 7.1 · Curated tables: patch 6.7". The date is a `<time datetime>`; each version is `whitespace-nowrap`, because at phone width the date and "genshin-db" otherwise broke at their hyphens. Checked in the browser at 1280 and 375 px: no horizontal overflow.
  - Test: the footer shows all four values, read from the engine's exports so a data bump never touches it (verified to fail with the genshin-db version removed).
- [x] 1.4 Add `npm run data:coverage`: per character/weapon, whether it's in genshin-db, has a curated guide or meta target, has a damage profile, and gcsim support (placeholder column until Phase 5)
  - The report is built by the engine's pure `buildDataCoverage` (`packages/engine/src/data-coverage/`, reusable by the Phase 3 server); `scripts/data-coverage.ts` prints a summary plus Markdown tables, or the raw report with `-- --json`. Rows are the union of snapshot keys and every key the curated tables use, so a curated entry missing from genshin-db shows as a gap. There is no separate "guide" table: the fork's guides are the meta targets, which the report covers (weapons as meta picks).
  - Today: 120 characters (meta target 52, damage profile 18, in a team archetype 69), 253 weapons (obtainability 86, meta pick 71), nothing curated missing from genshin-db. 51 characters have no curated data, including the 7.0 and 7.1 releases (Alyosha, Odette, Vesna, Vodyanitsa) and older ones such as Diluc, Eula and Tighnari.
  - Fixed while testing: `--json` was cut off at 64 KiB when piped, because the script exited before stdout flushed.
  - The directory is `data-coverage/`, not `coverage/`: `.gitignore` and `.prettierignore` ignore every directory named `coverage` (test-coverage output), which would have kept the module out of git and out of `format:check`.
- [x] 1.5 Update `docs/runbooks/patch-refresh.md` for the new metadata and coverage report
  - New "versions" table (what `genshinDbVersion`, `generatedAt`, `gameVersion` and `CURATION_PATCH` mean, where each is shown, what moves it). Steps reordered to the order the work happens: refresh data, read the coverage report, re-verify tables, add new characters, bump `CURATION_PATCH` last, test and benchmark. The coverage report is step 2, the worklist for the rest.
  - Added the table the runbook had missed: `invest/obtainability.ts`. The report now lists meta picks with no obtainability entry: **26 today** (Hamayumi, The Alley Flash, Sacrificial Jade, …), a gap from upstream that no test enforced. Left for a curation pass (each entry needs its wiki source), not filled in here.
  - The benchmark step now says to commit the speed report only when explored or pruned counts change, not for timing alone.
- [ ] **Accept:** the snapshot regenerates byte-identically twice in a row, and the coverage report prints
  - Evidence (2026-09-25): two `npm run build:data` runs give the same SHA-256 (`f8a2c879…`), identical to the committed file; CI's drift check has passed on every Phase 1 commit. `npm run data:coverage` exits 0 and prints 395 lines (summary plus both tables). Waiting on the owner's confirmation.

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
