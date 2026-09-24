---
name: no-unrequested-artifacts
description: 'User does not want Artifacts published unless explicitly requested (global preference, 2026-08-20)'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 99087584-9048-40ed-a7d5-80c826109456
  modified: 2026-08-19T16:20:44.197Z
  origin: upstream (natcat38/rpg-build-optimizer), confirmed by this repo's owner 2026-09-24
---

> Inherited from upstream and **confirmed by this repo's owner** (2026-09-24). The history below is upstream's.

Don't publish claude.ai Artifacts proactively — only when the user explicitly asks.

**Why:** On 2026-08-20 I published a plan-overview artifact unprompted; the user said "next time don't need to create artifacts unless i request it globally."

**How to apply:** Deliverables go in repo/working-directory files only. Also recorded in the global `~/.claude/CLAUDE.md` under "## Artifacts".
