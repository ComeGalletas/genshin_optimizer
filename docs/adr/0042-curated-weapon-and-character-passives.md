# 0042. Curated weapon and character passives in base stats

- Status: Accepted
- Date: 2026-10-05
- Amends: [0009](0009-adapter-owns-universal-game-baselines.md) (base stats now include passives) and the "weapon passives are not modelled" gap [0003](0003-stat-only-model-no-damage-engine.md) left open

## Context

The stat engine's base stats were the character's base, the weapon's base ATK
and secondary stat, and the universal baselines (ADR-0009, ADR-0040). Weapon
passives and character passives were not modelled: genshin-db has them as
prose, and the frozen snapshot carries none of them.

TODO 5.5's cross-check against gcsim v2.48.8 (2026-10-05) showed what that
costs. Of the owner's 18 seed-team characters, after the crit-baseline fix, 10
differed from the final stats gcsim reports, each by exactly a passive: Aqua
Simulacra's +16% HP (Yelan, Fischl), Mistsplitter's +12% Elemental DMG
(Bennett, Ayaka), Skyward Spine's +8% CRIT Rate (Xiangling), Engulfing
Lightning's ATK from Energy Recharge (Raiden), Mona's and Raiden's own
ER-to-DMG passives, and so on. So the sheet the app showed was wrong for those
characters, a CRIT Rate floor asked Xiangling for 8 points she already had,
and `avg_damage` valued a DMG goblet on a Mistsplitter holder as if the weapon
added nothing.

## Decision

### A curated table, like 4-piece bonuses

`packages/engine/src/game/genshin/passives.ts` holds two hand-curated tables,
in the manner of ADR-0020's `setBonuses.ts`:

- `WEAPON_PASSIVES`, keyed by weapon: the stat each passive grants, **one
  value per refinement** (R1..R5), the genshin-db value index it was
  transcribed from (`param`), what the rest of the passive does that is not
  counted (`notModelled`), and a source.
- `CHARACTER_PASSIVES`, keyed by character: the stat, the talent it belongs
  to, and the lowest build level that has it. A passive unlocked at
  Ascension 4 counts from build level 70, which is Ascension 4's level cap
  (ADR-0015); Kokomi's innate passive counts at every level.

It covers 42 weapons and 4 characters (Xingqiu, Mona, Raiden Shogun,
Sangonomiya Kokomi). Weapons were found by sweeping every 3★ to 5★ weapon in
the dataset through gcsim at R1 and R5, and by scanning genshin-db's passive
text for unconditional stat clauses; each candidate was then read in
genshin-db to decide whether the bonus is unconditional.

`UNMODELLED_WEAPON_PASSIVES` lists, with the reason, the meta-relevant weapons
whose passive has no static part (Beacon of the Reed Sea's HP only while
unshielded, Staff of the Scarlet Sands' ATK from EM, Deathmatch's enemy count).
Weapon and character passives that grant nothing on the sheet need no entry.

### What counts

- **Static passives**: an unconditional stat bonus scaled by refinement
  ("ATK is increased by 20/25/30/35/40%"). Exact for every build.
- **"All DMG" bonuses** (Freedom-Sworn, Skyward Pride) go into both
  `elemental_dmg` and `physical_dmg`, since they apply to every hit. gcsim
  keeps them as a separate stat.
- **One stack the wielder always has**: The First Great Magic's Gimmick
  stack counts the wielder, so its first ATK tier is unconditional. Only that
  tier counts.
- **ER-derived passives** (Engulfing Lightning's ATK from ER above 100%;
  Mona's Hydro DMG at 20% of ER; Raiden's 0.4% Electro DMG per 1% ER above
  100%) are **resolved once, at the ER the build is optimised toward**, the
  rule ADR-0020 set for Emblem of Severed Fate: the request's
  `minStats.er_pct`, else the character's damage-profile requirement, else 100
  (`requestErFloor`, shared with Emblem). A per-candidate value would make the
  base non-constant and break the pruning bound (ADR-0004).

Not counted: conditional effects (stacks, "after a Skill", enemy count, HP
thresholds, off-field), passives derived from a stat other than ER (Staff of
Homa's and Primordial Jade Cutter's ATK from HP, ATK or ER from EM), DMG bonuses
restricted to some hits (Polar Star's Skill and Burst DMG), and account
progress (the Melusine half of Ultimate Overlord's Mega Magic Sword). Unlike
4-piece bonuses (ADR-0020), conditional weapon passives are not counted at full
uptime. The weapon is fixed for a whole run, so a full-uptime constant could
only shift every candidate together, and their uptimes vary far more than a
set's. gcsim simulates them, and the sim re-rank (TODO 5.8) is where they
belong.

### Where it is applied

`buildContext` adds the passive vector to `ctx.base`, beside the weapon's
secondary stat. A passive is the same for every candidate, so it is part of
the base. Passives add only percentages and EM, never flat HP, ATK or DEF, so
`effectiveStat` and the damage formula, which scale `base.atk/hp/def` by the
percentages, need no change. Admissibility holds by construction: the bound and
the leaf read the same constant base. Two oracle tests run the real
`buildContext` with passives: Raiden with R5 Engulfing under `avg_damage` and
an ER floor, and Kokomi's −100% CRIT Rate under a crit floor.

A **concrete build's sheet** (`sheetTotals`, used by `GET /characters/:id`,
`compare_builds` and the roster grade) resolves the ER-derived passives at
that build's own ER instead. This is exact, since no passive grants ER from
ER.

### Refinement comes from the owner's weapon

`OptimizeRequest.refinement` (1..5, optional). Unset means **R1**, the least
any copy has, so a passive is never overstated. The refinement is the copy
the character holds when the request names their weapon, otherwise the most
refined copy the account owns (`ownedRefinement`), otherwise R1. GOOD
weapons carry refinement. The roster entry now records the held weapon's
(`weaponRefinement`), and the server reads the snapshot's weapon list. Share
links accept the field and reject a value outside 1..5. The "I understood"
summary names it ("Engulfing Lightning R5").

### Disclosure

`passiveAssumptions` / `passiveNotes` give one line per passive a build
carries. Each line says what is counted, at which refinement, at which ER
for an ER-derived passive, and what is left out. A weapon in
`UNMODELLED_WEAPON_PASSIVES` gets a "not counted" line, and an Ascension 4
passive below level 70 gets an "unlocks at" line. The server returns them as
`passives` on `/optimize`, spec runs and `/characters/:id`, and the MCP tools
pass them on.

## Verification

- **Against genshin-db:** a unit test reads every weapon value at every
  refinement (and Engulfing's caps) from the installed genshin-db at the
  recorded `param`, and every character value from the passive's text. A
  genshin-db correction can't drift past it.
- **Against gcsim:** a live test (where `npm run sim:check` installed the
  binary) runs a one-character config for every table weapon at R1 and R5 and
  for every character passive, and compares gcsim's
  `character_details[0].snapshot` with our totals. 87 cases pass. Known
  differences are asserted with their exact size: gcsim's opening snapshot
  lacks Thundering Pulse's static ATK (genshin-db has it); gcsim counts the
  Melusine ATK on Ultimate Overlord's; Jade Cutter and Homa differ by exactly
  their ATK-from-HP. gcsim at the pin doesn't implement Breezeborne Refrain or
  Hymn of the Maelstrom, so those two are checked against genshin-db only.
- The 5.5 cross-check on the sample account now matches gcsim for **all 8**
  characters, where 4 used to differ by a passive.

## Consequences

- Sheet totals, stat floors and `avg_damage` include the passives for every
  covered weapon and character. Totals on a card can now differ from an
  in-game sheet only by a conditional effect, and the passive lines say which.
- For a build above its ER floor, an ER-derived passive is undercounted by
  the ER above the floor. That is conservative, the same convention as Emblem,
  and stated in the passive's line. Where the floor comes from the damage
  profile and is not a constraint, a build below it is overcounted by the
  same rule. Default runs carry the profile's ER as a floor (`defaultConstraints`),
  so this case needs an explicit spec without one.
- The benchmark's character (Aino with Absolution) now has +20% CRIT DMG in
  its base, which moved one pruned count through the crit-ratio tiebreak.
  Explored counts are unchanged and the speed report is regenerated.
  `bench:check` watches `passives.ts`.
- A third curated table to refresh. It is on the patch-refresh runbook: a new
  weapon needs an entry in the table or in `UNMODELLED_WEAPON_PASSIVES`.
- **Not done here:** hit-kind restricted weapon passives (The Catch, Wolf-Fang,
  Uraku's Normal and Skill DMG) could use ADR-0020's `hitDmg` channel for
  `avg_damage`. That is left for a follow-up, so this decision changes one thing
  at a time.
