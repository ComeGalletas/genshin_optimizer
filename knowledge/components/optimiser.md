---
type: Component
title: Optimiser
description: The exact branch-and-bound search returning the top-K valid builds by objective score.
resource: ../../packages/engine/src/optimizer
tags: [component, optimisation, web-worker]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

The optimiser searches the space of [builds](/domain/build.md) for the top-K that satisfy
every [constraint](/domain/constraint.md), ranked by the [objective](/domain/objective.md).
It is **exact branch-and-bound, never approximate** — pruning explores only a small
fraction of the brute-force space while still returning the true optimum. It runs in a
Web Worker to keep the UI responsive (`packages/web/src/workers`).

- **Diagnostics** — per-build data the optimiser emits: binding constraints, per-slot
  marginal contribution, explored/pruned counts.
- **Speed report** — the committed, reproducible benchmark
  ([`docs/speed-report.md`](../../docs/speed-report.md), regenerated via `npm run bench`).

# Citations

[ADR-0004 — exact branch-and-bound optimisation](../../docs/adr/0004-exact-branch-and-bound-optimisation.md).
Source: [`packages/engine/src/optimizer`](../../packages/engine/src/optimizer).
