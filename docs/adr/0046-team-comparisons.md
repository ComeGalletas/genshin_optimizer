# 0046. Team comparisons: a base team and labelled variants, compared

- Status: Accepted
- Date: 2026-10-05

## Context

Phase 6 answers "what if": swap a teammate, change a weapon or a set, use
another rotation, face other enemies. Each answer is a team DPS difference,
and a difference between two Monte Carlo runs is only worth citing with its
noise ("Kazuha swap: +7.4% ± 1.2%", PLAN). The pieces exist: the rotation
library (ADR-0041), the owner's characters as gcsim sees them (5.7), the
optimizer for "the best build with this set", the bounded pool and cache
(5.4), and the "not simulated" fallback (ADR-0045).

## Decision

- **`simulate_team`** (MCP and the chat; `Services.simulateTeam`) takes a
  base rotation from the library and up to five **variants**, each with a
  label and any of: `swap` (who replaces whom), `weapons`, `builds`
  (explicit artifact ids, or conditions the optimizer fills from the
  account with the teammates' pieces left alone), `rotation`, `enemy`
  (level, resistance in percent, number of targets). The request schema is
  `TeamSimSpec` (`engine/sim/team.ts`, strict).
- **The base** fills each slot with the first of its characters the owner
  has, as equipped. A base that can't be built is an error; a variant that
  can't be built says why in `problems` and the others still run.
- **A swap only within a slot.** A rotation's actions are written for its
  characters (Kazuha's plunge, Sucrose's hold), so swapping to someone the
  slot doesn't take is refused, naming the library's rotations that have
  them, or suggesting a draft. A "teammate swap" across kits is a
  `rotation` variant.
- **Several targets**: copies of the rotation's target, 2 apart on a line
  through it. Team DPS is the total over all targets.
- **Comparison** (`compareToBase`): the difference in percent of the base,
  the half-width of its 95% interval (1.96 × the standard error of the
  difference of two means, over the base's mean), whether that interval
  holds zero (`withinNoise`), and the text an explanation cites, rounded to
  0.1: "+7.4% ± 1.2%", "−3.6% ± 0.3%". The tool tells the model to cite
  that text as it is and to call a within-noise variant no different.
- Everything runs in parallel through the pool and its cache, burst waits
  filled (the owner's builds, ADR-0041), 1,000 iterations by default.

## Consequences

- One request answers several what-ifs at once; on the owner's account a
  base and five variants took 22 s, one of them an optimizer search.
- Every number an explanation needs is in the tool result, already
  formatted, which is what 6.3's grounding test checks.
- The answers are about the owner's characters as they are: a teammate
  with no artifacts in the import (the owner's Xingqiu) runs without any,
  which the result shows (`team[].sets`).
- Positions of extra targets are an assumption of ours, not gcsim's or
  KQM's; AoE comparisons depend on it and say so here.
