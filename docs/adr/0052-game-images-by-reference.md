# 0052. Game images by reference

- Status: Accepted
- Date: 2026-10-06

## Context

The app shows characters, weapons and artifacts by name only. Phase 9 asks
for their pictures. They are HoYoverse's art: copying them into an MIT
repository, or into the bundle, would republish them, grow both by
megabytes and age with every patch. genshin-db, the dataset's source
(ADR-0002), lists each one's asset name (`UI_AvatarIcon_Furina`,
`UI_EquipIcon_Sword_Regalis`, `UI_RelicIcon_15032_4`) and HoYoverse's URL
for it.

## Decision

- **Referenced, never copied.** The dataset build records each
  character's, weapon's and set's asset name in `images.generated.json`,
  apart from the dataset: only the varying part (`Furina`,
  `Sword_Regalis`, a set's number), since the names follow the game's
  pattern for all 432 entries (a set's pieces are numbered flower 4,
  plume 2, sands 5, goblet 1, circlet 3); a name outside the pattern stops
  the build rather than being guessed. CI rebuilds the file and checks it
  unchanged, as it does the dataset. 13 KB, 5.6 KB gzipped, loaded after
  the page starts.
- **Hosts: Enka first, HoYoverse second.** The owner chose HoYoverse first
  on the expectation that the publisher's own host was the safer one.
  Checked over the whole dataset (2026-10-06): Enka
  (`enka.network/ui/<asset>.png`) serves 120/120 characters, 253/253
  weapons and 59/59 sets; HoYoverse's URLs from genshin-db serve 66, 155
  and 41, newer items not at all. HoYoverse first would cost a failed
  request for some 40% of images, so Enka goes first and HoYoverse stays
  as the fallback for when Enka can't serve one.
- **One component**, `GameImage`: the URLs in order, then the caller's
  fallback (the app's glyph or initials) when both fail, before the names
  arrive, or with game art off. A fixed box, so nothing moves; lazy; no
  referrer, so a share link's build stays out of the hosts' logs; empty
  alt text unless the name isn't printed beside it.
- **"Show game art"**, on by default and kept in the browser: every image
  load reaches Enka or HoYoverse, who see the reader's address, in an app
  that otherwise talks only to its own local server.

## Consequences

- Pictures depend on a third-party host; when both fail, the app reads as
  it did before Phase 9.
- A character or item newer than the dataset's snapshot has no name, so
  its fallback shows until `npm run build:data` picks it up.
- Turning game art off removes every external image request.
