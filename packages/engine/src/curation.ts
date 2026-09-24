/**
 * The game patch the hand-curated tables were last checked against: meta
 * recipes (`meta/metaTargets.ts`), comp archetypes (`teams/comps.ts`), damage
 * profiles and 4pc set bonuses (`damage/`), and weapon obtainability
 * (`invest/obtainability.ts`).
 *
 * Kept apart from the reference snapshot's `gameVersion` on purpose. That one
 * is derived from genshin-db and moves with every data bump; this one only
 * moves when someone re-verifies the tables (docs/runbooks/patch-refresh.md).
 * The snapshot can cover a newer patch than the curation: characters and
 * weapons without curated entries are still optimised, just without a meta
 * target, damage profile or team slot.
 * @packageDocumentation
 */

export const CURATION_PATCH = '6.7';
