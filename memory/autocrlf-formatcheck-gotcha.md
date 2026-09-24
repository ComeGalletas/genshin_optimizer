---
name: autocrlf-formatcheck-gotcha
description: 'format:check and line endings: what holds in this fork, and the Markdown lesson that still applies'
metadata:
  node_type: memory
  type: project
  originSessionId: 47b4390b-dd27-425a-9f25-d0790b1d71e5
  origin: upstream (natcat38/rpg-build-optimizer), rewritten for this fork 2026-09-24 (TODO 0.11)
---

**In this fork** `.gitattributes` sets `* text=auto eol=lf` and the checkout uses `core.autocrlf=false`, so files are LF on every platform and a full local `npm run format:check` should match CI. Don't reformat the whole tree to fix line-ending noise (CLAUDE.md "Line endings"); if CRLF shows up, fix the checkout, not the files.

**Still true:** CI's single `verify` job (`.github/workflows/ci.yml`) runs `npm run format:check`, which is `prettier --check .` and **includes Markdown**. Files written with an editor or agent Write tool are not auto-formatted, so run `npx prettier --check` on every changed file, `.md` included, before pushing; an unformatted table or list fails CI.

**How to apply:** check the changed files, Markdown included:
`git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx|js|json|md|yml)$' | grep -v package-lock | xargs npx prettier --check`
To tell content from line-ending problems: `prettier --write` the file, then `git diff`. An empty diff means line endings only; a content diff is real formatting to commit.

**Upstream history (not this repo):** upstream ran on Windows with `core.autocrlf=true`, where ~100 files failed `format:check` locally while CI passed, and it had separate `verify` and `validate` jobs; an unformatted plan doc failed upstream's PR #18.
