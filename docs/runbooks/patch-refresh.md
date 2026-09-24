# Runbook: per-patch data refresh

Run this every game patch. The optimiser itself is patch-agnostic; the hand-curated
tables underneath it are not.

> **Team recommendations are per-patch by design.** Abyss blessings, Imaginarium
> Theater element restrictions and Stygian Onslaught bosses change every patch, so
> _this runbook — not code — is what keeps them honest_, until per-mode modifiers are
> modelled as data (deferred; the shipped decision is
> [ADR-0018](../adr/0018-mode-aware-team-recommendation.md)).

## Checklist

1. **Refresh the dataset.**

   ```bash
   npm run build:data
   ```

   Bump the `genshin-db` dependency first if the new patch's characters or weapons are
   missing from it.

2. **Bump the patch string.** `PATCH` in `packages/engine/src/game/genshin/adapter.ts`. It is surfaced
   in the header chip, the footer, and the Teams curation note, so a stale value is
   visible to users.

3. **Re-verify each curated table** against its `source` URL and the patch notes:
   - `packages/engine/src/meta/metaTargets.ts` — build recipes (set, main stats, ER floor, objective,
     stat targets, signature weapon).
     Also re-read each guide's weapon ranking: a new banner weapon moves `weapon`, and
     a new craftable or battle-pass weapon moves `weaponAccessible`.
     Re-check any character whose kit was reworked.
   - `packages/engine/src/teams/comps.ts` — comp archetypes. New Abyss blessings can change which
     archetypes are top-tier, so **re-rank the `tier` values**, not just the rosters.
   - `packages/engine/src/damage/profiles.ts` — rotations and talent multipliers.
   - `packages/engine/src/damage/setBonuses.ts` — curated 4pc bonuses ([ADR-0020](../adr/0020-four-piece-set-bonuses-at-full-uptime.md)).
     Re-verify each entry against its `source` wiki page, and re-check
     `UNMODELLED_FOUR_PIECE`: a new patch's sets need an entry one side or the
     other, and a reworked set can move between them.

4. **Add entries for new characters.** Every character who is a weight-1.0 "ideal" pick
   in any archetype needs a `META_TARGETS` recipe — the coverage test in
   `packages/engine/src/teams/comps.test.ts` fails otherwise, because an uncovered ideal gets an
   unconstrained solve that returns a rainbow stat-stick.

5. **Verify and re-benchmark.**

   ```bash
   npm test
   npm run bench
   ```

   Commit the regenerated `docs/speed-report.md` if it changed.
