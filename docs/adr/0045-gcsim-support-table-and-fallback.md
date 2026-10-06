# 0045. What gcsim implements: a probed table, and "not simulated" otherwise

- Status: Accepted
- Date: 2026-10-05

## Context

gcsim lags the game: at v2.48.8 it lacks Sandrone and Zibai, two of the
owner's most-built characters (research note 2026-10-05). CLAUDE.md asks
that missing game data degrade to stat-only with an explicit "not
simulated" flag, never a crash and never a guess, and PLAN asks the
coverage report to show gcsim support.

gcsim has no command that lists what it implements. Its source lists it,
but reading the source to build our list ties us to its layout and
licence (AGPL), and our names would still have to match the ones the
binary accepts.

## Decision

- **Probe the binary.** `npm run sim:support` runs the pinned gcsim once
  per dataset character (alone, with a Favonius weapon of its type), per
  weapon (on a fully implemented character of its type) and per artifact
  set (four pieces): gcsim refuses a name it doesn't know, and lists one it
  knows only partly in `incomplete_characters`. The result is
  `packages/engine/src/sim/gcsim-support.json`, stamped with the gcsim
  version and commit, generated and committed like the dataset snapshot.
  It takes about 6 s. A test fails when the stamp no longer matches the pin
  in `config/tools.json`, so a new pin brings a new table.
- **Levels.** Characters are `full`, `partial` or `unsupported`; weapons
  and sets `supported` or `unsupported`. A key newer than the table is
  `unknown`: tried, and the run itself reports a refusal or an incomplete
  character.
- **Fallback.** With `objective: "sim"`, a character, teammate, weapon or
  set that isn't fully implemented makes the request run as the stat search
  over the same constraints, with `notSimulated` giving each reason and the
  "understood" sentence saying "not simulated (…)"; no gcsim is needed for
  that. A candidate whose own sets gcsim lacks is left out of the ranking
  and listed as `skipped`, the rest still run. gcsim refusing at run time,
  or reporting an incomplete character, falls back the same way, with its
  message. `draft_rotation` refuses a team gcsim can't simulate before
  running it.
- **Coverage.** The report's gcsim column and a summary line come from the
  table.

## Consequences

- At v2.48.8: 110 characters full, 1 partial (Iansan), 9 not implemented
  (Alyosha, Kachina, Linnea, Lohen, Nefer, Sandrone, Vesna, Vodyanitsa,
  Zibai); 8 weapons and 4 low-rarity sets missing. Every refusal was
  checked against gcsim's repository at the pinned commit: none of them is
  a naming mismatch.
- The owner asking for a simulated Sandrone build gets her best builds by
  the stat objective, plainly labelled, instead of an error.
- Support follows the binary, not the source: if a name we generate
  differs from gcsim's for a character it does implement, the table says
  `unsupported`, which is true for us (we couldn't run it) and visible in
  the coverage report.
