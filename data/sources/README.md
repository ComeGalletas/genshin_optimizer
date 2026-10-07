# Guide sources

What each guide site says about each character's builds, in dataset keys:
the input to the app's guide data ([ADR-0061](../../docs/adr/0061-offline-guide-data-pipeline.md)).
Reference material, not app code: nothing here is bundled.

| File                  | Site               | Read by                             |
| --------------------- | ------------------ | ----------------------------------- |
| `kqm.json`            | keqingmains.com    | `npm run sources -- kqm`            |
| `genshin-builds.json` | genshin-builds.com | `npm run sources -- genshin-builds` |
| `genshin-gg.json`     | genshin.gg         | `npm run sources -- genshin-gg`     |

## Refreshing

1. Read a site: `npm run sources -- kqm`. Add `--only=furina,nahida` for a
   few characters, `--refresh` to fetch pages again instead of using the
   cache in `var/cache/sources/`, and (KQM only) `--llm` to have the
   language model settle an unclear role or substat line.
2. Read the report the run writes to `var/reports/`: what changed, and
   every flag to check.
3. Write the app's data: `npm run data:guides`. It prints what changed
   against the app.
4. Review `git diff`, then commit the sources and the data together.

Never edit `packages/engine/src/meta/guideBuilds.ts` or
`genshinGg.generated.json` by hand: a test and `npm run data:guides --
--check` fail when they don't match these files.

## Other checks

- `npm run sources -- exceptions`: kit-based candidates for the stats a
  character can't use (`UNUSED_STATS`). Confirm each by hand.
- `npm run sources -- teams`: **test only**. genshin-builds' teams against
  the curated team archetypes, as a report.

## Energy Recharge

Each build has two figures (ADR-0062): `erMin` to burst every rotation and
`erEveryOther` to burst every other rotation, 100% when the guide says
Energy Recharge isn't worth building. A figure the guide doesn't label
counts as every rotation.

## Locked characters

A character with `"locked"` in a file keeps what it has: a fresh read
skips it and says so in the report. Thirteen KQM pages are locked because
the reader finds fewer builds on them than the 2026-10-07 agent read did
(it can't yet split variants written in prose): Bennett, Durin, Faruzan,
Fischl, Freminet, Ganyu, Kaeya, Nahida, Nilou, Sayu, Thoma, Yaoyao and
Mizuki. Remove the field to let the reader replace it.

## History

- 2026-10-07: seeded from the four-agent read of the guides and the
  committed genshin.gg data (reproducing the app's data exactly), then
  replaced by the first script read after the owner's review: the reader
  fixes, the previous read's values kept where a page misses them, the
  language model's roles for nine pages, and the thirteen locks.
