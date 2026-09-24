---
type: Component
title: Share link
description: A self-contained URL encoding a full build snapshot, with no backend or stored state.
resource: ../../packages/engine/src/share
tags: [component, sharing]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

A share link is the entire **build snapshot** encoded into a URL — character, weapon, build
level, five full [artifacts](/domain/artifact.md), [constraints](/domain/constraint.md),
[objective](/domain/objective.md), and meta target. The link itself is the storage: opening it
reconstructs the exact state with no server call, so it works in the client-only web app.

# Citations

[ADR-0005 — self-contained share links](../../docs/adr/0005-self-contained-share-links.md);
[ADR-0021 — local-first server architecture](../../docs/adr/0021-local-first-server-architecture.md).
Source: [`packages/engine/src/share`](../../packages/engine/src/share).
