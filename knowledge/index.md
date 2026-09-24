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

The full decision record is in [`docs/adr/`](../docs/adr/):

- [ADR-0001 — client-side-only architecture](../docs/adr/0001-client-side-only-architecture.md) _(superseded by ADR-0021)_
- [ADR-0002 — frozen bundled reference dataset](../docs/adr/0002-frozen-bundled-reference-dataset.md)
- [ADR-0003 — stat-only model, no damage engine](../docs/adr/0003-stat-only-model-no-damage-engine.md) _(superseded by ADR-0016, amended by ADR-0020)_
- [ADR-0004 — exact branch-and-bound optimisation](../docs/adr/0004-exact-branch-and-bound-optimisation.md)
- [ADR-0005 — self-contained share links](../docs/adr/0005-self-contained-share-links.md)
- [ADR-0006 — inventory import and build-level model](../docs/adr/0006-inventory-import-and-build-level-model.md) _(amended by ADR-0015)_
- [ADR-0007 — gap analysis with frozen meta snapshot](../docs/adr/0007-gap-analysis-with-frozen-meta-snapshot.md)
- [ADR-0008 — GameAdapter seam for multi-game](../docs/adr/0008-gameadapter-seam-for-multi-game.md) _(superseded by ADR-0012)_
- [ADR-0009 — adapter owns universal game baselines](../docs/adr/0009-adapter-owns-universal-game-baselines.md)
- [ADR-0010 — serverless proxy for AI explain](../docs/adr/0010-serverless-proxy-for-ai-explain.md) _(superseded by ADR-0021)_
- [ADR-0011 — elemental DMG as single fungible stat](../docs/adr/0011-elemental-dmg-as-single-fungible-stat.md) _(amended by ADR-0014)_
- [ADR-0012 — collapse the GameAdapter seam to a concrete adapter](../docs/adr/0012-collapse-gameadapter-seam-to-concrete-adapter.md)
- [ADR-0013 — per-IP rate limiting on the AI explain proxy](../docs/adr/0013-rate-limit-ai-proxy.md) _(superseded by ADR-0021)_
- [ADR-0014 — element-aware goblet scoring](../docs/adr/0014-element-aware-goblet-scoring.md)
- [ADR-0015 — GOOD roster import](../docs/adr/0015-good-roster-import.md)
- [ADR-0016 — damage engine as an optimisation objective](../docs/adr/0016-damage-engine-objective.md) _(supersedes ADR-0003)_
- [ADR-0017 — curated comp-archetype database](../docs/adr/0017-curated-comp-database.md)
- [ADR-0018 — mode-aware team recommendation](../docs/adr/0018-mode-aware-team-recommendation.md)
- [ADR-0019 — the Plan page](../docs/adr/0019-plan-output.md)
- [ADR-0020 — 4-piece set bonuses at full uptime](../docs/adr/0020-four-piece-set-bonuses-at-full-uptime.md) _(amends ADR-0003)_
- [ADR-0021 — local-first server architecture](../docs/adr/0021-local-first-server-architecture.md) _(supersedes ADR-0001, ADR-0010 and ADR-0013)_

## v2 (shipped)

The v2 Endgame Planner turned the single-character optimiser into an account-level
planner; its decisions are ADR-0016 (damage objective) through ADR-0019 (the Plan),
linked above, and its terms are defined once in [`CONTEXT.md`](../CONTEXT.md). Team and
meta data are hand-curated per patch; the refresh checklist is
[`docs/runbooks/patch-refresh.md`](../docs/runbooks/patch-refresh.md).
