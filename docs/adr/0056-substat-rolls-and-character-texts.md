# 0056. Substat rolls on the artifact, and texts per character

- Status: Accepted
- Date: 2026-10-06

## Context

The owner's review of the character window (TODO 9.10) asked for each
substat's rolls ("HP 448 (209 + 239)"), every talent's description and its
values at the current level, the activated constellations' descriptions,
and the active set effects.

Two things were missing. First, the rolls: Irminsul exports each line's
first roll (`initialValue`) and the piece's roll count (`totalRolls`). The
import checks both and the server keeps them in the sidecar (ADR-0024), but
the web app only ever had the plain `Artifact`. Second, the words: the
talents' descriptions and their values at levels 1 to 15, and the
constellations, are 789 KB for 120 characters (221 KB gzipped). That is
far too much to load whenever any window opens.

## Decision

- **Roll data rides on the artifact**, as an optional `rolls` field
  (`first` by stat, `total`): set by `parseGOOD` from the checked extras,
  validated when read back from storage or a share link, and never scored.
  The server's account file (`/account/good`) now writes each piece's
  extras from the snapshot its values came from, so the web app gets them
  from the server as well as from a file. Hand-entered pieces and other
  sources simply have none.
- **Rolls are split only as far as the numbers prove** (`rollSplit.ts`,
  pure). The first roll is exact when exported. The others are every way of
  reaching the value with the four tiers, as the game rounds it, kept only
  if the counts over the four lines add up to the rolls the piece has had.
  One split left: it is shown, each roll tinted by its tier. Several splits
  with one count: the count and what those rolls added. An open count:
  nothing. On the owner's 309 +20 pieces this gives 992 lines exactly, 220
  by count and 24 open, out of 1,236, and every claimed split checks
  against the export.
- **Texts per character.** The dataset build writes
  `game/genshin/texts/<key>.json` (2–4 KB gzipped each). The window
  loads the one it shows, and the bundler makes each file its own chunk.
  Set effects (18 KB raw) go into `details.generated.json`. Both are
  rebuilt by `build:data` and checked unchanged in CI.
- **A talent's values are shown at the level that applies in combat**
  (base plus the constellations' +3, labelled "Lv 13 (10 + 3)"), in the
  game's own formats (F1P, F2P, P, F1, F2, I).

## Consequences

- `Artifact` has a display-only field. Anything that copies artifacts
  carries it (a share link grows by a few bytes per piece), and the
  optimizer, the fingerprint and the merge ignore it.
- Pieces imported before this change have no roll data until the account
  is loaded again.
- The bundle gains 120 small chunks, none in the first load (which grows
  by 0.35 KB, for checking the roll data). Compressed one by one they come
  to 334 KB, more than the 221 KB they would be as one file, so the size
  baseline rises to 623,686 B. Each window loads only its own 2–4 KB.
