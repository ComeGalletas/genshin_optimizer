# 0026. Irminsul is the primary source; OCR is a checked fallback

- Status: Accepted
- Date: 2026-09-28

## Context

PLAN.md already ranks Irminsul above OCR scanners, but Phase 2's acceptance
check leaned on OCR: a real Irminsul export and an OCR export of the same
account had to match on at least 98% of artifacts. The owner supplied one
Irminsul export (2026-09-27) and two AdeptiScanner exports (2026-09-28).

- **Irminsul** read all 1,650 artifacts, 97 characters and 329 weapons, with
  exact values and the roll data (first roll per line, roll count,
  unactivated line) that the levelling prospects (ADR-0024) and the upgrade
  diff need.
- **AdeptiScanner** read accurately what it read: 1,000 of the 1,001
  distinct 5★ pieces in the second scan pair with Irminsul, the other being
  new (ADR-0025). But both scans were incomplete in the same way. The second
  is 6 passes of about 165 real pieces, each followed by about 111 repeats of
  the same 30 +0 pieces: 1,650 entries, 1,013 distinct, and 627 of 1,265 +0
  pieces reached. Its roll data is partial (only what the screen proves), and
  it exports no characters or weapons.

The 98% check measures the scanner, not this app, and the scanner failed it
twice for reasons outside the app. Meanwhile the owner's account is fully
covered by Irminsul.

## Decision

1. **Irminsul is the primary source,** and the only one Phase 2 requires.
   Merge precedence stays Irminsul > OCR > Enka for values, and the newest
   snapshot wins for location.
2. **OCR stays supported as a fallback,** for when a game patch breaks
   Irminsul until it is updated, and for the external `genshin-agent`
   project. It goes through the same normalization, fingerprint and sidecar
   validation as any source. No further OCR-specific work (tolerance tuning,
   scanner workarounds) is planned.
3. **A broken scan is reported, not merged.** An import whose entries repeat
   in long runs (as both AdeptiScanner files do) is flagged as a scanner
   fault, and the importer (TODO 2.7) doesn't take it as the account's
   inventory.
4. **Phase 2 acceptance** becomes:
   - re-importing the same Irminsul file changes nothing;
   - two Irminsul exports taken at different times give a correct "what
     changed" diff (new pieces, levelled pieces, re-equips);
   - a faulty OCR scan like the owner's is detected and reported, not merged
     as the inventory.

## Consequences

- Phase 2 no longer waits on a clean OCR scan. The owner needs a second
  Irminsul export, some time after the first, for the diff check.
- The reconciliation report (TODO 2.5) keeps its purpose from PLAN.md: an
  OCR scan, when there is one, cross-checks an Irminsul export that may have
  gone stale after a patch.
- Roll data from any source is validated value by value (TODO 2.3), since
  OCR roll data is partial rather than absent.

## Rejected alternatives

- **Keep the 98% cross-source check.** It depends on a third-party scanner
  that fails on this account, and it tests nothing Irminsul-only use needs.
- **Drop OCR support.** It is already built and tested, costs nothing to
  keep, and is the only fallback when Irminsul breaks after a patch.
