/**
 * Display copy shared by every surface (web UI, server, LLM tool output). The
 * adapter-free half lives in `labels-core.ts` (kept adapter-free for the
 * explain payload — see the note there); this file adds the parts that need the dataset adapter,
 * and re-exports the core. UI-only mappings (tones) live in the web app's
 * `packages/web/src/labels.ts`, which re-exports this module.
 * @packageDocumentation
 */

import { genshinAdapter } from './game/genshin/adapter';
import type { SetRequirement } from './game/types';
import type { Band } from './roster/buildScore';
import type { Role } from './teams/types';
import { formatSetNameFrom, setRequirementLabelFrom } from './labels-core';

export * from './labels-core';

// Built once from the live adapter so `formatSetName`/`setRequirementLabel`
// below can defer to the adapter-free lookups in `labels-core.ts` (see the
// comment on `formatSetNameFrom` for why that split exists).
const SET_NAMES: Record<string, string> = Object.fromEntries(
  genshinAdapter.sets().map((s) => [s.key, s.name]),
);

/** Display names for team roles — user-visible copy lives here, not next to the
 *  `Role` union it labels. */
export const ROLE_LABELS: Record<Role, string> = {
  'on-field-dps': 'On-field DPS',
  'off-field-dps': 'Off-field DPS',
  buffer: 'Buffer',
  sustain: 'Sustain',
  battery: 'Battery',
  applicator: 'Applicator',
};

/** Band → its user-visible label. The union's members are lowercase keys, not
 *  copy: rendering `b` directly printed "partial" mid-sentence. */
export const BAND_LABELS: Record<Band, string> = {
  built: 'Built',
  partial: 'Partly built',
  unbuilt: 'Unbuilt',
};

export function bandLabel(b: Band): string {
  return BAND_LABELS[b] ?? b;
}

/** The display name for a set key. Prefers the dataset's real name (which
 *  carries apostrophes and lowercase articles the PascalCase key can't), and
 *  falls back to splitting the key into spaced words for keys the frozen
 *  snapshot doesn't know (a GOOD export newer than the snapshot). Coerced
 *  first: inventories persisted before the import guards landed can still
 *  hold a non-string setKey, and this runs during render. */
export function formatSetName(setKey: string): string {
  return formatSetNameFrom(setKey, SET_NAMES);
}

/** The one rendering of a meta recipe's set requirement. */
export function setRequirementLabel(r: SetRequirement): string {
  return setRequirementLabelFrom(r, SET_NAMES);
}
