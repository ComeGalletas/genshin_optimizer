# 0024. Levelling prospects by expected value, apart from the optimizer

- Status: Accepted
- Date: 2026-09-28

## Context

Most of an account's artifacts are not levelled: in the owner's Irminsul
export (2026-09-27), 1,265 of 1,650 5★ pieces are at +0 and only 309 at +20.
The optimizer scores what a piece is now, so an unlevelled piece with good
lines always loses to a levelled one with mediocre lines, and the app can't
answer "which of these are worth my EXP?".

Since patch 5.5 the game shows all four lines of a 3-line piece, the fourth
greyed out until +4 activates it, and Irminsul exports it as
`unactivatedSubstats`. So every line of an unlevelled piece is known. What
isn't known is where its remaining rolls will land, or how big they will be.
The rolls themselves are well understood (sources in
`game/genshin/substatRolls.ts`), and the owner's export confirms them:

- Every roll is one of four tiers, about 70/80/90/100% of the maximum, and
  equally likely. All 6,600 first rolls in the export sit on a tier, spread
  evenly across the four.
- A 5★ piece is upgraded 5 times (+4 to +20). Each upgrade adds one roll to
  one of the 4 lines, chosen uniformly. For a 3-line piece the first upgrade
  only activates the fourth line.
- Irminsul's `initialValue` gives each line's first roll. Rewinding the 309
  +20 pieces to their first rolls, their later rolls average 85.1% of the
  maximum, against the model's 85%.

The owner decided the shape (2026-09-27): a separate ranking, not a change to
the optimizer; the average outcome, not the best or worst case; and upgraded
pieces that rolled well come first, with ties going to proven rolls.

## Decision

1. **The optimizer is unchanged.** It keeps scoring current stats exactly
   (ADR-0004). Prospects are a separate engine module
   (`packages/engine/src/prospects/`), pure like the rest of the engine.
2. **Projection by expected value.** A 5★ piece below +20 is projected to its
   expected +20 substats: each line's current value plus
   (random rolls left ÷ 4) × the mean roll, where the mean roll is the
   average of the stat's four tiers (85% of the maximum). A 3-line piece gets
   its unactivated line and one random roll fewer. A +20 piece is its own
   projection.
3. **Ranking.** Pieces are ranked within their slot and main stat (and
   element, for an elemental DMG goblet), by the objective's value over the
   substats at +20: exact for upgraded pieces, expected for prospects. At an
   equal score, as shown (one decimal), the piece with fewer rolls left to
   chance ranks first, so an upgraded piece beats a prospect. Expected value
   regresses to the mean, so an upgraded piece that rolled well stays above
   most prospects without any extra penalty.
4. **Nothing is guessed.** A piece the model can't project is listed as not
   projected, with the reason: a 4★ piece (`not-5-star`), a 3-line piece
   below +4 whose fourth line the source didn't export (OCR sources today:
   `fourth-line-unknown`), or a line count the game can't produce
   (`inconsistent-lines`). `normalizeGOOD` keeps the unactivated line only
   where the game can have one (3 active lines, below +4, a stat the piece
   doesn't already have) and reports anything else as a GOOD issue.
5. **Back-tested on real rolls.** The engine tests rewind the owner's 309 +20
   pieces to their first rolls and project them. The fixture holds only
   substat lines (stat, first roll, value at +20): no set, slot, location or
   account data.

## Consequences

- `npm run prospects -- <file>` prints the ranking for a GOOD file today; the
  Phase 3 server and MCP layer can call the same `rankProspects`.
- The back-test shows the projection's limit. The total roll mass matches
  within 0.1%, but the owner's +20 pieces got more crit rolls than chance
  gives (422 against 395 expected), so the projection sits 3.5% under their
  crit value. They are survivors: a piece whose early rolls miss tends to be
  abandoned before +20. That selection is the player's, after each upgrade;
  the projection is the honest prior before it.
- Only 5★ pieces are projected. 4★ pieces rarely matter at the level cap this
  app targets, and their roll table would be a second one to maintain.
- The roll tiers are hand-written game data, not from genshin-db. If the game
  ever changes them, the test pinning them against the values the game shows
  is the place that fails.

## Rejected alternatives

- **Project inside the optimizer.** Mixing expected and actual stats in one
  exact search would make its results neither exact nor explainable, and
  would recommend equipping pieces that don't have the stats yet.
- **Best or worst case.** Max rolls on the best lines overrates every
  prospect; min rolls makes none worth levelling. The mean is the one
  unbiased number, and the back-test checks it.
- **Full distribution per piece** (probability of reaching a target CV). More
  informative, but a ranking needs one number, and the distribution can be
  added later on the same projection without changing this decision.
- **A fixed discount on prospects.** The owner's tie rule already favours
  proven rolls, and regression to the mean does the rest; a tuned factor
  would be a number with no source.
