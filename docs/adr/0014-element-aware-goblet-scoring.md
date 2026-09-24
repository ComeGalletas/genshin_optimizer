# 0014. Element-aware goblet scoring

- Status: Accepted
- Date: 2026-07-15
- Amends: [0011](0011-elemental-dmg-as-single-fungible-stat.md)

## Context

[ADR-0011](0011-elemental-dmg-as-single-fungible-stat.md) collapsed all seven
elemental DMG% goblet flavours into one fungible `elemental_dmg` stat key,
accepting that the optimiser could surface a technically useless off-element
goblet (e.g. a Pyro DMG goblet for a Hydro character) if its sub-stat rolls
were better. Validating against a real 549-artifact account (Phase 1 of the
testing plan) confirmed this happens in practice and is the kind of thing
that breaks a player's trust in a recommended build on sight — it looks like
a bug, not a documented tradeoff.

Elemental DMG% appears **only as a goblet main stat** in Genshin (never a
sub-stat), so fixing this doesn't require touching the sub-stat model.

## Decision

Track which element a goblet's `elemental_dmg` main stat is, and zero out
its contribution when it doesn't match the character being optimised for —
without adding element-matching logic to the core solver.

- `Artifact` gains an optional `element?: Element` field
  ([src/game/types.ts](../../packages/engine/src/game/types.ts)), set only when
  `mainStat === 'elemental_dmg'`. `Element` is the 7-value union
  (`pyro`…`dendro`); `physical_dmg` stays a separate, unaffected `StatKey`.
  `genshin/adapter.ts`'s `CharacterMeta.element` (`Element | 'physical'`)
  reuses the same union rather than duplicating the literal type.
- The GOOD importer ([src/import/good.ts](../../packages/engine/src/import/good.ts)) now
  captures the element from `mainStatKey` (e.g. `pyro_dmg_` → `'pyro'`)
  instead of discarding it. Manual entry
  ([ArtifactForm.tsx](../../packages/web/src/components/ArtifactForm.tsx)) exposes the
  same choice as a dropdown, defaulting to unset ("any/unknown").
- The solver itself is untouched. `optimizeClient.ts`'s `optimize()` — which
  already has both the character key and the full inventory — pre-processes
  the inventory before dispatch: any artifact whose `element` is set and
  differs from the character's element is sent to the worker as a shallow
  copy with `mainStatValue: 0`. The off-element goblet is still a legal,
  scoreable piece (its sub-stats count normally); only its dead-weight main
  stat is zeroed. `search.ts` sees only stat vectors and never needs to know
  what "element" means.
- Artifacts with `element` unset (old GOOD imports re-parsed the same way
  keep it set; only pre-existing manual entries or share links minted before
  this change lack it) keep today's element-agnostic behavior — treated as
  on-element, never zeroed. This is a deliberate backward-compatible default,
  not a correctness claim.
- Share links ([src/share/url.ts](../../packages/engine/src/share/url.ts)) encode the new
  optional field; `isArtifact()` accepts it as optional so links minted
  before this change still decode.

## Consequences

- Off-element goblets no longer inflate a build's score with a main stat
  that does nothing in-game — the #1 trust-breaker found in real-account
  validation is fixed.
- `element` unset is treated as "on-element" rather than "unknown/exclude",
  so a manually-entered or old-format goblet without the field behaves
  exactly as before this change (no new infeasibility surprises).
- Re-collapsing to a single fungible key (reverting this ADR) would be a
  breaking change to `Artifact`, both importers, and share-link decoding —
  recording the decision so a future reader understands the field is load-
  bearing, not vestigial.

[0011]: 0011-elemental-dmg-as-single-fungible-stat.md
