# 0054. In-app help, on demand

- Status: Accepted
- Date: 2026-10-06

## Context

The app now opens empty, with no demo or tutorial content (ADR-0053). The
owner asked for help on every screen anyway: a short description of what
each section does, and a "?" that opens a larger panel with the steps to
follow (how to load data from each source above all), on subsections too
where useful.

## Decision

- **Descriptions** stay as each section's one-line hint under its title,
  rewritten to say what the section does ("An exact search over your
  artifacts for one character's best builds…").
- **Help on demand**: a "?" button beside a section's title (and beside a
  subsection's where its controls need explaining) opens a panel with the
  topic's title, what it is for, the numbered steps, and tips. Closed until
  asked for; closed again from the panel or the button. Never shown on
  load: the empty start ADR-0053 chose is kept.
- **One place for the words**: every topic in `components/help/topics.ts`
  (title, intro, steps, tips), so they are reviewed and kept current
  together, and checked against the UI's own labels.
- **The button and its panel apart**: their open state is shared
  (`helpState.ts`), so a panel can sit where there is room. The Start
  view's three cards keep their "?" and show the steps full width below
  the cards.
- **Accessible**: the button names its topic ("Help: Loading data"), says
  whether it is open and which panel it controls; the panel is a named
  region.

## Consequences

- Nineteen topics to keep true as the UI changes; a label renamed in
  the UI needs its help text updated too.
- The words ship in the first load (the section shell imports them):
  about 4.7 KB gzipped, the first load now 163.8 KB, still under the
  169.7 KB before Phase 9. If it grows, the topics can load with their
  panel instead.
