---
name: token-economy-practices
description: Subagent model-tiering and token-economy ruleset — how to size, scope, and schedule agents so sessions don't hit the usage limit.
metadata:
  type: feedback
  origin: upstream (natcat38/rpg-build-optimizer), confirmed by this repo's owner 2026-09-24
---

> Inherited from upstream and **confirmed by this repo's owner** (2026-09-24), all rules as written. The history below is upstream's.

**Model tiering** (Claude judges, user can override):

- **Sonnet is the default** for subagents — implementation, fixes, docs, curation, mechanical work, routine reviews.
- **Opus only where genuinely warranted** — adversarial verification of subtle correctness claims, architecture-level review, hard debugging. Selectively, e.g. Opus verifiers over Sonnet finders; never an all-Opus fleet. If asked for Opus where it isn't needed, say so briefly and use the cheaper tier — unless the user insists.
- **Haiku** for pure-mechanical fan-out.
- `/code-review`: default `high --fix`; `max` only when explicitly asked.

**Scope and scheduling:**

- Reviews scope to the diff, not the whole repo, unless an audit was asked for.
- One agent per PR-sized scope; no multi-angle/adversarial fan-out unless thoroughness was asked for.
- Launch heavy fleets just after the usage limit resets; run waves of 3–4 agents with commits between waves; split big efforts into separate sessions via `/handoff`.

**Agent I/O and verification:**

- Short agent briefs that point at files instead of pasting content; agents write reports to files and return ≤5-line summaries (file-first; text return only if writes are blocked — see [[subagents-cannot-write-files]]).
- One verification gate per commit point; agents run only the tests for layers they touched.
- No live-browser checks unless the change is visual.
- CI-watching, benchmarks, installs are background shell commands, never agents.

**Crash / limit recovery:**

- After a restart or limit hit: check worktrees, branches, and open PRs BEFORE relaunching anything — agents and their work often survive.
- A killed fleet gets one gap-filler agent for what's actually missing, not a 1:1 relaunch.
- Persist plans/findings to files immediately so recovery never re-discovers.

**Why (local history):** the 2026-08 full-repo audit of this repo ran ~40 all-Opus agents, two max-effort review gates, duplicated full-suite verification, and full reports echoed into context — hitting the session usage limit three times. The [[subagents-cannot-write-files]] note also came out of that session.

Also mirrored in the user's global `~/.claude/CLAUDE.md` ("Subagents & Token Economy"); this copy is the one that travels with the repo.
