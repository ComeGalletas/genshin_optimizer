# 0029. "What changed" diff: pair by proof, never by resemblance

- Status: Accepted
- Date: 2026-09-28

## Context

TODO 2.8 asks what changed since the last import: new pieces, upgrades,
re-equips. Between two exports of the same account, a piece can be levelled
(its fingerprint changes), moved, locked, consumed as fodder, or be a new
drop that looks like one that was consumed. The merge's pairing (ADR-0027)
handles unchanged and moved pieces; a levelled piece pairs there only by
first-roll key, which only Irminsul exports. The Phase 2 acceptance check
(ADR-0026) needs the diff to be right on two Irminsul exports.

No second real export exists yet, and a real pair can't say what the right
answer is anyway. The owner chose to test against simulated play on the
real export (2026-09-28).

## Decision

1. **Pairing, in order** (`packages/engine/src/diff/diff.ts`): exact
   fingerprint, one-step fuzzy match, the same four first rolls (a levelled
   piece, when both sides carry them), then **roll arithmetic** for sources
   without first rolls.
2. **Roll arithmetic:** a piece after can be a piece before levelled up only
   if set, slot, rarity (5★), main stat and element match, the level went up,
   the lines match (a 3-line piece gains its fourth at +4, with its value if
   the unactivated line is known, as one more roll if not), and every line's
   gain can be made from the random rolls the upgrades in between give, with
   the real roll tiers (one shown step of rounding allowed). It is paired
   only when it is the only candidate on both sides; two identical earlier
   pieces count as one candidate, since either is the same answer.
3. **Upgrades are found before mismatches,** so a same-shape new drop can't
   take the piece an upgrade came from.
4. **What is left:** pieces only after are new, only before are gone. A
   same-shape pair too far apart to be one piece is **unexplained**, unless
   both carry all four first rolls and they differ: an exact source doesn't
   misread and first rolls never change, so those are two pieces (one gone,
   one new). A piece with several possible sources is unexplained too.
5. **Like with like:** the server diffs a new usable snapshot against the
   previous usable snapshot of the same source kind (`diffSincePrevious`),
   and `npm run inbox` prints it after each import.
6. **The store keeps the unactivated line** (migration 2), which the roll
   arithmetic and the levelling prospects need; imports made before it have
   none.

## Consequences

- Test: a seeded play simulator (`test-fixtures/simulatePlay.ts`) levels
  pieces with real rolls, re-equips, re-locks, consumes fodder and adds new
  drops, and records exactly what it did. On the owner's 1,650-piece
  export, over 5 seeds (66 upgrades, 116 consumed, 91 drops each), the diff
  finds every change with first rolls, and makes no false pairing in any
  run with or without them; without first rolls, 1 to 2 pieces per run can
  stay unexplained. `npm run diff:sim -- <file>` reproduces this on any
  export. The committed tests run the same check on a synthetic account.
- The owner's second real Irminsul export remains the acceptance check: it
  confirms how Irminsul actually records a levelled piece.
- An unexplained entry asks the owner; the diff never decides it.

## Rejected alternatives

- **Nearest candidate wins.** Crowded accounts have many same-shape +0
  pieces; picking the closest would pair a new drop with the piece it
  replaced.
- **Treat every same-shape mismatch as two pieces.** Right for exact
  sources, but hides a real OCR misread.
- **Diff merged views instead of snapshots.** Merged artifacts don't keep
  first rolls, and mixing sources would report a source's gaps as changes.
