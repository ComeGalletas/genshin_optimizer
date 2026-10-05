# 0037. Optimizer extensions for the ConstraintSpec: ceilings, stat weights, team buffs, the enemy

- Status: Accepted
- Date: 2026-10-05

## Context

ADR-0036 defines the `ConstraintSpec`. Four of its fields had nothing to
map to: the optimizer knew stat floors but not ceilings, objectives were a
single stat, crit value or average damage, and the team and the enemy
were fixed (no buffs; level 100 at 10% resistance). ADR-0004's promise
still holds for every change: the search is exact, pruning only with
admissible bounds, and the brute-force oracle checks it.

## Decision

1. **`maxStats`** on `OptimizeConstraints`. The leaf check rejects any
   total above its ceiling. The search prunes a branch once its running
   total already exceeds a ceiling: pieces and set bonuses only add, so it
   can only end above it. No look-ahead is needed, and the bound is exact.
2. **A `weighted` objective**, the weights in `OptimizeContext.weights`: a
   sum of stats times non-negative weights. It is additive like crit value
   and single stats, so the existing scalar bound and set-bonus ceiling
   apply unchanged. `isObjective`, the guard on web and API input, doesn't
   accept it: only a spec, which carries the weights, produces it.
3. **Team buffs are part of the totals, not the base.**
   `OptimizeContext.buffs` is added to every build's totals (`totals`), and
   every bound starts from `sheetBase` (base plus buffs), so leaf and bound
   agree. Not the base, because the damage formula scales the base's
   HP/ATK/DEF by the build's percentages: a flat 1000 ATK from a teammate
   must add 1000, not 1000 × (1 + ATK%). Constraints see the buffed totals,
   as the character would in the team.
4. **The enemy** (`level`, `res` in percent) reaches the damage context
   through `buildContext`'s extras, converted to the damage engine's
   fraction there, in one place.
5. **`specToRun`** (`packages/engine/src/constraints/toRequest.ts`) maps a
   checked spec and the account to the request, these extras and the
   artifact pool (`keepEquippedOn`, `excludeArtifacts`). It extends the
   curated defaults field by field (ADR-0036) and reports what only the
   account knows: no weapon to use, an artifact id that isn't there, a
   default floor above the spec's ceiling.

## Consequences

- With none of these in a request, the search does exactly what it did:
  the benchmark's explored and pruned counts are identical.
- Every extension is held to the oracle: ceilings alone and with a floor
  and a 4pc, weights (2:1 crit weights rank exactly like crit value),
  buffs (same pieces, crit value up by exactly twice the CRIT Rate buff;
  a floor met only through a buff), and `avg_damage` with buffs and a
  ceiling (a flat ATK buff adds exactly its value to effective ATK).
- The server can now run a spec end to end; switching `optimize_build`
  and the chat to it belongs with the translator (4.3).

## Rejected alternatives

- **Buffs folded into `base`.** One line, and wrong for every
  percentage-scaled stat in the damage formula.
- **A weights object as the `Objective` itself.** It would ripple through
  every place that compares or labels objectives, share links included,
  for a value only the spec produces; a `weighted` tag plus context
  weights keeps those untouched.
- **Ceilings checked only at the leaf.** Exact, but it would walk every
  over-the-cap branch to full depth, as floors did before they got their
  own prune.
