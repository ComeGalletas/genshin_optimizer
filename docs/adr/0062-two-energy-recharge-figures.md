# 0062. Two Energy Recharge figures per build

- Status: Accepted
- Date: 2026-10-07
- Amends: [0059](0059-several-builds-per-character.md),
  [0061](0061-offline-guide-data-pipeline.md)

## Context

A build had one Energy Recharge minimum: the lower bound of the first case
its guide gives. Guides give two kinds of case, and reviewing the first
script read (ADR-0061) showed what that cost:

- **Bursting every rotation, or every other rotation** (or "when
  available"). KQM often gives both: "Burst Every Rot 190–230% / Burst Every
  Other 100–115%" (Lohen). It also often advises not bursting every rotation
  at all: "use it when available instead" (Chiori).
- One figure couldn't hold both. The agents had left no figure where KQM
  advises against bursting every rotation (Chiori, Qiqi and five more). The
  script took that table's figure (Chiori 260%). Elsewhere the agents had
  taken the every-other figure (Kinich 100%) where the script took the
  every-rotation one (200%).

The owner set the rules on 2026-10-07.

## Decision

- **Every build has two figures, each optional:**
  - `erMin`: to burst every rotation;
  - `erEveryOther`: to burst every other rotation.

  Both include the base 100%, and both are the lower bound of the first
  case the guide gives. They're carried in `data/sources/`, the guide
  builds, `QualityProfile` and the artifact quality result (`er.min`,
  `er.everyOther`, each with how far short the character is).

- **A figure the guide doesn't label counts as every rotation**, the case
  KQM's tables assume.
- **When the guide says Energy Recharge isn't worth building** ("use it
  when available", "can forgo building ER", "not recommended to burst"),
  every other rotation is 100%: nothing beyond the base.
- **Reading KQM:** a column, a row or a sub-heading can name the cadence
  ("Burst Every Rot", "Baseline (Every Other Rotation)", "Burst When
  Available"). A constellation's column ("C4+", "C6") isn't the general
  figure; "Pre-C4" and "C0–C5" are. When a table lists weapons down its
  rows, the "Other" row is the general figure and the named rows are the
  weapon figures.
- **Shown in a fixed order for every character:** every rotation, then
  every other rotation. In the character window both are informative, each
  with how far short the character is; which one a team needs is a matter
  for its rotation (TODO 10.1).
- **The optimizer's "Energy Recharge from a build" picker** lists both
  figures for each build, in the same order. It still sets only the Energy
  Recharge floor.
- **Weapon figures** (`erWeapons`) stay with the every-rotation figure.
  That's the case guides give them for.

## Consequences

- Both open decisions from the review are settled.
  - The seven builds KQM advises not to burst every rotation keep the
    guide's advice (100% every other rotation) beside its every-rotation
    figure.
  - The agents' and the script's different picks from one page now sit in
    the two fields.
- On the first read, 32 builds have an every-other figure (27 have both).
  The every-rotation figure moved from the agents' for 19 builds:
  - the seven above, now with a figure;
  - five where the agents had taken the every-other figure (Chasca, Ineffa,
    Kinich, Xiao, Zibai);
  - builds that come only from genshin-builds, which gives figures only in
    prose, now without one.
- The score never reads either figure. No band on the owner's account
  moved.
- The rotation builder (TODO 10.1) is where a team says which cadence each
  member uses. The optimizer can then take the matching figure on its own.
