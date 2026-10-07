# 0060. genshin.gg as a cross-check

- Status: Accepted, amended by [0061](0061-offline-guide-data-pipeline.md)
  (the extraction is now `npm run sources -- genshin-gg`)
- Date: 2026-10-07

## Context

The guide builds (ADR-0059) come from KQM and genshin-builds. The owner
dropped Game8 as the third source: its terms forbid copying its content and
using software on it, and its robots.txt blocks AI crawlers. genshin.gg took
its place (TODO 10.2), and was checked on 2026-10-07:

- robots.txt allows every crawler, and the site links no terms of use.
- Each character page is static HTML in one template, with one build: a
  role (Main DPS, Sub DPS or Support), ranked sets, main stats per slot and a
  substat order. No Energy Recharge figure. The builds credit the "Genshin
  Impact Helper" team's spreadsheet.
- It covers 118 of the 120 characters (not Vesna or Vodyanitsa), and is
  current.

Merged into the guide builds, it changed no score on the owner's account. It
overlaps genshin-builds heavily: the same top set for 92 of 118 characters,
and the same main stats for 55. Its one build's role label often matches
none of ours, so merging by role would have added near-duplicate builds.

## Decision

genshin.gg is a **cross-check, never scored** (owner, 2026-10-07).

- `npm run guides:genshin-gg` (`scripts/extract-genshin-gg.ts`) reads each
  character's page into `meta/genshinGg.generated.json`. It is run by hand,
  one request a second, with plain page fetches. Labels it can't map are
  printed and left out, never guessed. The diff is reviewed before it's
  committed.
- `crossCheck()` (`roster/crossCheck.ts`) compares genshin.gg's build with
  the build the window shows:
  - whether that build recommends genshin.gg's top set;
  - the main stats genshin.gg takes that the build doesn't, by slot;
  - the substats genshin.gg lists that the build doesn't use.
- The Artifact quality card shows one line under the build: "Cross-check:
  genshin.gg (Support) agrees with this build", or what differs, with a
  link to the page. The line follows the build picked.

## Consequences

- The score, the bands and the optimizer don't read genshin.gg.
- The cross-check shows where a third source disagrees. For example, it
  lists ATK% substats for Kokomi, which no Kokomi build uses.
- The extraction depends on the site's template. A page that changes shape
  is reported as missing rather than misread.
- Re-check genshin.gg's robots.txt and terms before each run; the script's
  header says so.
