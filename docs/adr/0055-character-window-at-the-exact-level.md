# 0055. The character window, at the exact level

- Status: Accepted
- Date: 2026-10-06

## Context

The owner asked for a detailed character window, opened from every
character the app shows. It shows the character as they stand now: the
weapon (its level, refinement, stats, passive and description), the stats
as "base + what the artifacts add = total", the talents at their level with
the constellations' +3, and each artifact with its substats. A character
not in the roster opens too, and the character's art sits behind the
window (first at about 60% transparency, then 85% on the owner's
review).

The dataset only had stats at the eight build levels the optimiser
evaluates (1, 20, 40 … 90), and only flat numbers, with no passives,
talent names or constellation boosts. A character at level 83, or a weapon
at 85, had no exact numbers.

## Decision

- **Exact stats from the game's formula.** The dataset build writes
  `details.generated.json`: each character's and weapon's base stats,
  growth curve names and ascension bonuses, and the curves' multipliers for
  levels 1 to 100. A stat at any level is `base × curve[level]` plus the
  ascension bonus for the phase, with the phase taken from the export's
  ascension at a cap (`details.ts`, pure). The build checks the stored
  details against genshin-db's own `stats()` at every level from 1 to 90,
  before and after each ascension (66,740 checks), and fails on any
  difference.
- **Text from genshin-db too**: talent names; which talent C3 and C5 raise,
  read from their "Increases the Level of … by 3" text and matched to the
  talent names (119/120; Aloy has none); each weapon's passive as a template
  with its R1 to R5 values; and its description.
- **The sheet** (`roster/characterSheet.ts`, pure): per stat the base (the
  character's HP, ATK and DEF, ATK with the weapon's base ATK, or the
  game-wide 5% CRIT Rate, 50% CRIT DMG and 100% ER), what the artifacts add
  (main stats, substats and 2-piece bonuses, with HP%, ATK% and DEF%
  applied to the base), and what the weapon's substat and the ascension
  stat add, then the total. Weapon passives, 4-piece bonuses and
  constellations are left out, and the window says so: most depend on the
  fight, as in the game's own sheet. A test holds it to the optimiser's
  level 90 base for every character.
- **Current state only.** The window shows what the loaded account has on.
  Planned and optimised builds stay in their own sections.
- **One window for the app.** A store holds which character is open; any
  character button opens it (roster rows, team members, Plan and
  allocation rows, the Optimise portrait, "Works well with", the rotation
  library's portraits, a comparison's teams as run). The window and the
  details load on first open, so the first load carries neither.
- **The art** is the wish art from Enka (`UI_Gacha_AvatarImg_<name>`,
  linked, never stored, as ADR-0052), 85% transparent behind the content,
  which sits on cards to stay readable. "Show game art" off removes it.

## Consequences

- `details.generated.json` is 258 KB (63 KB gzipped), in its own chunk
  loaded with the window, and the window's code is another 4.8 KB. The
  first load grows by 0.3 KB (the window's host); the size baseline
  rises to 289,518 B for the lazy chunks.
- New characters and weapons need genshin-db to have their curves.
  Without them the window says the stats are missing instead of guessing.
- The roster's `weaponAscension` is kept from the import, so a weapon at a
  cap reads the right side of it.
