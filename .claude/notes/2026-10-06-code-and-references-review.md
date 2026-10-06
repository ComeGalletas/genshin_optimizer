# Code structure and references review

- Date: 2026-10-06
- Tested at: branch `fix/phase9-qa-majors` (`e220f90`, on top of `main` `9a6c04f`)
- Scope: (1) unused and redundant code across `packages/`, `scripts/` and
  config; (2) every reference between docs and code: paths, commands and
  flags, ADR and TODO citations, facts, element ids, help text and the
  glossary.
- Method: two read-only passes, then a spot-check of the findings.
  - Unused code: a TypeScript `LanguageService` over the 352 tracked
    `.ts`/`.tsx` files. It ran `findReferences` on all 810 exported
    declarations and built an import graph from the real entry points (`main.tsx`,
    workers, the `server/src/cli` files, `scripts/*.ts`, configs, the dynamic
    `import()`s). Every claim was then re-checked with a plain grep across
    `packages/`, `scripts/`, `config/`, `rotations/`, root configs and
    `.github/`.
  - References: every `ADR-NNNN` and `TODO N.N` citation (about 200 and 300),
    every path written in the docs, every `npm run` script and CLI flag
    named in docs or UI text, every fixed element id, and the glossary.
  - About 30 findings were spot-checked by hand afterwards and all held.
- Nothing was changed for this review. The fixes in this branch are listed
  separately below.

**Summary.** No reference points to a missing ADR or TODO item, every
`npm run` script and flag named anywhere exists, and no source module is
unreachable. The findings:

- 2 user-visible texts are wrong: the server help, and "step 01" in the
  Import Center.
- 18 docs are stale, mostly README, CONTRIBUTING and FILE-MAP from before
  Phases 3 to 9.
- 11 functions or store actions never run in production.
- 5 leftover workspace-wiring markers.
- 1 unused file and 1 undeclared dependency.
- About 15 duplicated helpers or tables.
- 4 unused CSS rules or theme tokens.
- 153 exports used only in their own file (optional to change).

## Fixed in this branch (for reference)

- `AppDrawer`'s `open` prop was always `true`: every caller mounts the drawer
  to open it and unmounts it to close it. So its focus-restore branch
  (`open` turning false) never ran. It was dead code and the cause of QA M2.
  The prop is gone and the restore runs on unmount
  (`packages/web/src/components/ui/Drawer.tsx`).
- `ErrorBoundary`'s comment said it was "the one boundary". There are now two,
  `ErrorBoundary` and `ViewErrorBoundary`, built on one shared class.

## 1. References

### 1.1 User-visible text that is wrong (fix first)

1. **The `start-server` help topic says `npm run server` imports the inbox and
   watches it.** It does neither (QA report m3).
   - Where: `packages/web/src/components/help/topics.ts:50`, also `:46` and the
     tip at `:55`.
   - `packages/server/src/cli/serve.ts` only opens the store and listens. The
     inbox is read by `npm run inbox [-- --watch]` (`cli/inbox.ts`) and by
     the Import Center's Scan the Inbox (`POST /imports/scan`).
2. **The Import Center says "Load Account in step 01".** Step numbers went
   with the step nav in TODO 9.4.
   - Where: `packages/web/src/import-center/ImportCenter.tsx:149`, the comment
     at `:7`, and the asserted string at `ImportCenter.test.tsx:259`.
   - It should name the Start view's "Load Account" (Change in the account
     bar).

### 1.2 Docs that the code contradicts

| Where | Says | Actually |
| ----- | ---- | -------- |
| `README.md:3` | gcsim "on the roadmap" | shipped in Phase 5 |
| `README.md:17` | Phases 0–1 done, Phase 3 in acceptance | Phases 0–9 accepted, Phase 10 current (`docs/TODO.md`) |
| `README.md:34` | "Try a sample build", one click | removed in 9.4; `App.test.tsx` asserts it is gone |
| `README.md:36` | a GOOD upload "unlocks" Roster, Teams, Plan | nothing is locked (9.5); demo data and the server load a roster too |
| `README.md:61` | `packages/server` "a placeholder until Phase 2" | the API, MCP and sim server |
| `README.md:78` | "21 ADRs" | 56 |
| `README.md:82` | Fastify, MCP SDK, SQLite "planned" | all in use |
| `packages/web/README.md:3-4` | client-only; the server "comes in Phase 3" | it uses the server when it runs; `npm run dev` is `scripts/dev.ts` (web + server) |
| `FILE-MAP.md:36` | gcsim runner "comes in Phase 5" | `packages/server/src/sim/` exists |
| `FILE-MAP.md:41` | `spec-golden.json` has 30 requests | 31 cases |
| `FILE-MAP.md:46` | `packages/web` "still fully client-only" | see above |
| `FILE-MAP.md:67` | 52 directories, 333 files | 53 rows, 355 files; `server/src`, `character-window`, `components` and `state` are each off by one; `character-window` misses `texts.ts`, `GameText.tsx`, `Constellations.tsx` |
| `docs/PLAN.md:137` | HoYoverse image URLs first, Enka the fallback | Enka first (ADR-0052, `images.ts`, TODO 9.1) |
| `docs/TODO.md:427` (9.5 note) | every view in the menu from the start | Simulate and Imports are in the menu only while the server runs (`views.ts`, `App.tsx`); TODO 9.3 describes this correctly |
| `CONTEXT.md:68` | infeasible → `NO_FEASIBLE_BUILD` | the code returns `{ status: 'infeasible' }`; the string is only in two test titles |
| `CONTEXT.md:66` | gcsim support "unknown until Phase 5" | filled from the probed support table |
| `CONTEXT.md:7`, `:49` | multi-source import, gcsim, LLM "on the roadmap" / "later" | all shipped |

Suspected, same tension as the TODO 9.5 note: `ADR-0053:22` ("The menu lists
them all; nothing is locked") and `CONTEXT.md:83` ("none locked"). The menu
hides the two server views while the server is down.

### 1.3 Contributor docs and runbooks

1. `CONTRIBUTING.md:22`: typecheck is "`tsc -b` + the API tsconfig". The script
   is `tsc -b && tsc --noEmit -p tsconfig.scripts.json`; the API tsconfig went
   in TODO 0.7.
2. `CONTRIBUTING.md:36`: the CI order is wrong.
   - CI runs `test:coverage`, not `test`.
   - CI runs `size:check` after `build`.
   - CI diffs `data`, `images` and `details.generated.json` and `texts/`
     (`.github/workflows/ci.yml:39`), not only `data.generated.json`.
3. `CONTRIBUTING.md:38` and `docs/runbooks/testing.md:57`: `bench:check`'s
   watched files omit `game/genshin/adapter.ts` and `passives.ts`, which are in
   `scripts/check-bench.ts` `WATCHED`.
4. `CONTRIBUTING.md:46`: "history stays linear (merge commits are rejected)".
   `main` has the merge commit `888a31d` (PR #7). Either the rule or the
   branch protection changed. Relatedly, `CLAUDE.md:48`'s "all work on
   `main` … no parallel branches or worktrees" no longer matches practice.
5. `CONTRIBUTING.md:56`: lists `packages/engine/src/meta/teammates.ts` among
   the tables to refresh each patch. The file was deleted (CONTEXT.md records
   it).
6. `CONTRIBUTING.md:64`: "nothing serves `/api/explain` until … Phase 3, so
   leave `VITE_AI_ENABLED` unset". The variable no longer exists anywhere, and
   `POST /explain` is served (`app.ts`).
7. `docs/runbooks/testing.md:20`: `npm test` is "what CI's `test` step runs".
   CI has no `test` step.
8. `docs/runbooks/testing.md:105`: cites
   `packages/web/src/ai/explainShared.test.ts`. It moved to
   `packages/engine/src/explain/explain.test.ts` (TODO 3.4).
9. `docs/runbooks/patch-refresh.md:44`: "Commit `data.generated.json` with the
   bump". A genshin-db bump now also regenerates `images.generated.json`,
   `details.generated.json` and `texts/`, and CI diffs all four. Following the
   runbook literally fails CI.
10. `docs/design-system.md:22` and `packages/web/src/index.css:9`: both point
    to `packages/engine/src/game/registry.ts`, which doesn't exist (it went
    with the GameAdapter seam, ADR-0012).
11. `CLAUDE.md`, "target" sections that now read as current: `npm run server`
    is "API + MCP (stdio and HTTP)" (`:57`), but stdio is `npm run mcp`; the
    server has an "import watcher" (`:28`), but it doesn't; a `data/`
    directory (`:30`) doesn't exist. Suspected: CLAUDE.md marks these as the
    target, so this is the owner's call.

### 1.4 Stale code comments

- `packages/web/src/components/landing.tsx:70-71`: an orphan comment for the
  removed hero ("Thesis-only hero: shown while the solved demo is
  computing…"), stacked above `SharedBuildBanner`'s own.
- `packages/web/src/index.css:20`: "The step nav is sticky". It's the view
  menu now.
- `packages/engine/src/labels-core.ts:55`: "the app has no element-hue
  system". `elementTone.ts` and the `element.*` Tailwind tokens exist.
- `packages/web/src/components/ui/SearchCounts.tsx:4`: "the hero proof line".
  The hero is gone.
- `packages/engine/src/sample/sampleInventory.ts:16-52, 93-96` and
  `adapter.ts:182`: justify the sample bag by the "presets" removed in 9.4.
  The bag itself is still used, by `demoAccount`.
- `packages/engine/src/index.ts:7-13` and `packages/server/src/index.ts:5-6`:
  "until TODO 0.3", "come in Phase 3". Both phases are done. See 2.2.
- `packages/server/tsconfig.json:11`: "revisited when the server gets a real
  entry point". It has had one (`cli/serve.ts`) since Phase 3.
- `.github/workflows/coverage-badge.yml:6`: "README still shows upstream's
  badge until TODO 0.10". It doesn't.

### 1.5 Glossary (CONTEXT.md)

Phase 9 terms with no entry, against the CLAUDE.md rule that new terms get
one:

- **Game art / game image** (ADR-0052: `GameImage`, `GameArt`, "Show game
  art", asset names by reference).
- **Character texts** (ADR-0056: `game/genshin/texts/<key>.json`, `GameText`).
- **Set effects** (in `details.generated.json`).

Already present: character window, character sheet, rolls, view, Start view,
account bar, help topic, demo data.

### 1.6 Element ids and scroll targets

- Every fixed id and `aria-labelledby` target resolves.
- Four section ids are never targeted: `step-load`, `step-roster`,
  `step-teams` and `step-plan` (`App.tsx`). Only `step-optimise` is used.
- `CharacterWindowDrawer.tsx:52-53` calls `goTo('optimise')` and
  `scrollToId('step-optimise')` in the same tick. Opened from another view,
  the lazy Optimise view isn't mounted yet, so the scroll does nothing. It is
  harmless, since the view opens at its top. `App.tsx:217` waits 50 ms for
  the same case; one of the two is redundant.

### 1.7 Historical, informational only

- ADR-0039's title says "30 requests"; there are now 31.
- ADR-0049 and ADR-0050 say "step 01".
- ADR-0055 gives `details.generated.json` as 258 KB / 63 KB gzipped; it is
  now 276,722 B / 66.8 KB after ADR-0056's set effects.

ADRs are records of their time, so these stay as written. No code cites
ADR-0056; `rollSplit.ts`, `texts.ts` and `GameText.tsx` cite only TODO 9.10.

## 2. Unused code

### 2.1 Never runs in production

| Where | What | Used by |
| ----- | ---- | ------- |
| `engine/src/game/genshin/adapter.ts:172` | `genshinAdapter.setName()` | nothing, tests included; 5 sites reimplement it (3.1) |
| `engine/src/plan/allocate.ts:178` | `memberFromSpec` | tests only; production uses `memberFromRun` |
| `engine/src/sim/rotation.ts:247` | `assignSlots` | tests only; `rotationConfig` and `server/src/sim/teamsim.ts:149` each assign slots their own way, with different rules |
| `engine/src/good/sidecar.ts:77` | `indexSidecar` | tests only |
| `server/src/chat/grounding.ts:112` | `sourceValues` | tests only (a one-line wrapper) |
| `web/src/components/help/Help.tsx:83` | `HelpHeading` | tests only; four production subsections build the same heading by hand (`ImportCenter.tsx` ×3, `ServerAllocation.tsx`) |
| `engine/src/game/genshin/passives.ts:42` | `REFINEMENTS` | tests only |
| `web/src/state/inventory.ts:10, 24` | the `addMany` action | tests only (10 call sites) |
| `web/src/state/optimizeRequest.ts:37, 191` | the `reset` action | tests only (`beforeEach`) |

`bruteForce` (the documented oracle), `loadSampleGOOD` and
`setImageNamesForTests` are deliberate test hooks, not findings.

### 2.2 Leftover workspace-wiring markers

These are from Phase 0, each documented as "removed once…", and their
condition was met long ago:

- `packages/engine/src/index.ts` `ENGINE_PACKAGE` and
  `packages/server/src/index.ts` `SERVER_ENGINE_DEPENDENCY`, with their two
  `index.test.ts` files.
- The `packages/server/src/index.ts` barrel: nothing imports
  `@genshin-build-lab/server`.
- `packages/engine/package.json` export `"."`: only the server marker uses it;
  everything else imports by subpath.
- `packages/engine/package.json` export `"./*.json"`: no import uses it.

Check `engine/src/boundaries.test.ts:107` before removing these: it names the
server package as a string.

### 2.3 Files and dependencies

- `packages/web/src/assets/react.svg`: a Vite template leftover with no
  references. It is the only file in `src/assets/`.
- `packages/server/src/optimize/worker-bootstrap.mjs:3` imports `tsx/esm/api`,
  but `tsx` is only a root devDependency, not declared by
  `packages/server/package.json`. It works by workspace hoisting, and would
  break if the server were installed on its own.
- Every declared dependency is used.

### 2.4 Exports used only in their own file

There are 153 of these, 37 values and 116 types: the `export` keyword can go.
The values include:

- `SOURCE_KINDS`, `SCAN_FAULT_REPEATS`, `SHEET_STATS`, `MAX_VARIANTS`
  (engine), `MERGE_LIST_CAP`, `importFile`, `importText`, `DEFAULT_PORT`,
  `MCP_INSTRUCTIONS`, `PROBE_TIMEOUT_MS`, `parseSharedComparison`,
  `isSharedSim` and `parseBuildSnapshot`.

Exporting a result type is often deliberate, so this is optional. About 67
more symbols are exported only for their tests, which is fine. The full
lists are in the reviewer's scratch output, not in the repo.

## 3. Redundant code

1. **Display names are built ad hoc.** `genshinAdapter.characterName` calls
   itself "the one place a character key becomes display copy", yet:
   - `character(k)?.name ?? k` is repeated at 9 sites: `describe.ts` ×2,
     `services.ts` ×2, `drafts.ts`, `rerank.ts`, `teamsim.ts`,
     `comparisonCharts.tsx`, `runDetails.tsx`, `TeamComparison.tsx`;
   - `weapon(k)?.name ?? k` at 10 sites, with no adapter helper;
   - `sets().find(...)?.name ?? k`, a linear scan, at 5 sites, while
     `adapter.setName` (unused) and `formatSetName` exist;
   - the server has the same three-line names table three times:
     `services.ts:176` `SIM_NAMES`, `drafts.ts:199` and `teamsim.ts:71`.
2. **The flat-stat set `new Set(['hp','atk','def','em'])` is defined 4
   times:** `constraints/describe.ts:30`, `sim/configgen.ts:41` (the ADR-0023
   boundary), `test-fixtures/simulatePlay.ts:55` and
   `scripts/build-dataset.ts:571`. It is also the complement of
   `labels-core.ts` `PCT_STATS`/`isPctStat`. `describe.ts` `amount()`
   reimplements `formatStat` with slightly different output.
3. **The 95% interval helpers are duplicated** (`Z95 = 1.96` and the
   standard error): `sim/rank.ts:35-37` and `sim/team.ts:108-109`.
4. **`MAX_VARIANTS = 5` is redefined** at `web/src/teams/TeamComparison.tsx:54`.
   The engine's `sim/team.ts:79` constant bounds the server's schema, so the
   web copy can drift from the real limit.
5. **The web hand-copies engine types** it could `import type`:
   - `local-server/imports.ts` `SourceKind`, `ScanFault`, `ImportDiff` (engine
     `merge/merge.ts`, `diff/diff.ts`);
   - `local-server/allocate.ts` `PlanMove` and `{ moves; inPlace }` (engine
     `plan/output.ts` `PlanMove`, `MoveList`).
   The server-only types (`SnapshotInfo`, `MergeRecord`, `InboxEvent`,
   `TeamRun`) are legitimate copies, since the web must not import the
   server.
6. **mulberry32 is implemented 3 times:** `optimizer/benchmark.ts:27`,
   `test-fixtures/simulatePlay.ts:39` and inline in `merge/merge.test.ts`.
7. **`round1` is defined 4 times:** `benchmark.ts:76`,
   `sample/demoAccount.ts:26`, `sample/sampleInventory.ts:67`, and
   `server/src/mcp/tools.ts:34` as `r1`.
8. **Two web `plural` helpers have different signatures.**
   `ImportPanel.tsx` `plural(n, word)` returns the word only;
   `import-center/format.ts` `plural(n, one, many)` returns the number and the
   word. There are about 7 more inline `=== 1 ? '' : 's'` sites.
9. **The object type guard is written 4 times:** `import/enka.ts:70`,
   `share/comparison.ts:72`, `server/src/llm/client.ts:85` and
   `web/src/local-server/client.ts` `isRecord` (added in this branch for M1).
10. **"Ascension → level cap" is derived from `BUILD_LEVELS` 4 times:**
    `good/normalize.ts:91` `ASCENSION_CAP`, `sim/account.ts:14` `CAPS`,
    `roster/characterSheet.ts:152` (inline), and the reverse in
    `good/export.ts`.
11. **A dead branch:** `Section`'s `n` prop (`web/src/components/landing.tsx:28,
    53`) is passed nowhere, so its `section-badge` span can't render. It is a
    leftover of the numbered steps.
12. Suspected, minor:
    - "You own N pieces of set X" is built 3 ways (`meta/gap.ts:84`,
      `plan/output.ts:194`, `Results.tsx:165`).
    - The one-line `sha256` is in both `server/src/sim/gcsim.ts:96` and
      `store/store.ts:96`.
    - `WIKI` is in both `damage/setBonuses.ts:56` and
      `game/genshin/passives.ts:82`.
    - Optional props never passed: `className`/`alt` on the `GameArt`
      components, and `className` on `Segmented`, `HelpButton` and
      `PlayGlyph`.

Checked clean:

- one fetch wrapper;
- no duplicated sleep or clamp helpers;
- no commented-out code;
- no stale feature flags;
- no leftovers of `SampleGear`, `heroExample` or the scroll spy
  (`applyPreset` is live);
- the two element-colour tables are parallel by necessity (Tailwind needs
  literal class names).

## 4. Unused CSS and theme tokens

- `.eyebrow` (`packages/web/src/index.css:234-236`) is used nowhere, which
  also leaves its `tracking-eyebrow` token (`tailwind.config.js:35`) unused.
- `backgroundImage.hairline-accent` (`tailwind.config.js:92`): no uses.
- `colors.surface.600` (`tailwind.config.js:44`): no uses.
- `.section-badge` inside `landing.tsx` is unreachable (3.11). The class
  itself is still used by `BuildCard.tsx`.

## Suggested order

1. The two wrong UI texts (1.1). Small and user-visible.
2. The docs that mislead a contributor: `patch-refresh.md`, which makes CI
   fail; CONTRIBUTING's CI order and its two vanished files; README's status.
3. Dead code with zero callers: `setName`, `addMany`, `reset`,
   `HelpHeading` (or use it), `Section`'s `n`, `react.svg`, the unused CSS
   and tokens, and the Phase 0 markers.
4. The redundant tables and helpers (3.1 to 3.10). These belong to Phase 10's
   reorganization once 10.1 sets its scope, since several cross package
   boundaries.
