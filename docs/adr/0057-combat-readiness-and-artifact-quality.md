# 0057. Combat readiness and artifact quality, two scores

- Status: Accepted
- Date: 2026-10-06

## Context

The build score (`roster/buildScore.ts`) was one 0–100 number per
character:

- level: 25 points;
- talents: 20 points;
- weapon level: 15 points;
- artifact count: 10 points;
- artifact quality: 30 points.

Artifact quality was the crit value of the equipped pieces divided by 180,
for every character. So a finished healer or support, built on HP,
Elemental Mastery or Energy Recharge, read as half built: the owner's
Charlotte scored 17.5 of 30 there. And one number mixed two different
questions: how far the character has been levelled, and how good their
artifacts are for them.

The owner set the design on 2026-10-06, in several steps (TODO 10.7).

## Decision

### Combat readiness: 0–100, how far the character is levelled

Today's parts without artifact quality, scaled up evenly to 100. Each part
is evaluated the same way as before.

| Part            | Points | Measure                                                |
| --------------- | ------ | ------------------------------------------------------ |
| Character level | 36     | the ascension cap ÷ 90                                 |
| Talents         | 29     | (normal attack + skill + burst) ÷ 27, so 9/9/9 is full |
| Weapon          | 21     | weapon level ÷ 90                                      |
| Artifact count  | 14     | equipped pieces ÷ 5                                    |

A crown shows beside the score for each talent at level 10, counting the
talent's own level and not the constellations' +3. Level 10 takes a Crown
of Insight, so the crowns show that investment without changing the score.

The team recommendations read combat readiness alone. The roster lists
the most ready first. Ties are common on a levelled account (44 of the
owner's 95 characters are at 100), so they break by crowns, then by name.
Substats never enter readiness.

### The band, from both scores

The owner's rule (2026-10-06):

- **Built:** readiness above 60 and an artifact score of 50 or more, so
  good substats on top of the main stats.
- **Partly built:** readiness above 60 and an artifact score of 30 or more,
  so at least the right main stats on sands, goblet and circlet.
- **Unbuilt:** anything else. A levelled character wearing nothing scores 0
  for artifacts, so they're unbuilt, not built.
- **No recipe:** a character without curated targets has no artifact score.
  They get this neutral band rather than being called unbuilt, until
  TODO 10.2 brings their data.

On the owner's account this gives 10 built, 20 partly built, 7 unbuilt
and 58 no recipe.

### Artifact quality: a score with no cap, for this character

**Main stats: up to 30 points.** 10 points each for sands, goblet and
circlet when the piece's main stat is one the character accepts. Flower and
plume always carry flat HP and flat ATK, so they aren't checked. A slot can
accept several main stats.

**Substats: good rolls, in roll-equivalents.** For each substat on an
equipped piece that the character uses:

> value ÷ that stat's largest single 5★ roll

A perfect roll counts 1, a lowest-tier roll 0.7, and the sum is the
substat score. Every usable stat counts the same, with two exceptions:

- **Flat versions:** flat HP, ATK and DEF count at **0.4**, for every
  character. One flat roll is worth about 40% of a percent roll at endgame
  base stats.
- **Energy Recharge:** it counts only until the character's total Energy
  Recharge reaches their minimum, measured from their base stats, weapon,
  main stats and set bonuses. Past the minimum it counts nothing, except
  for characters whose damage scales with it (Raiden), where every roll
  counts.

Crit value counts through its two stats: a CRIT Rate roll and a CRIT DMG
roll are each one roll, which keeps crit value's 2:1 balance.

**The score is main points + good rolls**, shown beside the most good rolls
possible:

> main stats 3 of 3 · 28.4 good rolls of 38 possible

The possible figure is exact for the character's pieces. Each piece can
hold at most four lines, none of them its own main stat, and five upgrades
into its best usable line. Scores compare artifacts for one character. A
character who uses more stats can reach more, and the "of possible" figure
is how two characters are read side by side.

### Which stats a character uses, and which main stats they accept

These come from the curated targets (`meta/metaTargets.ts`, 52 of 120
characters) until the build sources of TODO 10.2 give each character's
substat priorities:

- **Scaling stat:** the objective when it's a stat (HP%, ATK%, DEF%, EM),
  else the sands' main stat when it is one of those, else ATK%.
- **Usable stats:**
  - the scaling stat, with its flat version at 0.4;
  - crit, when the objective is crit value or the targets name a crit
    stat;
  - any stat the targets name;
  - Energy Recharge, when the character has a minimum or scales with it.
- **Accepted main stats:** the curated one for each slot, plus the scaling
  stat. The goblet also accepts the character's own elemental DMG; the
  circlet also accepts CRIT Rate and CRIT DMG when crit is usable.
- **Exceptions, listed in code:** Raiden's Energy Recharge scales. Kuki
  uses HP% (her skill's damage and healing scale with HP), and she and
  Bennett accept a Healing Bonus circlet as healers. Kokomi's crit is
  unused, which follows from her HP objective. These came from checking the
  lowest scores on the owner's account against each character's KQM guide.
  The same check found Bennett scored against a support recipe while
  geared for damage, and Xingqiu wearing two pieces: both fair.
- **Several recommended sets:** a curated entry can list `otherSets`, the
  4-piece sets the guides rank close behind its set requirement. The set
  star counts them all. The optimizer's set requirement stays one set.
- **Chiori** was added on 2026-10-06 after comparing KQM, genshin-builds
  and Game8, as the test of that comparison. All three rank Golden Troupe
  first, KQM and genshin-builds rank Husk second, and all agree on CRIT >
  DEF% > ATK%. Her score is about 54.5, so Built.
- **A character with no curated targets shows "no recipe yet"**, never a
  guessed score.

### Where it shows

- Both scores on the Roster, Teams and Plan rows.
- The character window's Overview: both scores and how each is computed.
- The Gear tab: a marker beside a set when it's the set the character's
  build recommends.

## Consequences

- The scores are new numbers and change the roster order and the team
  picks. Characters built on HP, EM or Energy Recharge stop reading as half
  built.
- The 0.4, the 10 points per main stat and the reliance on curated targets
  are starting values for testing. They live in one table each.
- 68 characters show "no recipe yet" until TODO 10.2 adds sources.
- Energy Recharge is measured at the character's build level (the dataset
  the optimizer uses), not their exact level. The difference is a fraction
  of a roll.
- Supersedes the artifact-quality part of the build score described in the
  glossary. The grade (S–D against stat targets) is unchanged.
