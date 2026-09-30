# Handoff: cloud sessions → local checkout (2026-09-29)

State when work moved from Claude Code cloud sessions to the owner's local
checkout.

## Commit state

- `main`, `origin/main` and the cloud session branch `claude/exciting-ride-fijrv0`
  all pointed at `92289c0` (TODO 3.3, ADR-0032) before this note. Nothing
  uncommitted, nothing stashed.
- `origin/main-il80lp` is another cloud session's branch, identical to
  `92289c0`; it carries no extra work and can be deleted.
- `origin/badges` is the orphan branch CI writes `coverage.json` to. Leave it.
- Per CLAUDE.md, local work goes back to `main` in the single checkout. Pull the
  session branch into `main` first (it only adds this note, a fast-forward).

## Roadmap position

- Phase 3 in progress: 3.1–3.3 done. Next item: **3.4**, "Explain this build" on
  the server LLM client. The Phase 3 ADR line ("MCP tool surface and LLM provider
  abstraction") stays open until the provider client exists (3.4); ADR-0031 and
  ADR-0032 cover the rest.
- Phase 2 acceptance still waits on the owner's second Irminsul export (2.0).

## Verified in the cloud container on 92289c0

After `npm ci` (Node 22.22.2, npm 10.9.7, 485 packages, 0 vulnerabilities,
`npm ls --all` clean, better-sqlite3 binding loads): `npm test` 798/798,
`typecheck`, `lint`, `prettier --check .`, `docs:check` all pass. `npm run server`
answered `/health` and `/llm` (no key in the output).

## Local setup checklist

1. `npm ci` (Node >= 22). better-sqlite3 is native; reinstall after changing
   Node versions.
2. Ollama running on `localhost:11434`, then `ollama pull qwen3:8b` (the model
   in `config/llm.json`).
3. `npm run llm:check`. It never succeeded in the cloud (no Ollama there); the
   provider checks were only tested against a fake `fetch`, so this is the first
   real run. Done 2026-09-30: OK on the owner's machine (see TODO 3.3).
4. Optional: copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to try
   `"provider": "anthropic"`.
5. The server store is `var/store.sqlite` (git-ignored, created on first run).
   Import real exports with `npm run inbox` from `imports/inbox/`; real exports
   stay out of git.
