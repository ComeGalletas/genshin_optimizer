# Rotation library

Combat rotations for gcsim, one folder per rotation
([ADR-0041](../docs/adr/0041-rotation-library.md)):

- `rotation.gcsl.tmpl`: the action list, with `{{slot}}` wherever a character acts.
- `meta.json`: the slots and who can fill them, the fight, the source and the last
  validation run with the pinned gcsim.
- `reference.gcsl`: the builds the rotation was checked on.

`npm run sim:check` runs every rotation on its reference builds; `--record` saves the
result as its validation.

## Drafts and review

A language model can draft a rotation for a team with no published config (the
`draft_rotation` tool). It runs on the owner's builds and is saved only once gcsim runs it
cleanly, always as `draft` ([ADR-0043](../docs/adr/0043-drafted-rotations-and-owner-review.md)).
The owner reviews it with `npm run rotations -- review <id>`, which writes `review.md` with
the fight step by step, and promotes it with `npm run rotations -- promote <id>`. Any
change after the review needs a new one.

## Credits

The rotations come from the [KQM Sim Database](https://db.kqm.gg) (KeqingMains), the
community's library of gcsim configs, formerly gcsim's own database. Credit goes to KQM
and to each config's submitter. We keep their assumptions as published: the action list,
the reference builds, the target and the energy drops. Only character names become
placeholders.

| Rotation            | Status    | KQM Sim Database entry                                                                                                                | Published DPS |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------: |
| `ayaka-freeze`      | validated | [w7BJn6WncNQK](https://db.kqm.gg/db/w7BJn6WncNQK)                                                                                     |        67,106 |
| `mualani-burn-vape` | validated | [jH7Jc6tMWrNn](https://db.kqm.gg/db/jH7Jc6tMWrNn)                                                                                     |        79,441 |
| `nahida-aggravate`  | draft     | adapted from [kntc7TFbnPKp](https://db.kqm.gg/db/kntc7TFbnPKp), Fischl's build from [nnM6PpwP76n6](https://db.kqm.gg/db/nnM6PpwP76n6) |             — |
| `raiden-national`   | validated | [nRMmHwqrFrMn](https://db.kqm.gg/db/nRMmHwqrFrMn)                                                                                     |        66,102 |
| `skirk-mono-cryo`   | validated | [M8dHqNTHtRmm](https://db.kqm.gg/db/M8dHqNTHtRmm)                                                                                     |       118,821 |

The simulator is [gcsim](https://github.com/genshinsim/gcsim), run as an unmodified
external program at the version `config/tools.json` pins. See also
[`DATA_LICENSE`](../DATA_LICENSE).
