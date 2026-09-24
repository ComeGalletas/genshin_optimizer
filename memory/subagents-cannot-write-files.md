---
name: subagents-cannot-write-files
description: Some harness configs block report-only subagents from writing scratchpad files — environment-dependent, not universal; instruct file-first with a text fallback.
metadata:
  type: feedback
  origin: upstream (natcat38/rpg-build-optimizer), unconfirmed for this fork
---

> **Inherited from upstream** (natcat38/rpg-build-optimizer). This records upstream's maintainer's harness observations from 2026-08 (the harness fact may still hold; the sessions were upstream's), not a confirmed preference of this repo's owner. Follow it only if the owner confirms it (TODO 0.11, 2026-09-24).

Whether subagents can Write files varies by harness/session config: in one 2026-08 session report agents had Write blocked and returned reports as text; in the desktop session the same day, agents wrote repo and scratchpad files normally.

**Why:** an unconditional "return everything as text" rule bloats context (see [[token-economy-practices]]).

**How to apply:** instruct agents to write reports to a scratchpad file and return a ≤5-line summary, with an explicit fallback: "if Write is blocked, return the full report as text instead." Archive text fallbacks to files from the main session.
