# 0040. Universal crit baselines: 5% CRIT Rate and 50% CRIT DMG in the adapter

- Status: Accepted
- Date: 2026-10-05
- Amends: [0009](0009-adapter-owns-universal-game-baselines.md)

## Context

Every Genshin Impact character has a base 5% CRIT Rate and 50% CRIT DMG.
ADR-0009 made the `GameAdapter` the home of game-universal baselines and
added the universal 100% Energy Recharge there; the crit baselines were
never added.

genshin-db, which the frozen snapshot mirrors, folds them in only for some
characters: those whose ascension stat is CRIT Rate get the 5% inside it
(Furina: 5 at level 1, 24.2 at 90), those who ascend in CRIT DMG get the 50%
(Skirk: 50, then 88.4). Everyone else carries no base crit at all. Of 120
characters, 100 were missing the 5% and 98 the 50%. So crit totals read low
across the app (Furina's "66.1% crit rate" in the Phase 3 acceptance was
71.1% in game), crit floors asked for 5 points more than they said, and the
`avg_damage` objective's crit multiplier was understated, which can change
which build ranks first.

It surfaced in TODO 5.5's cross-check: the final stats gcsim reports for a
build were, for nearly every character, exactly 5 CR and 50 CD above ours.

## Decision

`baseStats` adds `CRIT_RATE_BASELINE` (5) and `CRIT_DMG_BASELINE` (50) to
every character, except where level 1 of the snapshot already carries that
exact value (genshin-db folded it into the ascension stat), so it is never
counted twice. The snapshot stays a faithful mirror of genshin-db
(ADR-0009); the rule lives with the other universal baseline. A test checks
every character at every level (CR ≥ 5, CD ≥ 50) and the exact values for a
character of each kind.

## Consequences

- Crit totals, crit floors and damage estimates are right app-wide. After
  the fix, our totals equal gcsim's for 8 of the 18 seed-team characters
  exactly; each of the other 10 differs by a weapon or character passive
  gcsim models and the stat engine doesn't (a separate gap).
- The crit-value benchmark counts moved slightly (the score's crit-ratio
  tiebreak reads the totals); the search is still exact (oracle tests), and
  the speed report is regenerated. `bench:check` now watches the adapter,
  since base stats feed every score.
- Saved share links and plans carry requests, not totals, so they re-score
  with the corrected baselines.
