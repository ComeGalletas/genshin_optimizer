# 0051. Share links carry simulation results

- Status: Accepted
- Date: 2026-10-06
- Extends: [0005](0005-self-contained-share-links.md)

## Context

A share link carries a build whole (ADR-0005): request, result and its
five pieces, view-first, with no server. Phase 8 asks that links also carry
simulation results when there are some. A simulation needs the sharer's
local server, gcsim and account, none of which the recipient has, so a
link can only carry what the sharer's run measured. ADR-0005 also asked
for a decision on size: a URL that grows with what it carries can outgrow
what browsers, servers and chat apps keep.

## Decision

- **A build link carries its simulation** when it is shared from "Rank by
  Team DPS": an optional `sim` in the snapshot (rotation id, name and
  status; the teammates; iterations; team DPS with its 95% interval; its
  rank by team DPS among how many, its stat rank, whether it is tied with
  the best; the character's own DPS and share; the fight's length). The
  recipient's banner states it as the sharer's result; nothing re-runs.
  A link without `sim` reads as before, and an older app ignores it.
- **A team comparison has its own link**: `#c=` with the comparison as
  Compare Teams shows it (base and up to five variants, each run's team,
  enemy, DPS with interval and quartiles, per character, reactions,
  warnings and `vsBase`), less the sharer's cache flags. It opens in a
  view-only section, without a server.
- **Validated like build links**: every field checked and every list and
  string bounded before it reaches the DOM (`isSharedSim`,
  `parseSharedComparison`); a malformed link is a friendly "can't be read",
  never a throw.
- **Size**, measured: a build link is about 600 characters, 840 with its
  simulation (fixture), and a real one from the owner's account about
  1,330. A real comparison of a base and one variant is about 1,500, and
  the largest the app makes (base and five variants) about 2,000 to 3,000.
  A comparison goes in the **fragment** (`#c=`), which the browser never
  sends to a server, so no request-line limit applies; the encoder still
  refuses one over **16,000 characters** (`MAX_COMPARISON_PARAM`), well
  under what browsers and chat apps keep, and the decoder refuses longer
  input before inflating it. Build links stay in `?b=`, as ADR-0005 set:
  well under every limit even with a simulation.

## Consequences

- A recipient sees the sharer's numbers, for the sharer's characters and
  gear: the banner and the section say so.
- Link sizes stay small enough for any chat app; the 16,000 cap only
  guards against a crafted or pathological comparison.
- A comparison link from a later version with a new field shape fails
  closed (`v` must be 1), as build links do.
- The bundle: the size baseline rises to 205,823 B. About 1.6 KB of it is
  in what the page loads at start (the banner's simulation line and the
  `sim` checks, since `?b=` links are read on load); the rest, the shared
  comparison and the share button, is lazy.
