# 0043. Drafted rotations: a model drafts, gcsim checks, the owner promotes

- Status: Accepted
- Date: 2026-10-05

## Context

The rotation library (ADR-0041) holds published configs, which validate
themselves by reproducing their published DPS. Most of the owner's teams
have no published config, so PLAN lets the language model draft or adapt
rotations, on one condition: a draft counts only after gcsim parses it and
runs it without errors and the owner has reviewed a frame-by-frame sample of
it. A model's rotation can be plausible and wrong (wrong action names, a
burst it can't afford, a loop that never ends); gcsim catches the first
kind, only the owner can catch the rest.

## Decision

- **Drafting is a tool.** `draft_rotation` (MCP and the chat, the same
  `accountTools`) takes the slots, the template and notes on what it was
  drafted from. It runs on the owner's equipped builds
  (`simCharacterFromAccount`), which become the rotation's reference
  builds, in KQM's standard fight, with burst waits filled unless the model
  asks otherwise. It is saved only if it passes the library's checks and
  gcsim runs it cleanly (no refusal, finished within 60 s, every character
  fully implemented); otherwise the problems go back to the model, gcsim's
  own message included. It is always saved as `draft` with
  `source.kind: "llm"`, and never replaces a rotation that isn't itself an
  LLM draft. `list_rotations` and `get_rotation` show the library, so a
  model can copy working syntax. `draft_rotation` is the only tool that
  writes; it is annotated as such.
- **Review is the owner's.** `npm run rotations -- review <id>` runs the
  rotation on its reference builds (1,000 iterations) with gcsim's sample of
  one fight (`-sample`), and writes `rotations/<id>/review.md`: the result
  per character (DPS, share, field time, energy waits), and the fight step
  by step, one row per stretch on field with the actions in KQM's notation
  (`Q N4 D E`), the team's damage and the reactions meanwhile
  (`summarizeSample`). It records the **fingerprint** of what was reviewed:
  the template, the reference builds and the meta without its status,
  validation and review.
- **Promotion is the owner's alone.** `npm run rotations -- promote <id>`
  validates a draft only if its review exists, the fingerprint still
  matches and it was made with the pinned gcsim, and asks the owner to type
  the id (or `--yes`; without a terminal and without `--yes` it refuses).
  The meta records `review: {by: "owner", date, gcsim, fingerprint, note}`.
  No tool promotes, reviews or edits a validated rotation.
- **Status rules.** A rotation that isn't a published config taken whole
  (`adapted`, `llm`, `owner`) is `validated` only with the owner's review. A
  validated rotation whose files changed since that review is refused when
  it loads, until it is reviewed again.

## Consequences

- A model can extend the library for the owner's teams without anything
  unchecked counting: what reaches `validated` ran cleanly and was read by
  the owner, and stays exactly what was read.
- The review shows what the numbers can't: who is on field when, whether a
  burst comes up late (filled waits appear as extra normal attacks), and
  where the damage comes from.
- Drafts live in `rotations/` like curated ones, so the owner sees them in
  `git status` and can commit or delete them; a draft is never used as a
  validated rotation by anything downstream (5.8 says which it used).
- The owner's builds change; the reference builds of a draft are a snapshot
  of the day it was drafted, and reviewing again uses them, not the current
  account.
