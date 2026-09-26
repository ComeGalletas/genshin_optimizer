# 0023. Engine stats stay in percent, as GOOD and the fork store them

- Status: Accepted
- Date: 2026-09-26

## Context

This fork's `CLAUDE.md` said engine code should use "the game's internal units
(for example crit rate 0.311, not 31.1%)". The engine inherited from upstream
does the opposite, everywhere: percentage stats are stored as percentages. The
reference snapshot has a character's base crit rate as `5`, meta recipes set
floors like `erTarget: 130`, Crit Value is `crit_rate * 2 + crit_dmg` over
percentages, and share links and persisted inventories carry the same numbers.
GOOD, the format every data source produces, also stores percentages
(`critRate_: 3.9`).

Following the written rule would mean converting the optimiser, the dataset
build, every curated table, share links and saved browser state, and then
re-proving the optimiser's exactness tests, all for a representation nothing in
the pipeline uses. Phase 5's gcsim integration needs a conversion step at its
boundary either way.

## Decision

- Percentage stats (`*_pct`, `crit_rate`, `crit_dmg`, `er_pct`, `elemental_dmg`,
  `physical_dmg`, `healing`) are stored in **percent** in engine code: crit rate
  `31.1`, not `0.311`. Flat stats (`hp`, `atk`, `def`, `em`) are plain numbers.
  This matches GOOD, so importing needs no unit conversion.
- The only planned conversion is at the gcsim boundary (Phase 5): config
  generation and result parsing convert to and from whatever gcsim expects, and
  PLAN.md's unit-conversion tests cover exactly that.
- `CLAUDE.md`'s convention is corrected to say so.

## Consequences

- No code changes: the rule now describes what the engine already does.
- GOOD normalization (2.2) maps keys and locations but passes stat values
  through unchanged.
- Anything that talks to gcsim must convert explicitly and test the conversion;
  a missed conversion there would be off by a factor of 100, which the golden
  tests against published DPS would catch.

## Rejected alternatives

- **Convert the engine to fractions** to match the old wording. A large, risky
  change across the optimiser, data and saved state, for no consumer that needs
  it.
