import type { OptimizeContext, OptimizeRequest, StatVec } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { getDamageProfile } from '../damage/profiles';
import {
  fourPieceVector,
  weightedHitKindShares,
  REPRESENTATIVE_ENDGAME_SHEET,
} from '../damage/setBonuses';
import { META_TARGETS } from '../meta/metaTargets';
import { DEFAULT_ENEMY } from '../damage/types';
import type { DamageContext, HitKind } from '../damage/types';

export function buildContext(req: OptimizeRequest): OptimizeContext {
  const base = genshinAdapter.baseStats(
    req.characterKey,
    req.weaponKey,
    req.buildLevel,
  );

  let damage: DamageContext | undefined;
  if (req.objective === 'avg_damage') {
    const profile = getDamageProfile(req.characterKey);
    // Fail loud, like adapter.baseStats does for an unknown character — a
    // silently stat-only "damage" ranking would be worse than an error.
    if (!profile)
      throw new Error(`Unknown damage profile: ${req.characterKey}`);
    damage = { profile, enemy: DEFAULT_ENEMY, charLevel: req.buildLevel };
  }

  // The hit-kind shares a 4pc's restricted DMG% is folded against (ADR-0020).
  // Computed once per run, here, for two reasons: every set must read the
  // identical shares (they are a property of the profile, not of the set), and
  // they have to be measured at a sheet someone would actually play. The bare
  // `base` vector has 0 EM and 5% CRIT Rate, so the character's curated endgame
  // targets are layered over it where they exist, and a documented default
  // otherwise.
  let shares: Partial<Record<HitKind, number>> | undefined;
  if (damage)
    shares = weightedHitKindShares(
      {
        ...base,
        ...(META_TARGETS[req.characterKey]?.statTargets ??
          REPRESENTATIVE_ENDGAME_SHEET),
      },
      damage,
    );

  // Emblem's Burst DMG scales with ER, which is not a constant across
  // candidates — so it is resolved once against the ER the build is being
  // optimised *toward*. The user's own floor wins over the profile's default,
  // because that is the number they told the search to hit.
  const erFloor =
    req.constraints.minStats?.er_pct ?? damage?.profile.erRequirement ?? 100;

  // 4pc bonuses come from the curated table, not the snapshot (ADR-0020): the
  // frozen dataset carries no `fourPiece` at all, because a 4pc effect is prose
  // until someone commits to an uptime assumption. Resolved once, here, so the
  // pruning bound and the leaf score read the identical vector (ADR-0004).
  const setBonuses: OptimizeContext['setBonuses'] = {};
  // Set display names, for the worker's set-requirement diagnostics
  // (`setRequirementLabelFrom`) — see the `setNames` doc on `OptimizeContext`
  // for why this is resolved here instead of the worker reaching for the
  // adapter itself.
  const setNames: Record<string, string> = {};
  const weaponType = genshinAdapter.weapon(req.weaponKey)?.type;
  for (const s of genshinAdapter.sets()) {
    const four: StatVec | undefined =
      fourPieceVector(s.key, { weaponType, damage, base, shares, erFloor }) ??
      s.fourPiece;
    setBonuses[s.key] = { two: s.twoPiece, four };
    setNames[s.key] = s.name;
  }

  const ctx: OptimizeContext = { base, setBonuses, setNames };
  if (damage) ctx.damage = damage;
  return ctx;
}
