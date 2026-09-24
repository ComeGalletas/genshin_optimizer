# .claude/notes

Plain-text notes left by agents working on this repository: reports, findings,
handoff notes, anything worth keeping past a session. This folder is outside the
project's code. Nothing in the build, tests or lint reads it, and Prettier skips
it, so loose text is fine.

- Name files `YYYY-MM-DD-topic.md` (or `.txt`).
- Commit them like any other change; say in the commit what the note is for.
- Durable facts and rules belong in `memory/`, decisions in `docs/adr/`, and
  roadmap state in `docs/TODO.md`. A note here is a record, not a rule.

See `memory/subagents-cannot-write-files.md` for when agents write here.
