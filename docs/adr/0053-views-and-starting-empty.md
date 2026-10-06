# 0053. Views, and starting empty

- Status: Accepted
- Date: 2026-10-06

## Context

The app was one long page: a hero with a demo solve ("269.4, fixed demo
inventory"), a "Try a sample build" walkthrough, five numbered steps with
the local server's sections in between, and a sticky step nav whose
Roster, Teams and Plan chips stayed locked until an import while Optimise
sat some 15,000 px down the page. The load panel took a whole section on
every visit, long after it had been used. The owner asked for the
sections split cleanly, loading used once and then minimised, nothing
locked out of reach, and no demo or tutorial content: the app should open
empty and offer the demo data, the owner's account or a new source.

## Decision

- **Views, one at a time, each at its own address** (`#/roster`, `#/teams`,
  `#/plan`, `#/optimise`, and, while the local server runs, `#/simulate`
  and `#/imports`), each a lazy chunk. The menu lists them all; nothing is
  locked. A view without what it needs says so in place, with one action
  ("Teams needs a roster. Load Data").
- **Start** (`#/start`) is where loading happens: three choices, the **demo
  data** (a made-up account of eight characters in two teams, wearing
  pieces from the fixed sample bag), **your account** from the local server
  (or how to start it), or **a new source** (a GOOD file, a UID, pieces by
  hand). The app opens on it while nothing is loaded, and on the roster (or
  Optimise, without one) once something is.
- **The account bar**: once something is loaded, one line in the header,
  "1,650 artifacts · 94 characters · from the local server, 2026-10-06 ·
  Change", Change opening Start. A load opens the view that has something
  to show, and its confirmation follows it, under the bar and announced.
- **No demo or tutorial content** on the way in: the hero's demo solve, the
  sample presets and the walkthrough are gone (the engine's `heroExample`
  and `presets` with them); the demo is a choice, not a default.
- **Links**: a build link (`?b=`) opens Optimise, a comparison link (`#c=`)
  Simulate; both still work without a server.

## Consequences

- The first visit shows three cards and a menu, not a long page.
- Every view past Start is a lazy chunk, Optimise included (its run
  state stays in `App`, so a run outlives a switch of view): the first load
  is the shell and the Start view, 159.1 KB gzipped against 169.7 KB before
  Phase 9. The bundle's total rises (216 KB, the size baseline updated):
  more, smaller chunks compress a little worse apart, and the game's image
  names (5.7 KB) load after the page starts.
- Hash addresses are views now: an in-page anchor (`#content`) has to be
  handled in code, not as a link.
