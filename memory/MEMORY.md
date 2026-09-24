# Memory index

Entries marked _(upstream, unconfirmed)_ came with the fork and record upstream's maintainer's preferences; follow them only once this repo's owner confirms them. The owner reviewed all of them on 2026-09-24, so none are marked now.

- [format:check and line endings](autocrlf-formatcheck-gotcha.md) — LF everywhere here; `format:check` includes Markdown, so prettier every changed file.
- [No unrequested artifacts](no-unrequested-artifacts.md) — only publish Artifacts when explicitly asked.
- [Subagent Write is env-dependent](subagents-cannot-write-files.md) — instruct file-first reports with a text fallback; keepable notes go in `.claude/notes/`.
- [Token economy & subagent tiering](token-economy-practices.md) — Sonnet-default tiering, diff-scoped reviews, 3–4-agent waves, file-first reports.

## How this works (any agent, any machine)

This folder is the whole memory system — no `.claude/` needed. One fact per
file, this file is the index (one `- [Title](file.md) — hook` line each).
Frontmatter: `name`, `description`, `metadata.type` (user | feedback |
project | reference). Link related facts with `[[name]]`.

Read this index at session start; read a file when its hook looks relevant.
Write new memories here, not to any agent-tool-specific memory directory.

Search is just `grep -ril <keyword> memory/` — flat folder, one fact per file,
no index rebuild needed. If it ever outgrows one screen, group by `metadata.type`.
