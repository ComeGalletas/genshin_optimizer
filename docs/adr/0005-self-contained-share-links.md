# 0005. Self-contained, view-first share links

- Status: Accepted (extended by [0051](0051-share-links-carry-simulations.md))
- Date: 2026-06-06

## Context

With no backend ([0001]), sharing is via URL. A build now includes the character, weapon, build level, constraints, objective, and five artifacts. The recipient does **not** have the sender's inventory, so encoding artifacts as indices into a local inventory would render nothing.

## Decision

A share link encodes a **self-contained build snapshot**: character, weapon, build level, the **five artifacts' full stats** (set, slot, level, main stat, all sub-stats + values), the constraints/objective for context, and the meta target if one was used. It does **not** embed the inventory.

Opening a link is **view-first**: the recipient sees the exact build and its stat sheet, with a clear "Load your own gear to optimise" call to action. Re-optimising on the recipient's side would require embedding the whole inventory (over URL limits, privacy-leaking) and is therefore not supported.

Encode compactly (pack + compress, base64url in `?b=`); if a payload ever exceeds the safe URL length, fall back to the URL fragment (`#`). `decodeBuild` is guarded so a malformed/old link yields a friendly empty state, never a throw.

## Consequences

- Links are robust, small, and privacy-safe.
- Build-level ([0006]) and meta selection ([0007]) must be part of the encoded state or shared builds render with wrong stats.
- Validation runs again inside the optimiser as a guard against malformed shared state.
