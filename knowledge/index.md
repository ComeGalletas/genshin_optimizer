# genshin-build-lab — Knowledge

Finds the best 5-piece build from the artifacts a player owns, under chosen constraints,
and what to farm to reach a meta target. The web app still runs client-only; a local
server adds the rest ([ADR-0021](../docs/adr/0021-local-first-server-architecture.md)).

This bundle is the agent- and reviewer-readable knowledge map. The canonical
glossary is [`CONTEXT.md`](../CONTEXT.md); decisions live in [`docs/adr/`](../docs/adr/).

## Domain

- [Artifact](/domain/artifact.md) — a gear piece with a main stat and up to four sub-stats.
- [Build](/domain/build.md) — exactly one artifact per slot, scored by an objective.
- [Constraint](/domain/constraint.md) — a hard requirement a build must satisfy.
- [Objective](/domain/objective.md) — the single stat the optimiser maximises.

## Components

- [Optimiser](/components/optimiser.md) — exact branch-and-bound top-K search.
- [GameAdapter](/components/game-adapter.md) — the concrete `genshinAdapter` owning game data and baselines.
- [Share link](/components/share-link.md) — the self-contained build snapshot in a URL.

## Data

- [Reference data](/data/reference-data.md) — the frozen game rulebook + inventory import.

## Decisions

The full decision record is in [`docs/adr/`](../docs/adr/), grouped here by topic. A new ADR joins its topic's line (`docs:check` only needs its file linked here), so this list doesn't grow a line per ADR.

- **Architecture:** [0021 local-first server](../docs/adr/0021-local-first-server-architecture.md) (supersedes 0001, 0010, 0013); [0001 client-side only](../docs/adr/0001-client-side-only-architecture.md) _(superseded)_; [0002 frozen bundled dataset](../docs/adr/0002-frozen-bundled-reference-dataset.md); [0012 concrete adapter](../docs/adr/0012-collapse-gameadapter-seam-to-concrete-adapter.md) (supersedes 0008); [0008 GameAdapter seam](../docs/adr/0008-gameadapter-seam-for-multi-game.md) _(superseded)_; [0009 adapter owns game baselines](../docs/adr/0009-adapter-owns-universal-game-baselines.md); [0022 runtime validation with zod](../docs/adr/0022-runtime-validation-with-zod.md); [0023 engine stats in percent](../docs/adr/0023-engine-stats-in-percent.md).
- **Optimiser and scoring:** [0004 exact branch-and-bound](../docs/adr/0004-exact-branch-and-bound-optimisation.md); [0016 damage objective](../docs/adr/0016-damage-engine-objective.md) (supersedes 0003); [0003 stat-only model](../docs/adr/0003-stat-only-model-no-damage-engine.md) _(superseded, amended by 0020)_; [0020 4pc bonuses at full uptime](../docs/adr/0020-four-piece-set-bonuses-at-full-uptime.md); [0011 one elemental DMG stat](../docs/adr/0011-elemental-dmg-as-single-fungible-stat.md) (amended by 0014); [0014 element-aware goblets](../docs/adr/0014-element-aware-goblet-scoring.md).
- **Import and sharing:** [0006 import and build level](../docs/adr/0006-inventory-import-and-build-level-model.md) (amended by 0015); [0015 GOOD roster import](../docs/adr/0015-good-roster-import.md); [0005 self-contained share links](../docs/adr/0005-self-contained-share-links.md).
- **Meta, teams and plan:** [0007 gap analysis](../docs/adr/0007-gap-analysis-with-frozen-meta-snapshot.md); [0017 comp database](../docs/adr/0017-curated-comp-database.md); [0018 mode-aware teams](../docs/adr/0018-mode-aware-team-recommendation.md); [0019 the Plan page](../docs/adr/0019-plan-output.md).
- **AI explain:** [0010 serverless proxy](../docs/adr/0010-serverless-proxy-for-ai-explain.md) _(superseded)_; [0013 proxy rate limiting](../docs/adr/0013-rate-limit-ai-proxy.md) _(superseded)_.

## v2 (shipped)

The v2 Endgame Planner turned the single-character optimiser into an account-level
planner; its decisions are ADR-0016 (damage objective) through ADR-0019 (the Plan),
linked above, and its terms are defined once in [`CONTEXT.md`](../CONTEXT.md). Team and
meta data are hand-curated per patch; the refresh checklist is
[`docs/runbooks/patch-refresh.md`](../docs/runbooks/patch-refresh.md).
