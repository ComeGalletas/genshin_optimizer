# 0048. Account-wide allocation: a scored plan, a local search, an exact pass

- Status: Accepted
- Date: 2026-10-05
- Amends: [0019](0019-plan-output.md)

## Context

ADR-0019 shares one inventory between the eight Abyss members greedily:
the carry gets first pick, each member is optimised over what earlier ones
left. It called a joint assignment "exponentially larger for a marginal
gain". Phase 7 asks for the joint assignment anyway, for any N characters
with their own specs, with a greedy-plus-local-search version (v1) and an
exact one (v2), and tests that v2 is never worse than v1.

Comparing two allocations needs one number for a plan, but the members'
objectives don't share a scale: estimated damage runs to tens of
thousands, crit value to hundreds, a stat to tens.

## Decision

- **Members** (`plan/allocate.ts`): any characters, each with an optimize
  request built from their ConstraintSpec by the same mapping a single
  search uses, the pieces their spec allows, a priority (the greedy pass's
  picking order) and a weight. `composePlan` is the eight-member case, its
  behaviour unchanged.
- **The plan's score**: each member's build score (the optimizer's own:
  the objective less the crit-ratio tiebreak) over their **solo best** (the
  best build their spec allows from everything, as if alone), times their
  weight, averaged over the weights. 1 means everyone has their own best. A
  member no build fits even alone is left out; one left without a build by
  the others counts 0.
- **v1** (`plan/improve.ts`): the greedy pass, then a local search, best
  move first until none helps: swap one slot between two members, take a
  free piece, re-optimise one member over the free pieces and their own, and
  for a member left without a build, a pair move (they re-optimise with
  another's pieces in reach, the other over what is left). Every move is
  checked as a search checks a build (constraints, off-element goblets), so
  the plan is valid and never below greedy.
- **v2** (`plan/exact.ts`): each member's top-M builds (M = 20 by default),
  on each of their four-piece cores the member's best N circlets (N
  members), plus v1's, and "no build"; the best choice of one per member with no
  artifact twice, by a **branch and bound** (members with most at stake
  first, candidates best first, bounded by what each remaining member could
  still add with what is free). PLAN said ILP with HiGHS; the problem is a
  weighted set packing of eight members by a few dozen options, which a
  hand-written exact search solves in hundreds of nodes, so the solver
  dependency and its WASM payload in the web bundle aren't needed. A node
  budget keeps a pathological case bounded; the result says when it was
  hit (`exact: false`).
- **Weights** default to the member's role (the owner's choice,
  2026-10-05): on-field DPS 2, off-field DPS 1.5, everyone else 1
  (`ROLE_WEIGHT`). They decide trades between members who want the same
  pieces, and the carry's build matters most to the team's damage. The plan
  knows each slot's role; an allocation from specs takes the role the
  character fills most in the curated archetypes (`defaultRole`), and 1 for
  one in none. A member's weight can always be given.
- **Output** (`plan/output.ts`, TODO 7.4): each member's build and share
  of their best alone; the **move list**, every planned piece not on its
  member, in plan order, following the game's swaps (equipping a piece
  another character wears gives them the piece it replaces), so each move
  names who wears the piece at that point and a swap that lands a planned
  piece on its member saves a move; and the farming list: the curated meta
  target's gaps over the pieces left to each member (ADR-0019's list), a
  share below 100% with who holds that build's pieces, a planned piece
  below its top level, and why a member has no build. The server serves
  it as `POST /allocate` and the MCP tool `allocate_team` (v2 by default;
  `v1` and `greedy` on request). The greedy pass's conflict notes are
  shown only for the greedy plan, the one they are true of.

## Consequences

- On the owner's account (eight members, 1,650 artifacts) v1 lifts the
  plan from 0.975 to 0.981, and v2 proves that optimal within each member's
  top 20 (597 nodes); the time, 67 to 95 s, is the searches.
- With equal weights the plan traded Mualani (the burn-vape carry) down to
  87.1% for Mavuika at 100%, both wanting 4-piece Obsidian Codex: the sum of
  shares is higher, which is right by the score and wrong by damage. With
  role weights it is the reverse, Mualani 100% and Mavuika 82.9%, which is
  why they are the default.
- v2 is exact only within the candidates: a build on a core outside
  every member's top-M is never seen. v1's build is always in the pool, so
  v2 ≥ v1. The circlets are there because the optimizer's anti-clone rule
  keeps at most two builds per four-piece core: with three members a
  member's third circlet on a core can be the one left, and v2 missed the
  best plan until TODO 7.5's brute force found it. The others hold at most
  N − 1 circlets, so the best N on each core are enough: with M covering
  every core, v2 is exact over every assignment. On the owner's account
  the pools grow from about 20 to 25–153 per member, and eight members
  take 1,231 nodes.
- Greedy stays the fast path (`composePlan`); v1 and v2 cost a search per
  member for the solo best, and v2 a top-M search per member. The owner's
  Mualani team (four members) takes 15 s through `/allocate`.
- The move list trusts each piece's `location` from the latest import: a
  piece moved in the game since then makes a move name the wrong wearer
  until the next import.
