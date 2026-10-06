# 0019. The Plan page

- Status: Accepted (amended by [0048](0048-account-wide-allocation.md))
- Date: 2026-08-20

## Context

Everything before this ADR answers one question at a time: what is the best
build for _this_ character ([0004](0004-exact-branch-and-bound-optimisation.md)),
what should they farm for it ([0007](0007-gap-analysis-with-frozen-meta-snapshot.md)),
how much damage would it do ([0016](0016-damage-engine-objective.md)), who should
they run it with ([0017](0017-curated-comp-database.md),
[0018](0018-mode-aware-team-recommendation.md)).

A player clearing Abyss has a different question: _what do I do next?_ Answering
it means eight builds at once — and eight independent optimisations over the
same inventory hand the same five-star piece to four different characters.

## Decision

`composePlan` turns two recommended teams into eight exact optimisations plus
one farming list.

**Allocation is greedy in priority order.** The higher-scoring team goes first;
within a team, on-field DPS, then off-field DPS, then everyone else in the
archetype's own slot order. Each member is optimised over what previous members
left, and their winning build's five pieces leave the pool.
`// ponytail: greedy allocation — a joint 8-way assignment is exponentially
larger for a marginal gain over "the carry gets first pick", which is what a
player would do anyway.` When a piece a later member's meta set wanted has
already gone, that is recorded as a **conflict** note rather than silently
absorbed.

**Per member**, constraints come from `META_TARGETS` when the character has an
entry; the objective is `avg_damage` when they have a damage profile, else the
meta objective, else `crit_value`; the damage profile's ER floor is merged in
only when the meta recipe didn't set one. A member with no equipped weapon in
the export yields an infeasible result and a farming line — never a throw.

**Nothing runs on mount.** Eight solves are not free, so the plan runs on an
explicit button press, reporting `n/8` as it goes.

**Nothing new is persisted.** The plan derives from the roster and inventory
stores; a reload recomputes it on demand.

The optimiser is unchanged in kind — this is composition, not a new solver.
[0007]'s gap analysis becomes a per-member component of the farming list, and
the single-character flow stays exactly as it was.

## Consequences

- The plan answers "what do I do next" in one screen, at the cost of being
  sequential: 8 solves, worst case tens of seconds on a full 549-artifact
  inventory (see below).
- Greedy allocation means the plan is order-dependent: a different team ordering
  could produce different (never better for the carry) assignments.
- **Known cost**: on the owner's real account the plan takes ~58s end to end,
  dominated by one member (Xingqiu, ~27s: a 4pc-set requirement with three
  unlocked 100+ piece slots and an `avg_damage` objective whose bound stays
  ~2.5× the optimum). Two admissible prunes landed with this phase — ordering
  slots by pool size, and a `minStats` reachability bound — taking the plan from
  ~82s to ~58s and unrelated searches (e.g. a constrained `crit_value` Yelan)
  from 14.6s to 0.5s. Closing the remaining gap needs a structurally tighter
  bound for 4pc requirements (only one slot may be off-set, so the other four
  pools could be restricted to that set); deliberately not done here.
