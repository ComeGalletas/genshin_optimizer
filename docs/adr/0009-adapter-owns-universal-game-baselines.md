# 0009. Game-universal stat baselines live in the GameAdapter, not the snapshot

- Status: Accepted; amended by [0040](0040-universal-crit-baselines.md) (the crit baselines)
- Date: 2026-06-11

## Context

Every Genshin character shares a **universal 100% base Energy Recharge** — a flat baseline the game applies to everyone, on top of any per-character ER% gained through ascension. The frozen `genshin-db` snapshot ([ADR-0002](0002-frozen-bundled-reference-dataset.md)) carries the per-character, per-level stat _tables_ (including ascension ER% bonuses) but not this flat universal baseline, because it isn't per-character data — it's a game-wide rule.

Without it, ER totals read ~100% low across the whole app, so ER constraints (e.g. "ER ≥ 200") and ER-objective scores are wrong. We need the baseline applied somewhere. The candidates: bake it into the snapshot via the build script, or add it at the `GameAdapter` layer.

## Decision

The `GameAdapter` owns **game-universal stat baselines**. `baseStats()` adds the flat **+100% ER** after summing the character and weapon contributions from the snapshot.

This is **deliberate and permanent**, not a stopgap for a snapshot gap. The reasoning: the frozen snapshot's job is to mirror what `genshin-db` publishes — per-entity stat tables. A flat constant that applies to _every_ character regardless of identity is **game knowledge**, and the adapter is already the designated home for game-specific knowledge ([ADR-0008](0008-gameadapter-seam-for-multi-game.md)). The build script is **not** expected to ever carry it. A test asserts every character's `baseStats` reports ER ≥ 100%.

## Consequences

- ER totals, ER constraints, and ER-as-objective are correct app-wide; this surfaced while building the "Try a sample build" presets (a Furina ER ≥ 200 preset was infeasible until the baseline was applied).
- The frozen snapshot stays a faithful, un-editorialised mirror of `genshin-db`; re-running the build script never needs to "remember" to inject baselines.
- A second game's adapter is the correct place for its own universal baselines, keeping the optimiser game-agnostic.
- Future game-universal constants (should any emerge) have an established home — the adapter — rather than leaking into the snapshot or the optimiser.
