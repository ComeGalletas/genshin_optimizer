# Runbook: per-patch data refresh

Run this every game patch. The optimiser itself is patch-agnostic; the hand-curated
tables underneath it are not.

> **Team recommendations are per-patch by design.** Abyss blessings, Imaginarium
> Theater element restrictions and Stygian Onslaught bosses change every patch, so
> _this runbook — not code — is what keeps them honest_, until per-mode modifiers are
> modelled as data (deferred; the shipped decision is
> [ADR-0018](../adr/0018-mode-aware-team-recommendation.md)).

## The versions, and who moves them

| Value              | Where it lives                           | Shown in                              | Moves when                                   |
| ------------------ | ---------------------------------------- | ------------------------------------- | -------------------------------------------- |
| `genshinDbVersion` | snapshot (`data.generated.json`)         | footer                                | you bump genshin-db and rebuild (step 1)     |
| `generatedAt`      | snapshot; pinned in `GENSHIN_DB_RELEASE` | footer ("released …")                 | same; it is that release's date, not today's |
| `gameVersion`      | snapshot, derived from genshin-db's data | header chip, footer, speed report     | automatically, with the data (step 1)        |
| `CURATION_PATCH`   | `packages/engine/src/curation.ts`        | Teams note, footer ("Curated tables") | by hand, only after steps 3–4 (step 5)       |

`gameVersion` running ahead of `CURATION_PATCH` is normal between a data bump and the
curation pass: new characters are optimised, just without a meta target, damage profile
or team slot. The reverse is a bug, and a test rejects it.

## Checklist

1. **Refresh the dataset.**

   If the new patch's characters or weapons are missing from genshin-db, bump it
   first, and update `GENSHIN_DB_RELEASE` in `scripts/build-dataset.ts` to match
   (version and release date from `npm view genshin-db time`). The build refuses to run
   while they disagree with the installed package. Then:

   ```bash
   npm run build:data
   ```

   It prints what it built, for example:

   ```text
   genshin-db 5.2.14 (released 2026-09-21), game version 7.1
   ```

   Commit `data.generated.json` with the bump: CI rebuilds it and fails on any
   difference.

2. **Read the coverage report** to see what the patch added and what the curation owes it.

   ```bash
   npm run data:coverage
   ```

   - **Curated but missing from genshin-db** must say `none`. Anything listed is a key
     genshin-db renamed or dropped, and it breaks the curated entry that uses it (a test
     fails on it too). Fix the key in the curated table.
   - **In genshin-db with no curated data** lists the characters without a meta target,
     damage profile or team slot. The new patch's characters land here; they are the
     worklist for step 4.
   - **Meta picks with no obtainability entry** lists recommended weapons that
     `WEAPON_OBTAINABILITY` doesn't cover yet (step 3).
   - To see exactly what a bump added, save `npm run -s data:coverage -- --json` before
     and after and compare the `key` lists.

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
   - `packages/engine/src/invest/obtainability.ts` — how each recommended weapon is
     obtained. Every weapon a recipe names should have an entry; the coverage report's
     "no obtainability entry" line is the list to work through.

4. **Add entries for new characters.** Take them from step 2's "no curated data" list.
   Every character who is a weight-1.0 "ideal" pick in any archetype needs a
   `META_TARGETS` recipe — the coverage test in `packages/engine/src/teams/comps.test.ts`
   fails otherwise, because an uncovered ideal gets an unconstrained solve that returns a
   rainbow stat-stick. A character nobody has curated yet still works: the optimiser
   runs stat-only for them.

5. **Bump the curation patch, last.** Set `CURATION_PATCH` in
   `packages/engine/src/curation.ts` to the patch you just verified, and only once steps
   3–4 are done. It drives the Teams note ("Curated from KQM guides for patch …") and the
   footer, so bumping it early claims a check that never happened.

6. **Verify and re-benchmark.**

   ```bash
   npm test
   npm run bench
   ```

   Commit the regenerated `docs/speed-report.md` if its explored or pruned counts changed.
   Timings alone move between machines and sessions (see
   [baseline-phase0.md](../baseline-phase0.md)), so don't commit a report whose only
   change is timing.
