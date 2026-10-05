# 0041. Rotation library: templates with their fight, from published configs

- Status: Accepted
- Date: 2026-10-05

## Context

Phase 5 re-ranks builds by simulated team DPS, which needs a rotation for
each team: what every character does, in order (PLAN 5c). PLAN asked for
rotations adapted from gcsim's community config database, with credit.

Two things turned out differently from PLAN:

- **The database moved.** gcsim archived its database (Simpact) on
  2026-09-28 and stopped serving its API on 2026-10-02; KQM runs it now as
  the KQM Sim Database (`db.kqm.gg`), with the same entries and query API.
  Entries carry the full config, a description and the published result,
  but no licence; we keep what PLAN asked for (the action list and the
  builds it was checked on), credit each entry by its URL, and record no
  submitter IDs. No gcsim source is copied (it is AGPL, research note
  2026-10-05).
- **The fight belongs to the rotation.** Community configs are a finite
  loop of rotations (four or five) against a target with an enormous hp,
  so gcsim runs until the action list ends and the published DPS is over
  that span. Our config generation (5.5) never set a target hp, because a
  `while 1` list against one runs until the target dies (5.3). Cut at a
  fixed 90 s instead, the Ayaka Freeze config scores 62,079 against 67,024
  over its own 104 s: the fight's length is part of the result.

## Decision

- `rotations/<id>/` holds one rotation: `rotation.gcsl.tmpl`, the gcsim
  action list with a `{{slot}}` placeholder wherever a character acts;
  `meta.json`; and `reference.gcsl`, the build lines it was checked on.
- `meta.json` (`RotationMetaSchema`, `engine/sim/rotation.ts`, strict):
  the curated archetype it plays; the **slots**, each with the dataset keys
  that can fill it with the same actions and its role; the slot active at
  the start; the **fight**, either `actions` (enemy with an hp: the run
  ends with the action list) or `duration` (no hp, a number of seconds),
  with the enemy and the energy line; the **source** (kind, title, URL,
  date retrieved, published DPS for a config taken whole, and what was
  changed); and the **validation**: the gcsim version, date, iterations,
  DPS, spread, fight length, warnings and the distance from the published
  DPS.
- **Status.** `validated`: taken whole from a published config, it
  reproduces the published DPS within 2% on the pinned gcsim (or, later,
  the owner reviewed it: 5.7). `draft`: adapted or drafted, it has run
  cleanly but nobody has reviewed it. An LLM-drafted rotation can't be
  `validated` in its own file; promotion is the owner's (5.7).
- Every rotation is checked as it loads (`rotationIssues`): schema, a known
  archetype and characters, every placeholder a slot and every slot used,
  the status rules, and reference lines only for the slots' characters. A
  broken rotation is refused with all its reasons.
- `npm run sim:check` runs every rotation on its reference builds (1,000
  iterations) and fails one more than 2% from its published DPS;
  `--record` writes the result into `meta.json` after a new gcsim pin. A
  test holds every validated rotation to the pinned version.
- Config generation writes a target hp, radius and position only when asked
  for, and leaves the duration out when there is an hp (gcsim ignores it).
- **Burst waits** (added the same day, at the owner's request). gcsim holds
  a burst until the character has the energy and the cooldown is over,
  standing idle meanwhile. `energyWait: "attack"` (in `meta.json`, or for one
  run) splits each statement before its burst and has the character do
  their slot's `filler` (normal attacks unless set; `false` for someone who
  can't) until the burst is ready. Published rotations keep their authors'
  assumption, idle; our drafts fill.
- **Credit.** The KQM Sim Database is credited in `DATA_LICENSE`, the README
  and `rotations/README.md`, besides each rotation's own entry link.

## Consequences

- Results compare directly with published ones: the four seed rotations
  taken whole (Skirk Mono-Cryo, Raiden National, Ayaka Freeze and the
  owner's Mualani Burn-Vape) land within 0.2% of their published DPS
  through our own config generation, which is also half of the Phase 5
  acceptance.
- A team that can't keep the rotation going makes the fight longer
  instead of skipping actions: the result shows each character's wait for
  energy, which 5.8 has to report next to a build's DPS (the sample
  account's Xiangling waits 250 s in Raiden National, 356 s in all at
  7,123 DPS). Filling the waits puts the character on field, where enemy
  energy drops count in full, so the same builds finish in 153 s at
  21,995 DPS: 5.8 should run the owner's builds with waits filled.
- One seed team has no published config (Nahida Aggravate with Raiden,
  Fischl and Kuki): its rotation is an adapted draft and says so until the
  owner reviews it.
- Slots name the characters that share a set of actions; a teammate swap
  with different actions needs another rotation. Changing the enemy
  (Phase 6) edits the fight in `meta.json`, not the template.
