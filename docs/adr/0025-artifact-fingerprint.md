# 0025. Artifact fingerprint: one content identity, with a one-step fuzzy fallback

- Status: Accepted
- Date: 2026-09-28

## Context

Phase 2 merges several sources of the same inventory (Irminsul, OCR scanners,
Enka) and keeps every import as a snapshot, so it has to recognise the same
artifact across files. The game exports no artifact ID in GOOD, so identity
has to come from content. The fork already has one content hash,
`artifactHash` in `import/dedupe.ts` (set, slot, rarity, level, main stat,
element, sorted `key:value` substats), used by the web importer to skip
pieces already in the inventory. It compares raw values, so a source that
reports 3.8899 and one that reports 3.9 disagree.

Two real exports of the owner's account, a day apart, show what the identity
has to survive:

- **Irminsul** (memory reader, 2026-09-27): 1,650 5★ pieces, all with
  distinct fingerprints. Values have at most one decimal.
- **AdeptiScanner** (OCR, 2026-09-28): 1,562 entries, but only 998 distinct.
  30 pieces from the end of the inventory appear 19 to 21 times each (564
  extra entries), in contiguous runs: the scanner kept re-reading one page.
  It never reached about 665 pieces Irminsul lists.
- Of the 986 distinct 5★ pieces the scan did read, 983 match Irminsul
  exactly. Two differ by one shown digit on one line (CRIT DMG 25.6 vs 25.7;
  DEF% 18.9 vs 19.0, where the three rolls sum to 18.95). One is new since
  the Irminsul export. The 12 4★ pieces are only in the scan because this
  Irminsul export has no 4★ pieces.
- On levelled pieces the OCR file writes `initialValue` only where the
  screen proves it (a line holding a single roll): about a third of the
  lines, all of them agreeing with Irminsul. It leaves the rest out. Its
  `totalRolls` is missing on about 50 pieces and impossible (7 at +20) on 2.
  (Corrected 2026-09-28: the first version of this ADR counted the missing
  values as disagreements.)
- The unactivated fourth line matched on all 944 +0 3-line pieces in both,
  but scanners that predate the 5.5 display don't read it.

## Decision

1. **One fingerprint** (`packages/engine/src/import/fingerprint.ts`): set,
   slot, rarity, level, main stat, element, and the active substats sorted by
   key, each rounded to what the game shows (flat stats to integers, the rest
   to one decimal). `artifactHash` becomes this function, so manual entry,
   GOOD and Enka imports dedupe on one identity.
2. **Left out on purpose:** the unactivated line (not every source has it),
   location and lock (they change as the player plays), `id`, main-stat value
   (level decides it), and any source's roll extras (they go to the sidecar,
   TODO 2.3, keyed by this fingerprint).
3. **Matching is one to one.** A fingerprint is not unique (two identical
   pieces are possible, and a faulty scan repeats them), so
   `matchArtifacts` pairs pieces as multisets: exact fingerprints first, then
   the fuzzy fallback on what is left.
4. **Fuzzy fallback: one display step per substat, one candidate only.** Same
   set, slot, rarity, level, main stat, element and substat keys, and every
   value within one shown step (0.1 for percentages, 1 for flat stats). A
   piece with two candidates is reported as ambiguous and left unmatched
   rather than paired by a guess. Level never varies in a match: a piece that
   was levelled is a different fingerprint, and recognising it is the
   upgrade diff's job (TODO 2.8).
5. **Repeats are reported, not dropped.** `repeatedFingerprints` lists
   fingerprints that occur more than once. The importer (TODO 2.7) decides
   what to do with a scan that has long runs of repeats; the fingerprint
   layer only makes them visible.

## Consequences

- On the two real exports, 985 of the 986 distinct 5★ pieces the scan read
  are paired (983 exact, 2 fuzzy, none ambiguous) in about 55 ms.
- The OCR export is not complete enough for Phase 2's acceptance check: the
  owner needs a scan that finishes the inventory without repeating pages.
- Dedupe in the web importer now ignores sub-display noise (3.8899 vs 3.9),
  which before made the same piece look new. Pieces equal to the shown digit
  already deduped and still do.
- A levelled piece has a new fingerprint. Irminsul's `initialValue` gives a
  level-independent identity (set, slot, rarity, main stat and every line's
  first roll, unique across all 1,650 pieces); 2.8 can use it between
  Irminsul snapshots. OCR sources give it only for pieces whose every line
  holds a single roll.

## Rejected alternatives

- **Exact values only.** Misses the display-rounding cases, which a real
  export of this account already has.
- **Wider or per-stat tolerances** (a whole roll, or percentage error). One
  shown step is the only difference a correct reading can have. Anything
  wider starts pairing different pieces of the same shape.
- **Include the unactivated line.** It would split the same piece between a
  scanner that reads it and one that doesn't, for no gain: no two pieces in
  the export differ only there.
- **Keep `artifactHash` separate.** Two content identities would drift, and
  the web importer would dedupe differently from the server.
