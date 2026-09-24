# CONTEXT — genshin-build-lab

Single-context project. This file is the canonical glossary; use these exact terms in code, issues, tests, and docs. Decisions live in `docs/adr/`.

## What this project is

A local Genshin Impact account advisor, forked from `natcat38/rpg-build-optimizer`. Given the artifacts a player owns, it finds the best 5-piece build for a character under chosen constraints and tells them what to farm to reach a meta target; the roadmap adds multi-source import with snapshot history, gcsim simulation and an LLM interface ([docs/PLAN.md](docs/PLAN.md)). The web app runs client-only, with no accounts, and shares builds as self-contained links; a local, single-user server owns everything else. See [ADR-0021](docs/adr/0021-local-first-server-architecture.md).

## Glossary

### Game domain

- **Artifact** — a gear piece. Occupies one **slot**, has one **main stat** and up to **4 sub-stats**.
- **Slot** — one of `flower`, `plume`, `sands`, `goblet`, `circlet`. A build is exactly one artifact per slot.
- **Main stat** — the artifact's primary stat. Flower/plume are fixed (HP/ATK); sands/goblet/circlet vary.
- **Sub-stat** — a secondary stat on an artifact (≤4, none equal to the main stat).
- **Artifact set** — a family of artifacts granting **set bonuses** at 2 and 4 pieces.
- **Set bonus** — the effect from wearing 2 (**2pc**) or 4 (**4pc**) of a set. The **flat-stat** portion of 2pc is scored from the frozen snapshot; 4pc effects are scored from a curated table (see below). Hit-kind-restricted **2pc** bonuses (Noblesse's Burst DMG, Golden Troupe's Skill DMG) are still unscored. See [ADR-0003](docs/adr/0003-stat-only-model-no-damage-engine.md).
- **Set bonus (4pc, full-uptime assumption)** — a 4-piece effect turned into a number by assuming it is always active at max stacks (Crimson Witch's 3 stacks ⇒ +22.5% Pyro DMG; Blizzard Strayer ⇒ +40% CRIT Rate against a Frozen target). Curated in `packages/engine/src/damage/setBonuses.ts`, each entry carrying its **uptime assumption** and source. A **sheet** bonus reduces to a flat stat and counts for every objective; a **hit-kind** bonus ("+35% Normal Attack DMG") counts only for `avg_damage`, weighted by that hit kind's share of the character's damage profile. Effects with no honest self-buff number — enemy RES shred, healing-scaled damage, reaction-only bonuses — are listed as deliberately **unmodelled** rather than scored as zero. See [ADR-0020](docs/adr/0020-four-piece-set-bonuses-at-full-uptime.md).
- **2+2** — a build satisfying two different 2-piece set bonuses simultaneously. A 2+2 naming the same set twice is rejected at the share boundary as malformed; the optimiser defensively reads it as "≥2 of that set" so its bound stays admissible.
- **Stat keys** — `hp, hp_pct, atk, atk_pct, def, def_pct, em, er_pct, crit_rate, crit_dmg, elemental_dmg, physical_dmg, healing`.
- **Elemental DMG** — `elemental_dmg`; a **single fungible stat** combining all element-specific DMG% bonuses (Pyro/Hydro/…/Dendro). A goblet's element is tracked (`Artifact.element`) and an off-element goblet's main stat is zeroed before scoring. Physical DMG (`physical_dmg`) is separate. See [ADR-0011](docs/adr/0011-elemental-dmg-as-single-fungible-stat.md) and [ADR-0014](docs/adr/0014-element-aware-goblet-scoring.md).
- **Energy Recharge (ER)** — `er_pct`; commonly a minimum constraint (e.g. ≥160%). Every character starts from a **universal 100% base ER**; this game-wide baseline is supplied by the `genshinAdapter`, not the reference snapshot. See [ADR-0009](docs/adr/0009-adapter-owns-universal-game-baselines.md).
- **Elemental Mastery (EM)** — `em`.
- **Crit Value (CV)** — `crit_rate * 2 + crit_dmg`. A common **objective**.
- **Crit ratio** — the balance of crit rate to crit DMG (healthy ≈ 1:2). Used as a **soft tiebreak**, never a hard constraint.
- **Build level** — the single ascension-breakpoint level (default 90) at which **both** character and weapon are evaluated. See [ADR-0006](docs/adr/0006-inventory-import-and-build-level-model.md).

### Tool domain

- **Inventory** — the set of artifacts a player owns, loaded into the app.
- **Import** — populating the inventory: **GOOD file** (primary; full inventory) or **UID** (convenience; showcased characters only, via Enka.Network). See [ADR-0006](docs/adr/0006-inventory-import-and-build-level-model.md).
- **GOOD** — the community inventory-export JSON format produced by scanners.
- **Reference data** — the game "rulebook" (characters, weapons, sets, stat tables) from a frozen `genshin-db` snapshot. Never reads a player's account. See [ADR-0002](docs/adr/0002-frozen-bundled-reference-dataset.md).
- **Game version** — `gameVersion` in the reference snapshot: the newest game patch genshin-db records for any included character, weapon or set, derived at build time. Stored with `genshinDbVersion` and `generatedAt` (that release's date, not the build time). Shown in the header chip and footer.
- **Curation patch** — `CURATION_PATCH` (`packages/engine/src/curation.ts`): the patch the hand-curated tables (meta recipes, comp archetypes, damage profiles, 4pc bonuses, obtainability) were last verified against. Shown in the Teams note. It can lag the **game version**: newer characters are still optimised, without a meta target, damage profile or team slot.
- **Constraint** — a hard requirement a build must satisfy (set requirement, minimum stats, per-slot main-stat lock). Infeasible constraints → `NO_FEASIBLE_BUILD`.
- **Main-stat lock** — a constraint fixing a slot's main stat (e.g. sands = `atk_pct`).
- **Objective** — what the optimiser maximises: a stat key, `crit_value`, or `avg_damage` (the v2 damage **target function**, available only for characters with a curated **damage profile**). Computed by `objectiveValue()`/`evaluateObjective()` in `packages/engine/src/optimizer/score.ts`. A `BuildResult.score` field is this objective value minus the crit-ratio soft-tiebreak penalty — it is **not** the same number as **Build score** below, despite the shared word; see "Five things called 'score'" at the end of this glossary. See [ADR-0016](docs/adr/0016-damage-engine-objective.md).
- **Optimiser** — the exact branch-and-bound search returning the **top-K** valid builds by objective score. Always exact, never approximate. See [ADR-0004](docs/adr/0004-exact-branch-and-bound-optimisation.md).
- **Diagnostics** — per-build data the optimiser emits: binding constraints, per-slot marginal contribution, explored/pruned counts.
- **Anti-clone cap** — the v1.0 results rule preventing near-identical builds from filling the top-K.
- **Build snapshot** — the self-contained state encoded in a **share link** (character, weapon, build level, five full artifacts, constraints, objective, meta target). See [ADR-0005](docs/adr/0005-self-contained-share-links.md).
- **genshinAdapter** — the concrete object owning all game-specific data (characters, weapons, sets, base stats, main-stat values) and the universal game baselines. The optimiser, import, and share layers import it directly. (Originally a `GameAdapter` interface for multi-game extensibility, [ADR-0008](docs/adr/0008-gameadapter-seam-for-multi-game.md); collapsed to a concrete adapter — YAGNI, single game — in [ADR-0012](docs/adr/0012-collapse-gameadapter-seam-to-concrete-adapter.md).)

### v1.1 domain

- **Gap analysis** — the v1.1 centerpiece: compares the best **owned** build against a **meta target** and reports feasibility gaps, numeric shortfalls, and one grounded action. No random-roll simulation. See [ADR-0007](docs/adr/0007-gap-analysis-with-frozen-meta-snapshot.md).
- **Meta target / meta recipe** — recommended set(s), main stats per slot, ER target, crit-ratio target, endgame stat floors (`statTargets`), the guide's best-in-slot 5-star (`weapon`) and its best non-limited alternative (`weaponAccessible`), from a frozen KQM-sourced snapshot. Pre-fills the constraint builder; fully **overridable**. It is a build _recipe_, not a tier ranking.
- **Sample inventory** — the bundled, deterministic "Try a sample build" dataset (artifacts keyed `sample-…`) for instant, import-free demo (v1.1).
- **Sample preset** (a.k.a. **Sample build**) — one curated "Try a sample build" entry: a character plus a representative **constraint**, that loads the **sample inventory** and auto-runs the **optimiser**. Each preset demonstrates a different constraint mechanism (min stats, set requirement, main-stat lock).
- **Sample mode** — the app state where "Try a sample build" presets are offered: an empty inventory, or one containing only `sample-` artifacts. Importing real gear leaves sample mode, so a preset click can never overwrite owned artifacts.
- **Speed report** — the committed, reproducible benchmark (`docs/speed-report.md`, regenerated via `npm run bench`) showing how small a fraction of the brute-force build space the **optimiser** explores while still returning the exact optimum. See [ADR-0004](docs/adr/0004-exact-branch-and-bound-optimisation.md).

### v2 domain (endgame planner)

- **Damage profile** — a weighted set of stand-in hits approximating a character's rotation (multipliers transcribed at talent lv9). The input to the `avg_damage` objective.
- **Target function** — Σ weight × hit damage over a **damage profile**'s hits; the value the `avg_damage` **objective** maximises.
- **Enemy config** — the assumptions damage is computed against (enemy level and RES); default level 100 / 10% RES.
- **Build score** — a 0–100 composite of how built a roster character is (level, talents, weapon, artifact count, artifact quality), with explainable components. Computed by `computeBuildScore()` in `packages/engine/src/roster/buildScore.ts`. Distinct from the optimiser's **Objective**/`BuildResult.score` (a raw stat/crit/damage number, not 0–100) and from **Grade** below (a letter, not a number) — see "Five things called 'score'".
- **Grade** — a build's fit against a **meta target**, expressed as a letter (S/A/B/C/D): the mean of each `statTargets` entry's capped ratio (owned ÷ target). Computed by `gradeBuild()` in `packages/engine/src/meta/grade.ts`. Answers "how close to the meta recipe is this specific build", a narrower question than **Build score**'s "how invested is this character overall."
- **Comp archetype** — a curated 4-slot team recipe: one **role** per slot with ranked substitute characters.
- **Role** — a slot's function in a **comp archetype**: `on-field-dps | off-field-dps | buffer | sustain | battery | applicator`.
- **Team recommendation** — a **comp archetype** instantiated from the player's roster (real characters filling its slots).
- **Team score** — `tierWeight × mean(optionWeight × Build score)` for one instantiated **team recommendation**, computed by `teamScore()` in `packages/engine/src/teams/recommend.ts`. Ranks candidate team pairings against each other; treats **Build score** as an opaque input rather than recomputing it.
- **Endgame mode** — the endgame content a plan targets: `abyss | theater | stygian`. Spiral Abyss first.
- **Plan** — the composed output: **team recommendations** → per-member optimised builds → **farming list**. See [ADR-0019](docs/adr/0019-plan-output.md).
- **Farming list** — the deduped, name-prefixed feasibility and shortfall lines a **plan** aggregates from its members' gaps (`Plan.farming`). The UI calls it the "what to farm" list; never "shopping list".
- **Investment advice** — the ranked pull-and-craft recommendations derived from the near-miss **comp archetypes** the recommender reports (`packages/engine/src/invest/advise.ts`): which characters to pull for and which weapons to craft, ranked by the **Team score** points (specifically, its `bestPossibleScore` output) each would unlock. Acquisition advice, not levelling advice.
- **Teammates table (legacy, removed)** — `TEAMMATES` in `packages/engine/src/meta/teammates.ts` was a flat, unweighted per-character list of suggested partners with a one-line rationale, predating **comp archetypes**. It has been deleted (issue #90): `OptimizePanel`'s "Works well with" panel is now derived from `comps.ts` via `teammatesFor(characterKey)`, which picks the character's best-fit archetype slot and lists the ideal pick of every other slot as a teammate. `comps.ts` is now the single source of truth for "who teams with whom" — see [ADR-0017](docs/adr/0017-curated-comp-database.md)'s Status note.

### Five things called "score"

CONTEXT.md's own vocabulary and the code both use "score"/"grade" for five
different, non-interchangeable numbers. When writing an issue, test name, or
comment, name the specific one rather than the bare word "score":

| Term                                      | Function                                   | File                                       | Scale                                                | Answers                                                                           |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Objective** value (`BuildResult.score`) | `objectiveValue()` / `evaluateObjective()` | `packages/engine/src/optimizer/score.ts`   | Stat-dependent (raw stat, crit value, or avg damage) | "How good is this specific 5-piece build, by the objective I chose?"              |
| **Build score**                           | `computeBuildScore()`                      | `packages/engine/src/roster/buildScore.ts` | 0–100                                                | "How invested is this roster character overall (level/talents/weapon/artifacts)?" |
| **Grade**                                 | `gradeBuild()`                             | `packages/engine/src/meta/grade.ts`        | Letter S–D                                           | "How close is this build to the meta target's stat floors?"                       |
| **Team score**                            | `teamScore()`                              | `packages/engine/src/teams/recommend.ts`   | Tier-weighted mean of Build scores                   | "How strong is this instantiated team, for ranking candidate pairings?"           |
| **Investment advice ranking**             | consumes `teamScore`'s `bestPossibleScore` | `packages/engine/src/invest/advise.ts`     | Same scale as Team score                             | "Which pull/craft unlocks the most Team-score points?"                            |

`objectiveValue` is the primitive of this hierarchy — `Build score` is a
separate, independently-defined composite (not built from `objectiveValue`),
while `Grade`, `Team score`, and the investment ranking each build on the one
before it. `packages/engine/src/roster/buildScore.ts`'s "Artifact quality" component calls
`objectiveValue(artifactContribution(a), 'crit_value')` directly per piece
rather than reimplementing the `crit_value` formula, so the two surfaces
cannot silently diverge (closed by issue #97; see the architecture audit,
`docs/research/audit-2026-09/architecture.md` finding #1).
