---
name: subagent-spend-limit-is-5hr
description: 'How to react when subagent dispatch fails with a "monthly spend limit" message'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 47b4390b-dd27-425a-9f25-d0790b1d71e5
  origin: upstream (natcat38/rpg-build-optimizer), unconfirmed for this fork
---

> **Inherited from upstream** (natcat38/rpg-build-optimizer). This records upstream's maintainer's account and usage-limit behaviour, not a confirmed preference of this repo's owner. Follow it only if the owner confirms it (TODO 0.11, 2026-09-24).

When an `Agent` (subagent) dispatch fails with "You've hit your monthly spend limit · raise it at claude.ai/settings/usage", the user has clarified this is effectively the **5-hour rate limit**, not a true hard monthly cap.

**Why:** The message is misleading; the user does not want work paused over it.

**How to apply:** Don't treat it like the global "pause on API errors / check status page" rule. It will clear on its own — simply retry the dispatch (optionally after a short wait). Confirm with the user only if it persists across several retries.
