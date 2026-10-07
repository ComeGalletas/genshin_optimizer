# 0059. Several builds per character

- Status: Accepted, amended by [0061](0061-offline-guide-data-pipeline.md)
  (the builds are now rebuilt from `data/sources/` by script), and by
  [0062](0062-two-energy-recharge-figures.md) (two Energy Recharge figures)
- Date: 2026-10-07
- Amends: [0058](0058-guide-profiles-and-stats-for-everyone.md)

## Context

ADR-0058 gave each character one profile: KQM's first build. Many
characters are built more than one way. The owner's Kokomi wears KQM's Bloom
build (Flower of Paradise Lost, EM sands and goblet), yet she was scored as a
healer: 27.3, Partly built.

The owner set the rules on 2026-10-07 (TODO 10.8).

## Decision

### The data: every build the guides list

`meta/guideBuilds.ts` (`GUIDE_BUILDS`) holds every artifact build in the
KQM guides and on genshin-builds.com, for all 120 characters in the dataset.
Game8 stays links only. The table was read by four agents and checked
against the dataset's keys. It replaces ADR-0058's one-profile table
(`meta/guideProfiles.ts`).

- **The KQM quick guide wherever one exists.** 25 curated characters linked
  KQM's older full guides; each has a current quick guide, and the pass read
  those. Xinyan and Yun Jin have no quick guide and keep their full guides.
  Vesna has no KQM guide.
- **A build** has a name and role, the constellation it needs (if any), its
  accepted main stats per slot, substats, ranked sets, and its Energy
  Recharge minimum and weapon figures. Each comes from that one guide build.
- **Roles:** on-field DPS, off-field DPS, support, healer, shield, and
  reaction DPS.
- **Merged by role:** a genshin-builds build joins the KQM build with the
  same role and constellation. The merged build takes the main stats and sets
  either guide names, and KQM's substats and Energy Recharge figure. Other
  builds stay separate. This gives 200 builds; 51 characters have more than
  one.
- **Left out:** builds their own guide marks not recommended or out of date.
  That's 11 on genshin-builds, and KQM's Dori "Pure Healer".
- **Not scored:** builds the guide leaves a main stat or the substats out of
  are listed with the reason, and the window says so. There are 3: Faruzan's
  pre-C6 and Gorou's builds have no goblet main stat; Venti's genshin-builds
  on-field build has no circlet one.
- **Constellation builds** (Faruzan at C6, Noelle at C6) are separate builds,
  named with the constellation.

### Scoring: the best fit counts

- Each build is scored on its own against the pieces worn, with ADR-0058's
  rules: 7 per accepted main stat, and good rolls on the stats it uses, with
  crit and Energy Recharge for everyone apart from `UNUSED_STATS`.
- **The best-scoring build counts**, the first on a tie, for the roster, the
  bands, the teams and the plan. Builds are never merged for scoring, so a
  second build can't raise a score by mixing two roles.
- **For curated characters too:** their guide builds replace the curated
  target for scoring. The curated target stays the optimizer's default only.
  A character the guides don't cover falls back to their curated target as
  one build.
- ADR-0057 and ADR-0058's hand overrides (Kuki's HP and Healing Bonus
  circlet, Bennett's Healing Bonus circlet, Chiori's ATK%, Kokomi's Energy
  Recharge sands) are gone. Their guide builds carry them, apart from the
  ATK% sands Chiori's Game8 check added, which neither guide lists.

### The character window

- The Artifact quality card names the build it scored and the guides it
  comes from. It has a picker listing every build with its score, marking
  the best fit. The score, "of possible", the recommended-set stars on the
  Gear tab and the Energy Recharge minimum follow the build shown.
- **Energy Recharge is the only threshold that changes per build.** Each
  build shows its own guide's minimum (Kokomi: 195% on-field healer, 260%
  off-field, none for Bloom). It never limits the score.
- **The weapon tag:** the minimum ignores weapons, as the score does. The
  Energy Recharge line names the weapon held, with the Energy Recharge its
  substat gives, and the guide's figure for that weapon when the build has
  one ("the guide asks 190% with Favonius Codex").
- Builds that can't be scored are listed under the card, with why.

### The optimizer

Beside "Minimum Energy Recharge %", a picker lists the character's builds
that give a figure. Picking one fills only the Energy Recharge floor. The
set requirement and main-stat locks stay as they are, and "Use meta build"
still applies the curated target.

## Consequences

- On the owner's account (95 characters):

  | Band         | One build | Best fit |
  | ------------ | --------: | -------: |
  | Well built   |        49 |       56 |
  | Built        |         7 |        3 |
  | Partly built |         8 |        5 |
  | Unbuilt      |        31 |       31 |
  - Moved up: Bennett (invested support), Alhaitham, Dehya (on-field DPS),
    Kokomi (Bloom, 27.3 to 41.2), Mizuki (Stellar Swirl), Hu Tao and Kazuha.
  - Raiden gains 9 points from her on-field build, Xiangling 7.

- **Curated targets are out of date.** 39 of the 53 differ from their current
  KQM quick guide in set, main stats or Energy Recharge. Refreshing them
  changes the optimizer's defaults and floors, so it is its own reviewed
  step (TODO 10.9), not part of this one.
- **The guide data is a transcription.** The guide links on each character
  are the way to re-check it. Several genshin-builds descriptions name the
  wrong character; the stats were checked and look right.
- Some builds were split from one shared KQM table (Venti, Yaoyao, Thoma,
  Bennett, Nahida, Fischl). Those splits are the reading of the agents that
  collected them.
