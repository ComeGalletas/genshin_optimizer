---
type: Data Source
title: Reference data
description: The frozen game "rulebook" (characters, weapons, sets, stat tables) plus inventory import formats.
resource: ../../src/import
tags: [data, import]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

- **Reference data** — the game rulebook (characters, weapons, sets, stat tables) from a
  frozen `genshin-db` snapshot. It never reads a player's account.
- **Inventory** — the [artifacts](/domain/artifact.md) a player owns, loaded into the app via:
  - **GOOD file** (primary) — the community inventory-export JSON produced by scanners; full inventory.
  - **UID** (convenience) — showcased characters only, via Enka.Network.

The frozen snapshot guarantees deterministic, reproducible results and decouples the app from
any live API.

# Citations

[ADR-0002 — frozen bundled reference dataset](../../docs/adr/0002-frozen-bundled-reference-dataset.md);
[ADR-0006 — inventory import and build-level model](../../docs/adr/0006-inventory-import-and-build-level-model.md).
Source: [`packages/engine/src/import`](../../src/import).
