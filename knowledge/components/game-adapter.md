---
type: Component
title: genshinAdapter
description: The concrete object that owns all game-specific data and the universal game baselines.
resource: ../../src/game
tags: [component, architecture]
timestamp: 2026-06-26T00:00:00Z
---

# Schema

`genshinAdapter` is the single concrete object that exposes Genshin data to the rest of
the app: characters, weapons, sets, base stats, and main-stat values. The
[optimiser](/components/optimiser.md), import, and share layers import it directly. It also
owns universal game-wide baselines — e.g. the 100% base Energy Recharge every character
starts from — rather than the frozen [reference data](/data/reference-data.md) snapshot.

It was originally a `GameAdapter` interface intended to let a second game slot in behind the
same seam ([ADR-0008](../../docs/adr/0008-gameadapter-seam-for-multi-game.md)). With only one
game ever implemented and no caller overriding the default, the interface was collapsed to
this concrete adapter ([ADR-0012](../../docs/adr/0012-collapse-gameadapter-seam-to-concrete-adapter.md)).

# Citations

[ADR-0012 — collapse the GameAdapter seam to a concrete adapter](../../docs/adr/0012-collapse-gameadapter-seam-to-concrete-adapter.md)
(supersedes [ADR-0008](../../docs/adr/0008-gameadapter-seam-for-multi-game.md));
[ADR-0009 — adapter owns universal game baselines](../../docs/adr/0009-adapter-owns-universal-game-baselines.md).
Source: [`packages/engine/src/game`](../../src/game).
