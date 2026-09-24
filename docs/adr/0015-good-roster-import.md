# 0015. GOOD roster import

- Status: Accepted
- Date: 2026-07-17
- Amends: [0006](0006-inventory-import-and-build-level-model.md)

## Context

A GOOD export carries top-level `characters[]` and `weapons[]` arrays in
addition to `artifacts[]`. `weapons[].location` names the character key a
weapon is equipped on (empty string = unequipped). [0006] only ever read
`artifacts` — the roster arrays were silently dropped.

Walking through the app against a real account export surfaced the cost:
selecting a character and manually picking a weapon defaulted to whatever the
combobox search surfaced first (a plausible-looking signature weapon), not
what the player's account actually has equipped. Nothing crashed or warned —
it just looked like a reasonable recommendation while being wrong.

GOOD's `characters[].key` / `weapons[].key` are PascalCase
(`RaidenShogun`, `AmosBow`); the frozen dataset's keys are snake_case and
sometimes retain punctuation from the source name (`raiden_shogun`,
`amos'_bow`). Verified against a real 109-character/150-weapon export,
normalizing both sides to alphanumeric-only lowercase before comparing
(`s.toLowerCase().replace(/[^a-z0-9]/g, '')`) matches 150/150 weapons and
108/109 characters — a naive PascalCase→snake_case regex only reaches
118/150 weapons (it can't handle embedded apostrophes). The one remaining
miss, `TravelerAnemo`, doesn't exist in the frozen dataset under any key at
all (a pre-existing dataset gap, not something this change fixes).

## Decision

GOOD import also extracts an owned roster
([`parseGOODRoster`](../../packages/engine/src/import/good.ts)): character ownership, each
character's equipped weapon (via `weapons[].location`), and a build level
implied by ascension. Unresolvable keys are skipped silently, mirroring
`parseGOOD`'s existing "skip unrecognised entries rather than throwing"
contract.

- **Build level from ascension, not `level`.** A character can never be
  de-leveled, so the level that matters for build evaluation is the cap
  their ascension already unlocks: `[20, 40, 50, 60, 70, 80, 90][ascension]`.
  A level-81/ascension-6 character evaluates at 90, not 81. [0006]'s single
  global build-level dropdown is unchanged — the roster only pre-fills it.
- **Roster state is a new store**, [`useRoster`](../../src/state/roster.ts),
  following the same zustand + `persist` pattern as
  [`useInventory`](../../src/state/inventory.ts). It is replaced wholesale on
  each GOOD import (a GOOD export is a full account snapshot, not an
  incremental diff), unlike inventory's append/dedupe.
- **Pre-fill, stay overridable.** Selecting a rostered character in
  [`OptimizePanel`](../../src/components/OptimizePanel.tsx) pre-fills its
  equipped weapon and build level in the character combobox's change handler
  — not a render effect, so a later manual override is never clobbered by an
  unrelated re-render. Same spirit as the existing "Use meta build" pre-fill
  ([0007]).
- **Character combobox sorts owned-first**, with an "Owned" marker, rather
  than restricting the list to owned characters — players theory-crafting a
  character they don't have yet still see the full roster.
- **UID/Enka import stays artifact-only.** Enka's showcase API exposes only
  numeric `avatarId` / `nameTextMapHash` values; the frozen dataset has no
  numeric IDs to join against (the same gap already noted for artifact
  `setKey` hashes at [src/import/uid.ts:82](../../src/import/uid.ts)).
  Building that ID→key mapping is a separate, larger change, deferred
  indefinitely. UID import never reads or writes the roster store.

## Consequences

- GOOD is further cemented as the primary import path ([0006]): only it can
  populate the roster, weapon auto-fill, and level pre-fill.
- `characters[].constellation` and `characters[].talent` are parsed nowhere
  and stored nowhere. The stat-only model ([0003], no damage engine) has no
  lever a constellation or talent level could act on — "a C6 character needs
  weaker artifacts" is a damage-multiplier claim, not a stat claim. Wiring it
  would require constellation-adjusted grade/meta thresholds, i.e. damage
  modeling, which is out of scope for this ADR and for [0003] generally.
- A future Enka avatarId→key mapping (if ever built) would let UID import
  populate the same roster store for showcased characters; no interface
  change would be needed on the `useRoster` side to support it.

[0003]: 0003-stat-only-model-no-damage-engine.md
[0006]: 0006-inventory-import-and-build-level-model.md
[0007]: 0007-gap-analysis-with-frozen-meta-snapshot.md
