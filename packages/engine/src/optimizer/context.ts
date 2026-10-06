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
import {
  passiveAssumptions,
  passiveVector,
  type PassiveQuery,
} from '../game/genshin/passives';
import { addInto } from './score';
import type { DamageContext, HitKind } from '../damage/types';

/** What a request can't say but a ConstraintSpec can (TODO 4.2). */
export interface ContextExtras {
  /** Stats teammates add, on top of every build's totals. */
  buffs?: StatVec;
  /** The weights of the `weighted` objective. */
  weights?: StatVec;
  /** The enemy for `avg_damage`; resistance in percent (10 = 10%, ADR-0023),
   *  converted here to the damage engine's fraction. */
  enemy?: { level?: number; res?: number };
}

/** The ER a request's build is optimised toward (ADR-0020, ADR-0042): its
 *  own `minStats.er_pct`, else the character's damage-profile requirement,
 *  else 100. */
export function requestErFloor(req: OptimizeRequest): number {
  return (
    req.constraints.minStats?.er_pct ??
    getDamageProfile(req.characterKey)?.erRequirement ??
    100
  );
}

/** The passive lookup for a request, resolved at `erFloor`. */
export function passiveQuery(
  req: OptimizeRequest,
  erFloor = requestErFloor(req),
): PassiveQuery {
  return {
    characterKey: req.characterKey,
    weaponKey: req.weaponKey,
    refinement: req.refinement,
    buildLevel: req.buildLevel,
    erFloor,
  };
}

/** One line per passive a request's build carries: what is counted, at
 *  which ER, and what is left out (ADR-0042). `erFloor` overrides the
 *  request's own, for a concrete build resolved at its ER. */
export function passiveNotes(req: OptimizeRequest, erFloor?: number): string[] {
  return passiveAssumptions(passiveQuery(req, erFloor), {
    weapon: genshinAdapter.weaponName(req.weaponKey),
    character: genshinAdapter.characterName(req.characterKey),
  });
}

export function buildContext(
  req: OptimizeRequest,
  extras: ContextExtras = {},
): OptimizeContext {
  if (req.objective === 'weighted' && !extras.weights)
    throw new Error('the weighted objective requires weights');
  // The ER a build is optimised toward: the user's own floor first, because
  // that is the number they told the search to hit, then the profile's
  // default. Emblem's Burst DMG (ADR-0020) and the ER-derived passives
  // (ADR-0042) scale with ER, which is not a constant across candidates, so
  // both are resolved once, here, against it.
  const erFloor = requestErFloor(req);

  // Base stats from the snapshot, plus the curated passives (ADR-0042): a
  // passive is the weapon's or the character's, the same for every
  // candidate, so it belongs with the base. The damage formula scales
  // `base.atk/hp/def` by the percentages, and a passive adds none of those
  // three flat, so it only ever adds to the percentages.
  const base = genshinAdapter.baseStats(
    req.characterKey,
    req.weaponKey,
    req.buildLevel,
  );
  addInto(base, passiveVector(passiveQuery(req, erFloor)));

  let damage: DamageContext | undefined;
  if (req.objective === 'avg_damage') {
    const profile = getDamageProfile(req.characterKey);
    // Fail loud, like adapter.baseStats does for an unknown character — a
    // silently stat-only "damage" ranking would be worse than an error.
    if (!profile)
      throw new Error(`Unknown damage profile: ${req.characterKey}`);
    damage = {
      profile,
      enemy: {
        level: extras.enemy?.level ?? DEFAULT_ENEMY.level,
        res:
          extras.enemy?.res !== undefined
            ? extras.enemy.res / 100
            : DEFAULT_ENEMY.res,
      },
      charLevel: req.buildLevel,
    };
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
  if (extras.buffs && Object.keys(extras.buffs).length)
    ctx.buffs = extras.buffs;
  if (extras.weights) ctx.weights = extras.weights;
  return ctx;
}
