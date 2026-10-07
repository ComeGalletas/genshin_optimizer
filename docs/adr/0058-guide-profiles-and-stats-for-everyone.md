# 0058. Guide profiles, and crit and Energy Recharge for everyone

- Status: Accepted
- Date: 2026-10-07
- Amends: [0057](0057-combat-readiness-and-artifact-quality.md)

## Context

ADR-0057 scored artifacts only for the characters with curated targets.
That left 57 of the owner's 95 characters as "no recipe". Two of its rules
also undercounted:

- Crit counted only when a character's build aimed at it.
- Energy Recharge counted only up to a minimum, and not at all without one.

On 2026-10-07 every character without curated targets was checked against
the KQM quick guides and genshin-builds.com. That covered 67 characters:

- 64 have both guides. Heizou, Mizuki and Vesna have genshin-builds only.
- The two guides agree on the top set for 50.
- They build 8 for different roles: Aloy, Dehya, Dori, Durin, Freminet,
  Kaeya, Razor and Venti.

The owner reviewed the result and set these rules.

## Decision

### Guide profiles, for the artifact score only

`meta/guideProfiles.ts` (`GUIDE_PROFILES`) holds, for each of the 67:

- the main stats it accepts on the sands, goblet and circlet;
- the substats it uses;
- the recommended sets;
- an Energy Recharge minimum;
- the guide links.

These profiles are kept out of `META_TARGETS`. A meta target is also the
optimizer's default (set lock, main-stat locks, and `erTarget` as a hard
floor). Adding 67 of them would have changed every optimize run for these
characters, which the owner didn't ask for.

How a profile is built:

- **KQM's first build**, or genshin-builds' where KQM has no guide.
- **Main stats:** any either guide names. Where the two build the character
  for different roles, KQM's alone; genshin-builds' build is kept as
  `alternative`, written out and not scored.
- **Substats:** KQM's list.
- **Sets:** every set either guide names (for the recommended-set mark).
- **Energy Recharge minimum:** the lower bound of the first scenario KQM
  lists. Shown only (below).

`qualityProfile()` reads the curated target first and the guide profile
otherwise. Every character in the dataset now has one, so "no recipe" is
left for a character newer than the data.

### CRIT and Energy Recharge count for everyone

- **CRIT Rate and CRIT DMG** count for every character, supports and
  healers included. A perfect roll of either still counts 1, which keeps
  crit value's 2:1 balance. Main stats are unchanged: a crit circlet is
  accepted only where the build or guide names one.
- **Energy Recharge counts in full**, whether the character is under their
  minimum, past it, or has none. The minimum is shown with how far short
  they are, but never limits the score. Raiden's scaling exception goes,
  since everyone is now scored the way she was.

### Exceptions, by hand

`UNUSED_STATS` in `roster/artifactQuality.ts` lists the stats a kit makes
useless, each with a reason in plain words. The character window shows the
reason.

- **Kokomi:** no crit. Her passive lowers her CRIT Rate by 100%.
- **Mavuika:** no Energy Recharge. Her burst runs on Fighting Spirit.
- **Skirk:** no Energy Recharge. Her burst runs on Serpent's Subtlety.

Exceptions are added by hand. A check comparing each kit with the stats
(by hand or by the LLM) isn't feasible yet.

### One order for the stats

The score lists its stats in this order, in the result
(`QUALITY_STAT_ORDER`) and in the character window:

1. CRIT Rate, CRIT DMG
2. HP%, HP
3. ATK%, ATK
4. DEF%, DEF
5. Elemental Mastery
6. Energy Recharge

### Main stats at 7, and four bands

With crit and Energy Recharge counting for everyone, the owner rescaled
the score on 2026-10-07:

- **Main stats:** 7 points each for the sands, goblet and circlet, so up
  to 21 (was 10 each, up to 30).
- **Bands:** readiness must still be above 60. Then, by artifact score:

  | Band         | Artifact score |
  | ------------ | -------------- |
  | Well built   | over 35        |
  | Built        | 30 or more     |
  | Partly built | 21 or more     |
  | Unbuilt      | under 21       |

  Partly built starts where the three right main stats alone reach.

## Consequences

- On the owner's account, across 95 characters:

  | Band         | ADR-0057 | This ADR |
  | ------------ | -------: | -------: |
  | Well built   |        — |       49 |
  | Built        |       11 |        7 |
  | Partly built |       20 |        8 |
  | Unbuilt      |        7 |       31 |
  | No recipe    |       57 |        0 |
  - 26 of the Unbuilt wear no artifacts.
  - Supports gained the most from crit and Energy Recharge counting:
    Charlotte, Citlali, Kuki, Shenhe, Chevreuse and Nilou are now Well
    built.

- **A guide profile is a transcription, like `META_TARGETS`.** The links are
  the way to re-check it after a kit rework or a guide update.
- **Varka's goblet:** KQM ranks a Pyro, Hydro, Electro or Cryo DMG goblet
  above his own Anemo. The score accepts only Anemo until a profile can
  name an element.
- **`alternative` builds are text.** Scoring a second role is a later
  choice.
- **Kokomi, rechecked:** both guides take an HP% or Energy Recharge sands
  and recommend five more sets beside Ocean-Hued Clam; both were added. The
  owner's Kokomi wears KQM's Bloom build, scored as a healer until a
  character can have several builds.
