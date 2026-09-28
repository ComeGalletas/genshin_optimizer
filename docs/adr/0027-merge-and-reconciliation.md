# 0027. Merge and reconciliation model

- Status: Accepted
- Date: 2026-09-28

## Context

Phase 2 keeps every import as a snapshot and shows the account as one merged
view. PLAN.md fixes the precedence (Irminsul > OCR > Enka for values, the
newest snapshot for location) and asks for a reconciliation report (only in
A, only in B, mismatches beyond tolerance). ADR-0025 gives the identity
(fingerprint, one-step fuzzy match, first-roll key) and ADR-0026 says a
faulty scan is reported, not merged.

The owner's exports show what the merge meets in practice: an Irminsul export
and two AdeptiScanner exports a day later, both with hundreds of repeated
entries, 12 4★ pieces only the scan has, one piece obtained in between, two
display-rounding differences, and five re-equips.

## Decision

`packages/engine/src/merge/merge.ts`, pure:

1. **Source ranking:** Irminsul, then OCR, then other GOOD exporters (Genshin
   Optimizer, hand-written files), then Enka. A GOOD file's kind comes from
   its `source` string.
2. **Faulty scans are rejected before merging.** A snapshot in which a
   fingerprint occurs 3 or more times is a scan fault (identical pairs can
   be real; triples have only been seen in faulty scans). It is listed as
   rejected with its repeat counts, and contributes nothing.
3. **Merge order:** by source rank, then newest first. Each snapshot is
   reconciled against everything merged before it.
4. **Pairing** (`reconcile`), one to one: exact fingerprint, then the
   one-step fuzzy match, then a shared first-roll key (the same piece,
   levelled between the two snapshots). What is left is compared by shape
   (set, slot, rarity, level, main stat, element, substat keys): a unique
   same-shape candidate on each side is a **mismatch**, listed with the
   differing stats and not paired. The rest is only-in-A or only-in-B.
5. **What a merged artifact takes:**
   - values from the first snapshot in merge order that has it (the best
     source), except that a piece paired by first-roll key takes the newer
     reading's values, since the piece changed in between;
   - location and lock from the newest snapshot that has it; a source with
     no lock state (Enka) leaves the last known lock;
   - every appearance (snapshot and position), so nothing is merged away.
6. **Nothing is lost.** An unpaired piece or a mismatch becomes its own
   merged artifact. A property test checks, over random snapshots with
   misreads, levelled readings and stuck-scan repeats, that every piece of
   every merged snapshot lands in exactly one merged artifact.

## Consequences

- On the owner's exports both AdeptiScanner files are rejected, and the
  merged view is Irminsul's 1,650 pieces. With the second scan's repeats
  removed, the merge gives 1,663 pieces (the 12 4★ pieces and the new
  goblet added), values from Irminsul, locations from the newer scan, five
  re-equips reported, and every one of the 2,663 input pieces accounted for.
- A mismatch or an only-in-one-side piece can be a real difference (a piece
  consumed or obtained in between) or a misread. The merge keeps both sides
  and the report shows them; it doesn't decide. The "current account" view
  (TODO 2.6, 2.7) and the upgrade diff (2.8) build on these lists.
- A piece consumed as upgrade fodder stays in the merged view until a view
  over the latest snapshots drops it; that belongs to the snapshot store.

## Rejected alternatives

- **Merge faulty scans after collapsing repeats.** It would guess which
  entries are real; the scan also missed hundreds of pieces, so its
  only-in-B list would still mislead.
- **Pair mismatches when they are the only candidate.** Two different pieces
  of the same shape exist; a misread beyond one shown step has not been seen
  in the real data. Pairing them would be a guess.
- **Newest snapshot wins for values too.** Values from a scanner would then
  override exact values from Irminsul whenever the scan is newer.
