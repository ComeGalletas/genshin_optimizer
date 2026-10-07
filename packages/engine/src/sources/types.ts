/**
 * What the offline source readers produce (ADR-0061): one source's builds
 * and teams for a character, in dataset keys. Read from `data/sources/`,
 * merged into the app's data by `npm run data:guides`. Pure types.
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';
import type { BuildRole } from '../meta/guideBuilds';

export type Slot3 = 'sands' | 'goblet' | 'circlet';

export interface SourceBuild {
  /** As the source names it. */
  name: string;
  role: BuildRole;
  /** Whether the role came from the source's own label or was guessed from
   *  the build's name. */
  roleFrom: 'label' | 'name' | 'review';
  /** The constellation the build needs, such as "C6". */
  constellation?: string;
  mains: Record<Slot3, StatKey[]>;
  /** In the source's order. */
  substats: StatKey[];
  /** Ranked; each entry is one 4-piece set or a 2+2 pair. Generic 2-piece
   *  mixes ("2pc ATK% + 2pc ATK%") are left out. */
  sets: string[][];
  /** Including the base 100%: the lower bound of the first case given. */
  erMin?: number;
  erWeapons?: { weapon: string; min: number }[];
  /** Why the build is left out of the app's data (the source marks it not
   *  recommended or out of date). */
  excluded?: string;
  /** What a person should check: anything read loosely or not at all. */
  flags?: string[];
  /** A reader's note (the 2026-10-07 agents left one where a page was
   *  unclear). */
  notes?: string;
}

export interface SourceTeamMember {
  characterKey: string;
  /** As the source labels it. */
  role: string;
  /** The least constellation the team needs, when given. */
  minConstellation?: number;
}

export interface SourceTeam {
  name: string;
  /** As the source ranks it (SS, S, A...), when it does. */
  tier?: string;
  members: SourceTeamMember[];
}

export interface SourceCharacter {
  url: string;
  /** The day the page was read. */
  fetched: string;
  /** What the page says it was updated for, as written. */
  updatedFor?: string;
  builds: SourceBuild[];
  teams?: SourceTeam[];
  /** Problems reading the page as a whole. */
  issues?: string[];
}

export type SourceName = 'kqm' | 'genshinBuilds' | 'genshinGg';

export interface SourceFile {
  source: SourceName;
  site: string;
  /** How the data was read: by the offline script, or the 2026-10-07 agent
   *  pass it replaces. */
  readBy: 'script' | 'agents';
  characters: Record<string, SourceCharacter>;
}
