# Phase 9 QA report: server retrieval and front-end rendering

- Date: 2026-10-06
- Tested at: `main` `5bb3876` (fix: constellations open like talents, terms in bold)
- Scope: (A) how the web app gets data from the local server; (B) front-end
  rendering, with Phase 9 (TODO 9.1 to 9.10, ADRs 0049 to 0056) in focus.
- Method: the full gate, scripts against a scratch store, a mock server for
  bad answers, and the running app in the browser preview. Nothing in the
  code was changed.

Summary: no blockers, 3 major, 8 minor and 4 cosmetic findings, every one
reproduced.

**Status (2026-10-06, later):** every finding is fixed. M1, M2 and M3 are
fixed on branch `fix/phase9-qa-majors`, each with tests and checked again
in the running app. m5 was fixed on `main` in 720079a, and the other minor
and cosmetic findings in 3286bad (TODO 10.0). The engine side held up: stats, talents, roll splits and the
`/account/good` round trip all matched genshin-db and the owner's exports
exactly.

## How it was tested

- The gate: `npm run typecheck`, `lint`, `format:check`, `docs:check`,
  `build`, `size:check` and `npm test`, then `npm run test:coverage` with
  `tools/bin/gcsim-v2.48.8.exe` renamed away (as CI runs it) and put back.
- A scratch store with two hand-made snapshots, imported with
  `importUpload`, then read through `GET /account/good` and fed back through
  `normalizeGOOD`, `parseGOOD` and `splitRolls`:
  - snapshot 1 (`source: "Irminsul"`, 2026-10-01): Furina 80/80 C2,
    Neuvillette 80/90, Aloy 50/50, Raiden 90 C5; weapons at 80 before and
    after their ascension; a +20 flower with `initialValue` and
    `totalRolls: 9`; a +0 Hydro goblet with an unactivated line; a 4★ sands
    with roll data; a +8 circlet with `totalRolls` only; a +20 sands with no
    roll data; a +0 plume with an unactivated line;
  - snapshot 2 (`source: "Inventory_Kamera"`, 2026-10-05): the flower moved
    to Neuvillette and unlocked, and the plume levelled to +4.
- The web dev server and the local server on ports 5299 and 5298 (5199 was
  in use), the app pointed at 5298 with `VITE_SERVER_URL`.
- A mock server on 5298 that answers `/health` and then misbehaves on
  request: malformed JSON, HTML 500, JSON 500, JSON 404, `null`, `[]`, a
  GOOD file whose entries are all invalid, an empty 200, and a 40 s delay.
- The owner's exports in `imports/inbox/`, read locally, for the roll
  statistics. The owner's account (1,383 artifacts, 95 characters) was also
  loaded into the preview from another session's server on 5198, by a
  read-only `GET`; it was used for the character-window checks. Nothing was
  written to that server.
- Expected numbers come from `genshin-db` (`characters(n).stats(level, "+"/"-")`,
  `weapons(n).stats(...)`, `talents(n).combat3.attributes`).

## Gate results

| Check                         | Result                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| typecheck, lint, format:check | pass                                                       |
| docs:check                    | pass (56 ADRs)                                             |
| build                         | pass                                                       |
| size:check                    | pass: 623,819 B gzip, baseline 623,686 B, limit 654,870 B  |
| npm test                      | 132 files, 1,295 tests pass                                |
| test:coverage without gcsim   | 130 files pass, 2 skipped; 95.59% statements, 96.62% lines |

The first load (`index.html`'s script and modulepreloads) is about 164.4 KB
gzipped (measured with `gzip -6`), against 169.7 KB before Phase 9. Neither
`details.generated` nor any per-character texts chunk is in it.

## Major

### M1. A malformed answer from the server crashes the whole app (Imports) or leaves it loading (Imports, Simulate)

- Where: `packages/web/src/import-center/ImportCenter.tsx:72`
  (`data?.merges[data.merges.length - 1]`, no shape check); root cause in
  `packages/web/src/local-server/client.ts:68`, which returns `null` for a
  200 whose body isn't JSON.
- Steps:
  1. Have `GET /imports` answer 200 with `[]` (or `{}`, or any object
     without `merges`).
  2. Open `#/imports`.
- Actual: `TypeError: Cannot read properties of undefined (reading
'length')`, and the app-wide error boundary ("Something went wrong").
  Its Reload button reloads into `#/imports` and crashes again, for as long
  as the server answers that way.
- Also:
  - a 200 with an empty or non-JSON body leaves Import Center on
    "Loading…" for good (still loading after 20 s);
  - Simulate then shows a raw TypeError to the user: "Couldn't load the
    rotation library: Cannot read properties of null (reading 'rotations').".
- Expected: a readable error inside the view, never the app-wide boundary;
  `serverJson` should treat an unreadable 200 as an error.
- Confidence: confirmed by running (mock server).

### M2. Character window: focus never enters it and isn't restored when it closes

- Where: `packages/web/src/components/ui/Drawer.tsx:58` (restores focus only
  when `open` turns false) and
  `packages/web/src/character-window/CharacterWindow.tsx:17` (unmounts the
  drawer instead of passing `open={false}`).
- Steps:
  1. On `#/roster`, focus a row with the keyboard and press Enter.
  2. Wait 3 s and inspect `document.activeElement`.
  3. Press Tab to move into the window, then press Escape (or Tab to ✕ and
     press Enter).
- Actual:
  - after step 2, no `focusin` event has fired and focus is still on the
    row, while `#root` carries `aria-hidden="true"`: the focused element is
    hidden from screen readers and the dialog isn't announced;
  - after step 3, focus lands on `<body>`, not the row.
  - (Escape and the focus trap themselves work: Tab ×25 stays inside.)
- Expected: focus moves into the window on open (vaul 1.x does not
  auto-focus by default) and returns to the trigger on every close.
- Note: the focus-on-open part probably affects every `AppDrawer` (the
  rotation library's drawer too); only the character window was tested.
- Confidence: confirmed with the real keyboard; the screen-reader effect is
  inferred from the ARIA attributes, not from a screen reader.

### M3. A server account whose artifacts all fail to parse still replaces the local inventory, reported as a success

- Where: `packages/web/src/components/ImportPanel.tsx:272`
  (`replaceAll(out)` whatever `out` holds).
- Steps:
  1. With an account loaded (1,383 artifacts, 95 characters), have
     `GET /account/good` answer 200 with
     `{"format":"GOOD","version":3,"artifacts":[{"setKey":1,"slotKey":"hat"},null,"x"],"characters":[{"key":"Furina","level":"ninety","talent":"x"}],"weapons":[{"key":"Nope","refinement":9}]}`.
  2. On `#/start`, press Load Account, then Confirm Replace.
- Actual: the browser now holds 0 artifacts and 1 character, the app moves
  to the roster with a "Loaded the local server's account…" success
  message, and nothing reports the dropped entries.
- Expected: refuse (or warn and ask again) when the answer had entries but
  none were usable; say what was dropped.
- Confidence: confirmed by running (mock). The trigger is unlikely, but the
  loss can't be undone.

## Minor

### m1. Weapons at a level cap show the lower value for rosters saved before 9.9

- Where: `packages/engine/src/game/genshin/details.ts:77` (`phaseAt` takes the
  side before the ascension when `ascension` is undefined); persisted roster
  rows from before 9.9 have no `weaponAscension`.
- Steps: remove `weaponAscension` from Aino's row in
  `localStorage["rpg-build-optimizer/roster"]`, reload, open Aino → Gear.
- Actual: Skyward Pride Lv 80 R1 shows base ATK 590 (Stats: ATK 691).
- Expected: 621 (genshin-db `stats(80, "+")` = 620.95), or a note that the
  ascension is unknown. ADR-0056 warns that old data lacks rolls, but not
  this.
- Confidence: confirmed by running.

### m2. Gear and Stats disagree when two pieces share a slot

- Where: `packages/web/src/character-window/ArtifactList.tsx:102` shows the
  first piece per slot, while the sheet sums everything from
  `groupByLocation` (`CharacterWindowDrawer.tsx:32`).
- Steps: import the two scratch snapshots above (an Irminsul +0 plume, then
  a newer scanner snapshot of it at +4); load the server account; open
  Furina.
- Actual: the merge keeps both plumes (the known ADR-0025 limitation: a
  levelled piece pairs only when both sides have first rolls). Gear lists
  the +0 plume only; Stats counts both: CRIT Rate 9.2% = 3.5 + 3.5 + 2.2,
  CRIT DMG 37.5% includes the hidden plume's 7.0%.
- Expected: Stats and Gear show the same pieces, or the window flags two
  pieces in one slot.
- Confidence: confirmed by running.

### m3. The "Your account from the local server" help describes a step the server doesn't do

- Where: `packages/web/src/components/help/topics.ts:50`: "Start the server
  from the project folder: npm run server. It imports what is in the inbox
  and keeps watching it."
- Actual: `packages/server/src/cli/serve.ts` never reads or watches the
  inbox; only `npm run inbox [-- --watch]` and the Imports view's "Scan the
  Inbox" do. Following the help leads to the server's 404 "no account
  imported yet: drop a GOOD file in imports/inbox/ and run npm run inbox".
- Expected: the help names `npm run inbox` (or the server watches the inbox).
- Confidence: confirmed by reading the code and by the empty-store 404.

### m4. An invalid display-only `rolls` field throws away the whole artifact, or a whole share link

- Where: `packages/engine/src/game/artifactValidation.ts:114`
  (`isRolls` inside `isPersistedArtifact`), used by
  `packages/web/src/state/inventory.ts:51` and the share-link reader.
- Steps:
  1. Set `rolls.total = 12` on one stored artifact (Skirk's goblet) and
     reload.
  2. Separately, open a `?b=` link made with `encodeBuild` from pieces with
     `rolls: { total: 12 }`.
- Actual:
  1. 1,383 → 1,382 artifacts, Skirk's goblet gone, no message;
  2. "This shared build couldn't be read — it may be from a newer version."
- Expected: rolls are never scored (ADR-0056), so drop only `rolls` and keep
  the piece.
- Confidence: confirmed by running.

### m5. The confirm button resets after 5 s, but its instruction stays

- Where: `packages/web/src/components/ImportPanel.tsx:109` and `:114`.
- Steps: with owned gear loaded, press Load Account (or Load Demo Data) and
  wait 5 s.
- Actual: the button is back to "Load Account", while "Press Confirm replace
  to swap…" stays on screen, pointing at a button that's gone.
- Expected: the reset clears the notice, as Cancel does.
- Confidence: confirmed by running.

### m6. Closing a help panel with its Close button drops keyboard focus to `<body>`

- Steps: on `#/roster`, focus "Help: Your roster", press Enter, Tab to
  Close, press Enter.
- Actual: the panel closes and focus is on `<body>` (Close unmounts with the
  panel).
- Expected: focus returns to the "?" button.
- Confidence: confirmed with the real keyboard.

### m7. Duplicate React keys in talents and constellations

- Where: `packages/web/src/character-window/Talents.tsx:142`
  (`key={v.label}`), `packages/web/src/character-window/Constellations.tsx:29`
  (`key={c.name}`).
- Data: Nahida's burst repeats "Pyro: DMG Bonus", "Electro: Trigger Interval
  Decrease" and "Hydro: Duration Extension"; Qiqi's skill has two "CD" rows;
  Aloy's six constellations are all "Star of Another World".
- Steps: open Nahida → Stats and expand Elemental Burst.
- Actual: three "Encountered two children with the same key" errors in the
  console. The rows still render today; React calls this unsupported.
- Expected: key by index (or label and index).
- Confidence: confirmed by running (Nahida); the Qiqi and Aloy cases from a
  scan of the data.

### m8. The server status stays "online" after the server stops, until the tab regains focus

- Where: `packages/web/src/local-server/status.ts` (re-checks only on start
  and on focus).
- Steps: with the server running, stop it, then open `#/imports` and
  `#/simulate` without leaving the tab.
- Actual: the header still shows the server chip, the menu keeps Simulate
  and Imports, and the Start view keeps Load Account; the views and the load
  each fail with a readable "isn't reachable" message. After a focus event
  the app goes offline correctly.
- Expected: a failed call re-checks the status.
- Confidence: confirmed by running.

## Cosmetic

- **c1. Literal `****` in Nicole's and Odette's talent texts.**
  `packages/web/src/character-window/GameText.tsx:7` uses
  `/\*\*(.+?)\*\*/`, which needs at least one character, and genshin-db has
  empty markers there (Nicole talent 2: "the \*\*\*\* effect"; Odette
  talents 2 and 3). Confirmed by running the regex over the shipped texts;
  not viewed in the UI.
- **c2. Rolls are rounded one by one, so they can add up to more than the
  total.** Owner's Skirk sands: "ATK 31 (16 + 16)" (15.56 + 15.56 = 31.12).
  Confirmed in the app.
- **c3. The roster check in storage doesn't validate talents or ranges.**
  `packages/web/src/state/roster.ts:33` checks integers only. Corrupted
  values show as "Lv x0" with "?" values (talents `{auto: "x"}`), "Lv 500"
  with "— + — = —" stats, and "C-4". Nothing crashes. Confirmed.
- **c4. The window's header (name, Optimize, ✕) scrolls away with long
  talent text**, leaving only the tabs at the top. Seen in a screenshot.

## Suspicions (from reading, not reproduced)

- `packages/web/src/character-window/details.ts` latches `failed` for the
  session: one failed load of the details chunk would show "stats missing"
  in every window until a reload.
- `currentRoster` takes the roster from the best-ranked source even when a
  newer, lower-ranked snapshot has newer levels (in the scratch store,
  Furina stays 80 C2 from Irminsul though the newer scan says 90 C3). This
  is the documented ranking, not a Phase 9 change.

## Checked, nothing wrong

### (A) Server retrieval

- `GET /account/good` on an empty store: 404 with "no account imported yet:
  drop a GOOD file in imports/inbox/ and run npm run inbox".
- The round trip through two snapshots keeps locks (the newer snapshot's),
  locations, the goblet's element (`hydro_dmg_`), unactivated lines, the
  roster (level, ascension written from the build level, constellation,
  talents) and weapons (level, ascension, refinement; `weaponAscension`
  rebuilt on the roster). `normalizeGOOD` reports no issues on it.
- Roll data comes from the snapshot named by `valuesFrom` via `seenIn`; a
  piece seen in one snapshot only keeps its own; a 4★ piece's roll data is
  dropped.
- Client errors, all readable, inventory untouched, no unhandled
  rejections: server down ("isn't reachable at http://127.0.0.1:5298"),
  slow ("didn't answer within 30 s", with a busy button meanwhile), HTML 500
  ("answered 500"), JSON 500 and 404 (the server's own message), malformed
  JSON, `null` and `[]` ("sent an account this app can't read").
- Persisted state: an unreadable `account` record shows the bar without a
  source; an unreadable `settings` value falls back to the defaults.
- Localhost and CORS guards: 403 for a foreign Host (`evil.example.com`,
  `localhost.evil.com`, `127.0.0.1.nip.io`) and a foreign Origin
  (`evil.example.com`, `null`, `file://`, `127.0.0.1.evil.com`); localhost
  origins get `Access-Control-Allow-Origin`; a cross-origin POST to
  `/imports/scan` is refused (403) before it runs.

### (B) Front-end rendering

- Views: every view's empty or "needs the server" state; unknown addresses
  fall back to the roster; Back and Forward across views; a `?b=` link from
  before simulations opens Optimise with "Shared build…" and no simulation
  line, and survives a reload; a `#c=` link opens Simulate with the shared
  comparison; no horizontal overflow on any view at 375 and 768 px. The app
  is dark only (`color-scheme: dark`), so there is no light scheme to test.
- Game images: the fallback runs Enka → HoYoverse → initials ("Be") in the
  same 40×40 box; "Show game art" off removes every image, the splash
  included, and is kept across reloads; images are lazy with no referrer and
  decorative (`alt=""`) beside their names, as ADR-0052 says.
- Help: all 19 topics are reachable ("Reading the results" once results
  exist); each "?" toggles `aria-expanded`, names its topic, and controls a
  labelled panel. The labels the help names exist in the UI.
- Character window entry points: roster rows, team members, Plan rows, the
  Optimise portrait, "Works well with" and the rotation library's portraits
  each open the right character. A character not in the roster (Ayaka) opens
  at level 90 with "Not in your roster…" and talents "At Lv 10 (not in your
  roster)".
- Layout: three tabs; the name at 23px; Optimize 28px right of the name on
  Stats and Gear only; Overview in the order Teams, Recommended, Optimise
  This Character. Optimise This Character and the header's Optimize close
  the window and open Optimise with that character and a weapon they can
  wield.
- Stats against genshin-db, at the exact level and ascension:

  | Character  | Level | Weapon                       | Checked                                                         |
  | ---------- | ----- | ---------------------------- | --------------------------------------------------------------- |
  | Skirk      | 90    | Azurelight 90                | HP 12,417, ATK 359 + 674 = 1,033, CRIT Rate 22.1%, CD 38.4%     |
  | Aino       | 40/40 | Skyward Pride 80/90          | HP 4,665, ATK 101 + 621 = 722, DEF 253, ER 33.5%                |
  | Amber      | 70/70 | Favonius Warbow 77           | HP 7,309, ATK 565, DEF 464, ascension ATK% 12% (68)             |
  | Vodyanitsa | 88/90 | Hymn of the Maelstrom 80/80  | HP 14,609, ATK 581, DEF 477, (60.3% + 28.8%) × base = 13,022    |
  | Furina     | 80/80 | Splendor 80/80               | HP 13,505, ATK 690, DEF 614, CRIT Rate 14.4% at ascension 5     |
  | Neuvillette| 80/90 | Tome of the Eternal Flow 80/90 | HP 13,662, ATK 194 + 506 = 699, DEF 536, CD 38.4% + 80.4%     |
  | Ayaka      | 90 (not owned) | none                | HP 12,858, ATK 342, DEF 784, CD 38.4%                           |

  Healing and elemental DMG rows appear only when non-zero, with the
  element's name ("Cryo DMG Bonus 61.6%" = goblet 46.6% + Finale 2-piece).

- Talents: constellation +3 is right (Furina C3 burst "Lv 13 (10 + 3)";
  Kaveh C6 and Raiden C5 skill and burst; Aloy none); Furina's burst at
  Lv 13 matches genshin-db (24.2% Max HP, 0.31%, 0.13%); the formats (F1P
  "100.2%", F2P "34.78%", P "235%/293%", F1 "20.0", I "300") match the game.
- Constellations: only the activated ones, each a row that opens to its
  description with the bold terms rendered; nothing at C0.
- Gear: the weapon at its level and refinement with the passive at that
  refinement (Azurelight R1: 24%, 24%, 40%; Favonius Warbow R5: 100%) and its
  description; each piece's main stat with the goblet's element; the active
  2- and 4-piece effects word for word.
- Roll splits (`rollSplit.ts`):
  - the TODO's numbers reproduce exactly on the 2026-09-27 export: 309 +20
    pieces, 1,236 lines, 992 exact, 220 by count, 24 open (the 2026-10-06
    export: 320 pieces, 1,280 lines, 1,025 / 227 / 28);
  - an independent check over both exports found no claimed split that is
    inconsistent: every exact split sums to the shown value, every known
    first roll matches `initialValue`, and fully split pieces add up to
    `totalRolls`;
  - hand-made cases: a +0 piece with first rolls (exact), an ambiguous line
    with its first roll known ("3.9 + 2 rolls: 6.6"), a +8 piece with only a
    roll count (exact where unique, "2 rolls" where not), a +20 piece with no
    roll data (one line open because 3 or 4 rolls both fit), a 4★ piece (no
    rolls shown).
- Splash: 15% opacity (85% transparent) at `calc(60% + 75px)`, from Enka's
  `UI_Gacha_AvatarImg_*`, readable over the cards on desktop and in the
  375px bottom sheet.
- Lazy loading: the window, `details.generated.json` and each character's
  texts load on first open only; none is in the first load.

## Not checked

- The joint allocation's members and a comparison's "teams as run" as entry
  points: wired at `packages/web/src/plan/ServerAllocation.tsx:182` and
  `packages/web/src/teams/runDetails.tsx:60` and covered by tests, but not run
  (they need an allocation or a gcsim run).
- Image hosts actually failing: simulated by dispatching `error` events on
  the images, not by blocking Enka or HoYoverse.
- A real screen reader: the screen-reader findings come from the ARIA
  attributes.
