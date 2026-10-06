# 0044. Simulated re-ranking: `objective: "sim"` beside `avg_damage`

- Status: Accepted
- Date: 2026-10-05

## Context

ADR-0016 gave the optimizer a damage objective, `avg_damage`: a weighted
set of stand-in hits per character (a damage profile) through the damage
formula, at full buff uptime and with no notion of time. It is exact and
fast enough to search millions of builds, but it can't see what a rotation
does: energy (a build short of ER doesn't lose damage per hit, it loses
bursts), buffs that come and go, reactions, or teammates.

gcsim (ADR-0041, ADR-0043) sees all of that, but one run takes about half a
second and the search space is millions of builds. CLAUDE.md's rule is
"exact search first, simulation second": never simulate the raw space.

## Decision

- `objective: "sim"` in a `ConstraintSpec` runs the exact search for the
  top K builds (default 20, up to 50) by a stat objective (`sim.by`, the
  character's usual one when left out), then simulates each in a library
  rotation (`sim.rotation`, or the library's one for the character) for N
  iterations (default 500), and ranks them by mean team DPS.
- **The team** is the owner's: each other slot is filled from the account
  as equipped, and those teammates' pieces are kept off-limits to the
  search unless the spec says otherwise, so a candidate never borrows a
  teammate's piece. The candidate is the character as in the account, with
  the request's weapon and the build's five pieces.
- **Burst waits are filled with attacks** (ADR-0041): the owner's builds
  may be short of energy, and idle waiting would rank builds on standing
  still. The fight still lasts as long as the rotation takes, so a build
  that can't afford its bursts on time is slower and scores lower: energy
  counts without a hand-set ER floor.
- **Statistics** (`rankBySim`, pure): each build's mean DPS with a 95%
  confidence interval of the mean (1.96 × sd / √n), how far behind the
  best it is, and whether the difference to the best is inside the noise
  of the two runs (1.96 × the standard error of the difference). Those are
  flagged as ties, the best included, and a model reports them as ties.
- Runs go through the bounded pool and the result cache (5.4), so asking
  again is instant. A character gcsim implements only partly returns the
  stat order labelled "not simulated" (5.9 completes the fallback).
- **Checks** (ADR-0036/0038): `sim` options without `objective: "sim"`
  are an issue; the rotation and teammates are resolved during the spec's
  checks, so "no rotation has Neuvillette" or "Raiden National needs
  Yelan" reach the translator while it can still fix the spec. The
  translator's catalog lists the rotations, and the golden set gets its
  31st case (the first added since ADR-0039), for the new field.

## Relationship to `avg_damage`

`avg_damage` stays the default search objective and the pre-ranking for
`sim`: it is the cheap, exact filter, and `sim` the slow, faithful judge of
its shortlist. They answer different questions: `avg_damage` is "the most
damage per hit for this character, by this profile", `sim` is "the most
team DPS in this rotation, with these teammates, over the fight". When they
disagree, `sim` is right about the rotation and `avg_damage` about nothing
it doesn't model; the result shows both ranks (`statRank`, `rank`) so the
disagreement is visible. `sim` can only reorder what the search found: a
build outside the top K is never seen, which is why K is configurable and
why the search's objective can be chosen (`sim.by`).

## Consequences

- Measured on the owner's account (4 characters, K = 20, 500 iterations):
  Raiden Shogun in Raiden National in 15.4 s (search 11.2 s, simulations
  4.2 s), Furina in Skirk Mono-Cryo in 9.1 s, against the Phase 5 target of
  2 minutes. The simulation reorders: Raiden's best by team DPS is the
  search's second, and its first ranks fourth, 2.7% behind; Furina's top
  two (the search's 19th and 18th) are tied.
- A model gets rank, team DPS with its interval, the character's own DPS
  and share, the fight's length and ties, and must say "tied" where the
  numbers can't tell builds apart.
- The answer depends on the rotation and the teammates' current gear,
  which the "understood" sentence names.
