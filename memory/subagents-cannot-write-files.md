---
name: subagents-cannot-write-files
description: Some harness configs block report-only subagents from writing scratchpad files — environment-dependent, not universal; instruct file-first with a text fallback.
metadata:
  type: feedback
  origin: upstream (natcat38/rpg-build-optimizer), confirmed by this repo's owner 2026-09-24
---

> Inherited from upstream and **adopted by this repo's owner** (2026-09-24), extended with repo notes (below).

Whether subagents can Write files varies by harness/session config: in one 2026-08 session report agents had Write blocked and returned reports as text; in the desktop session the same day, agents wrote repo and scratchpad files normally.

**Why:** an unconditional "return everything as text" rule bloats context (see [[token-economy-practices]]).

**How to apply:** instruct agents to write reports to a scratchpad file and return a ≤5-line summary, with an explicit fallback: "if Write is blocked, return the full report as text instead." Archive text fallbacks to files from the main session.

**Repo notes (owner's addition, 2026-09-24):** agents may also leave plain-text notes inside the repository, outside the project's code, in [`.claude/notes/`](../.claude/notes/README.md). Use it for reports, findings or handoff notes worth keeping past a session (cloud scratchpads are wiped when the container goes). Plain text or loose Markdown is fine: Prettier skips the folder, and nothing in the build, tests or lint reads it. Name files `YYYY-MM-DD-topic.md`, and commit them like any other change.
