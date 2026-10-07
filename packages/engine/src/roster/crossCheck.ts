/**
 * A build checked against genshin.gg's (ADR-0060): where the site agrees
 * and where it doesn't, shown beside the artifact score and never counted
 * in it. Pure.
 * @packageDocumentation
 */
import type { StatKey } from '../game/types';
import { isSubStatKey } from '../game/genshin/substatRolls';
import { GENSHIN_GG_BUILDS } from '../meta/genshinGg';
import {
  CHECKED_SLOTS,
  type CheckedSlot,
  type QualityProfile,
} from './artifactQuality';

export interface CrossCheck {
  url: string;
  /** As genshin.gg labels it. */
  role: string;
  /** Its first-ranked set, or 2+2 pair. */
  topSet: string[];
  /** Whether the build recommends every set in it. */
  topSetAgrees: boolean;
  /** Main stats genshin.gg takes that the build doesn't, by slot. */
  extraMains: { slot: CheckedSlot; stats: StatKey[] }[];
  /** Substats genshin.gg lists that the build doesn't use. */
  extraSubstats: StatKey[];
  /** No difference in any of the above. */
  agrees: boolean;
}

/** genshin.gg's build against one of the character's, or null when the site
 *  has none for them. */
export function crossCheck(
  characterKey: string,
  build: QualityProfile,
): CrossCheck | null {
  const gg = GENSHIN_GG_BUILDS[characterKey];
  if (!gg) return null;
  const topSet = gg.sets[0] ?? [];
  const topSetAgrees =
    topSet.length > 0 && topSet.every((s) => build.recommendedSets.includes(s));
  const extraMains = CHECKED_SLOTS.map((slot) => ({
    slot,
    stats: gg.mains[slot].filter((s) => !build.accepts[slot].includes(s)),
  })).filter((m) => m.stats.length > 0);
  const extraSubstats = gg.substats.filter(
    (s) => isSubStatKey(s) && !build.usable[s],
  );
  return {
    url: gg.url,
    role: gg.role,
    topSet,
    topSetAgrees,
    extraMains,
    extraSubstats,
    agrees: topSetAgrees && !extraMains.length && !extraSubstats.length,
  };
}
