/**
 * genshin.gg's build for each character (ADR-0060): a cross-check shown
 * beside the guide builds, never scored. One build a character, read by
 * `npm run sources -- genshin-gg` and written to `genshinGg.generated.json` by
 * `npm run data:guides` (ADR-0061).
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';
import data from './genshinGg.generated.json';

export interface GenshinGgBuild {
  url: string;
  /** As the site labels it: Main DPS, Sub DPS or Support. */
  role: string;
  /** Ranked; each entry is one 4-piece set or a 2+2 pair. */
  sets: string[][];
  mains: Record<'sands' | 'goblet' | 'circlet', StatKey[]>;
  substats: StatKey[];
}

/** The site, and the day the builds were read. */
export const GENSHIN_GG = { source: data.source, fetched: data.fetched };

export const GENSHIN_GG_BUILDS = data.builds as Record<string, GenshinGgBuild>;
