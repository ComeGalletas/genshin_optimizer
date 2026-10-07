# Implementation plan: genshin-build-lab

Each phase ends with acceptance criteria. Don't start the next phase until the owner confirms the current one.

## Feature set

**Inherited from the template (keep working throughout):** GOOD import and Enka UID preview, roster dashboard with build grades, a per-character guide page (exact best artifact build, weapon switch, talent priority, constellation guidance, team comps), gap analysis against meta targets, self-contained share links, example-gear demo, and "explain this build."

**New:**

1. Multi-source ingest: Irminsul + OCR scanner + Enka, merged and reconciled, with snapshot history.
2. A local server and MCP server so an LLM (local or cloud) can drive everything.
3. Natural-language **conditions** turned into a validated `ConstraintSpec`.
4. **Combat rotation simulation** via gcsim: DPS re-ranking of the optimizer's candidates, team comparisons, and a rotation library.
5. Account-wide allocation: builds for several characters at once without sharing artifacts.

---

## Phase 0: Fork and baseline

- Fork `natcat38/rpg-build-optimizer`, run its full test suite, `bench`, and build, and record the baseline numbers.
- Restructure into the `packages/{engine,server,web}` monorepo **without behavior changes**, moving the optimizer, import, game and meta code into `engine`. Every existing test must still pass.
- Remove the Vercel-specific parts (`api/`, `vercel.json`, Upstash rate limiting). The explain feature is rebuilt locally in Phase 3.
- Write ADR "Local-first server architecture (supersedes the client-only and serverless-proxy ADRs for this fork)."

**Accept:** identical test results and bench numbers within ±10% of the baseline, and the web app works client-only as before.

## Phase 1: Static data refresh

- Update the `genshin-db` snapshot to the latest release, store `{genshinDbVersion, gameVersion, generatedAt}` in the snapshot, and show it in the UI footer.
- Add a data-coverage report: for every character and weapon, whether it's present in genshin-db, has a curated guide, and is supported by gcsim (the last column gets filled in Phase 5).

**Accept:** snapshot regenerates reproducibly, and the coverage report prints.

## Phase 2: Multi-source ingest

### 2a. Normalization

- `engine/good/normalize.ts` validates any GOOD file (zod schema) and normalizes keys, units and locations.
- Keep source-specific extra fields (for example Irminsul's unactivated or initial substat rolls, if present) in a **sidecar** keyed by artifact fingerprint instead of dropping them.

### 2b. Source adapters (all read files from `imports/inbox/`)

- **Irminsul:** its GOOD export. This is the primary source (exact values, full inventory).
- **OCR scanners:** Inventory Kamera, AdeptiScanner, or `genshin-agent`'s own scanner GOOD output. This is the fallback source, for when a patch breaks Irminsul ([ADR-0026](adr/0026-irminsul-primary-ocr-fallback.md)).
- **Enka:** a UID fetch for showcase characters (equipped gear only).
- A file watcher on the inbox auto-imports and tags each snapshot with `{source, importedAt, gameVersion?}`.

### 2c. Merge and reconcile

- The artifact fingerprint is `set + slot + rarity + level + mainStat + sorted substats (rounded)`. Match across sources on it, with a fuzzy fallback for OCR rounding differences.
- Precedence is Irminsul > OCR > Enka for values. The most recent snapshot wins for location (who has it equipped).
- A **reconciliation report** lists items only in A, items only in B, and value mismatches beyond tolerance. Its main purpose: after a game patch, if Irminsul's export breaks or goes stale, the OCR cross-check exposes it.
- Snapshot history in SQLite, plus a "what changed since last import" diff (new artifacts, upgrades, re-equips).

**Accept** (revised 2026-09-28, [ADR-0026](adr/0026-irminsul-primary-ocr-fallback.md)): re-importing the same Irminsul file changes nothing; two Irminsul exports taken at different times give a correct "what changed" diff (new pieces, levelled pieces, re-equips); and a faulty OCR scan (long runs of repeated entries) is detected and reported, not merged as the inventory. Originally: ≥ 98% artifact matches between an Irminsul and an OCR export, which measured the scanner rather than the app.

## Phase 3: Local server, MCP, and LLM client

- Fastify API exposing the engine: `/account`, `/characters/:id`, `/optimize`, `/allocate`, `/sim`, `/imports`.
- An MCP server over stdio (for Claude Desktop and Claude Code) and streamable HTTP, with tools:
  - `get_account_summary()`, `list_characters(filter?)`, `get_character(id)`
  - `query_artifacts(filter)`: set, slot, main stat, substat thresholds, location, locked
  - `optimize_build(character, constraintSpec, topK?)`
  - `compare_builds(buildA, buildB)` for the stat diff
  - `simulate_team(teamSpec, rotationId, options?)` (from Phase 5)
  - `allocate_team(characters[], specs[])` (from Phase 7)
  - `get_import_report()`: the latest reconciliation and diff
- The LLM client follows `config/llm.json` (Ollama, Anthropic, or OpenAI-compatible). "Explain this build" is rebuilt on top of it, with the same prompt shaping as the fork's `ai/` module.
- A chat panel in the web UI uses the same tool loop as MCP (the model calls tools, the server executes them).

**Accept:** Claude Desktop connected over MCP answers "what's my best Furina build with ≥ 180% ER?" using only tool results, and the local Ollama model does the same, with a noted quality difference.

## Phase 4: Conditions → ConstraintSpec

- `engine/constraints/spec.ts` is a versioned zod schema:
  - `setRequirements` (4-piece, 2+2, any), `mainStats` per slot, `minStats` (for example `er_pct >= 180`, in percent per ADR-0023), `maxStats`
  - `objective`: stat-weight vector | crit value | `sim` (Phase 5)
  - `exclusions`: artifacts locked to other characters, `keepEquippedOn: [...]`
  - `teamBuffs` and `enemy` (for example a resistance override), which are passed through to the sim
- An LLM translator prompt turns a natural-language request into a spec, then the spec goes through **zod validation**. The spec is shown to the user as a readable summary before running ("I understood: ...").
- Golden tests: 30 natural-language requests paired with expected specs. Run them against the local and cloud models and report accuracy.

**Accept:** at least 90% exact-match on the golden set with the cloud model (the local model's score is reported), and an invalid spec never reaches the optimizer.

## Phase 5: Combat rotation simulation (gcsim)

### 5a. Runner

- `sim:check` downloads or validates the pinned gcsim CLI and runs the sample configs.
- `server/sim/runner.ts` writes the config to a temp file, runs gcsim with a timeout and iteration count, and parses the JSON result (mean DPS, standard deviation, per-character damage, reactions, energy/ER warnings).
- A worker pool with bounded concurrency. Results are cached by hash of (config + gcsim version).

### 5b. Config generation

- `engine/sim/configgen.ts` builds a gcsim config from our data: characters (level, constellation, talents), weapon (level, refinement), artifact sets, and the **exact summed stats** from the chosen artifacts, plus options and target.
- Verify the syntax against the official docs (docs.gcsim.app) and sample configs. Do not trust any syntax written in this plan. gcsim also imports GOOD directly, so compare against its own import as a cross-check.
- Unit conversion tests: our stat totals must equal gcsim's reported stats for the same build.

### 5c. Rotation library

- `rotations/<archetype>/` holds a gcsim action-list template with character placeholders, plus `meta.json` (team slots, required characters, duration, source/credit, validated gcsim version).
- Seed it with a few rotations for teams the owner actually plays, adapted from gcsim's community config database (credit the source).
- The LLM **may draft or modify rotations**, but a draft is only accepted after gcsim parses it, runs it without errors, and the owner reviews the sample frame-by-frame summary. Drafts are saved as `status: draft`, never as validated.

### 5d. DPS re-ranking

- `objective: sim` in a spec runs the stat-objective optimizer to get the top-K (default 20, configurable), simulates each in the team rotation, and returns candidates ranked by mean DPS with confidence intervals. Differences inside the noise are flagged as ties.
- If a character or weapon isn't supported by the pinned gcsim version, fall back to stat-only with an explicit "not simulated" label, and the coverage report marks it.

**Accept:** golden tests where 3 community configs reproduce their published DPS within ±2%, and re-ranking returns results for a 4-character team in under 2 minutes for K=20 at 500 iterations. Tune the numbers against the benchmark.

## Phase 6: Team comparisons and conditions

- `simulate_team` variants cover swapping a teammate, a weapon, or a set; changing the rotation; and changing enemy settings (resistance, count, level).
- A comparison view shows the DPS distribution, damage share per character, reaction counts, and energy warnings.
- LLM explanations must cite sim outputs ("Kazuha swap: +7.4% ± 1.2% team DPS").

**Accept:** a 3-variant comparison runs from one chat request, and the explanation's numbers match tool outputs exactly (tested).

## Phase 7: Account-wide allocation

- Problem: assign artifacts to N characters with no piece used twice, maximizing a weighted sum of each character's objective, subject to each character's spec.
- v1 is greedy by priority order with a local-search improvement pass (swap pieces between characters).
- v2 is an ILP over each character's top-M candidate builds (HiGHS via its JS/WASM build, or an equivalent), exact within the candidate pool.
- Output: one plan, the list of moves ("move sands X from Neuvillette to Furina"), and a farming list for gaps.

**Accept:** on synthetic inventories, v2 ≥ v1 on every test and matches brute force on small cases, and the plan never reuses an artifact (property test).

## Phase 8: UI

- Import center (sources, snapshots, reconciliation report, diff), chat panel, sim results and comparison view, rotation library browser, allocation plan view.
- The share links from the fork also carry sim results when present (ADR on size limits).

## Phase 9: UI refresh

- Game images for characters, weapons and artifacts, **referenced, never copied into the repo**: the dataset build records each one's asset name from genshin-db; the app links Enka's by asset name first (Enka serves every item; HoYoverse's genshin-db URLs miss the newer ones), HoYoverse's own as the fallback, and its own glyph or initials last. A "Show game art" setting (on by default) turns them off, since each image load reaches that host. ADR.
- Separate views instead of one long page: Roster, Teams, Plan, Optimise (with Results and Rank by Team DPS), Simulate (Rotation Library and Compare Teams) and Imports (Import Center), each at its own address and loaded when opened; Simulate and Imports only while the local server runs. Share links open their view (`?b=` Optimise, `#c=` Simulate). ADR.
- Load once, and start empty: no demo or tutorial content on first load (no hero demo numbers, no "try a sample build" walkthrough). The app opens empty with three choices: the demo data, the account on the local server (when it runs), or a new source (a GOOD file, a UID, or pieces by hand). Once something is loaded, loading collapses to an account bar ("1,650 artifacts · 94 characters · local server, imported … · Change") that brings the three choices back.
- Nothing locked: every view reachable from the start, a view that needs a roster saying so in place with one action.
- In-app help: each view's sections open with a short description of what they do, and a "?" button beside a section's title (and its subsections' where useful) opens a larger panel with the steps to follow: how to load data from each source, how to read a result, what a control does. On demand, never in the way.
- Long sections tightened: the rotation library as a grid of compact cards with details in a drawer; Compare Teams' form and results grouped.
- A character window, opened wherever a character can be clicked, showing their current state: the weapon (level, refinement, base ATK and substat, the passive at that refinement, its description), the stat sheet as base + artifact gains = total (HP 13,103 + 9,820 = 24,931), the talents at their base level with +3 where a constellation raises one, and each equipped artifact with its substats; the character's splash art behind it. All values at the exact current level and ascension: the dataset carries the game's growth curves and ascension bonuses.
- The character window's quality pass, after the owner's review: three tabs (Overview with Teams, then Recommended, then Optimise at the bottom; Stats; Gear); a larger name with a small Optimize button beside it on Stats and Gear; the talents on Stats, each opening to its description and its values at the level that applies (constellations included); the active constellations with their descriptions below the stats; the active set effects under the artifacts; each artifact's main stat on its own line, with its element; each substat's rolls (the first roll exact from Irminsul, the upgrades where the total fixes them).

**Accept:** the app opens empty, with no demo or tutorial content, and offers demo data, the local server's account or a new source; every view is one click away from the start, nothing locked; with an account loaded, loading is one bar; every character, weapon and artifact the app shows has its game image or the fallback; existing share links still open; every view's sections describe themselves and offer their help; the first load is no larger than before Phase 9.

## Phase 10: Reorganization

Moving elements and functions around, and adding new ones, to the owner's scope (TODO 10.1, still growing).

- Teams and rotations linked: a recommended team shows its rotations, and Simulate starts from the owner's teams.
- Teams come from the same sources as the character builds (10.2). They load with character data (an optimization, the character window), asynchronously and with loading indicators, rather than up front.
- Rotations become the owner's own data, persisted locally for now, with a rotation builder: by hand, or designed by the language model under the existing draft and review rules (ADR-0043).

- More guide sources for the build and team previews, beside KQM's. genshin-builds.com is extracted at data-build time into a checked schema: facts only, each with its URL and date, reviewed by the owner before use. genshin.gg replaced Game8 as the third source on 2026-10-07 (TODO 10.2): its robots.txt allows crawlers and it links no terms of use, while Game8's terms forbid reproduction and unauthorized software. The previews compare the sources and name them. ADR.
- On the side: a hover window for weapons only (its passive at its refinement, its stats at its level).
- Roll evaluation: each piece's roll value, roll luck, distance to the best piece of its kind and exact percentile among all possible +20 pieces, from the game's roll rules; exact rolls from Enka for showcased characters; a link to Akasha's leaderboards. ADR.
- To consider for later: Stygian Onslaught teams beside the Spiral Abyss ones.

**Accept:** settled with the owner once the scope is.

---

## Backlog

- Own OCR scanner in `genshin-agent` (reusing its capture and perception) as a third source.
- Artifact "potential" scoring using Irminsul's roll data (expected value of leveling a +0 or +4 piece for a given spec).
- Resin planner: what to farm next, based on the gap analysis and allocation.
- Theater and Abyss presets: enemy settings and team restrictions as spec templates.
