import type {
  Artifact,
  OptimizeContext,
  OptimizeRequest,
  StatVec,
} from '../game/types';
import { hasErDerivedPassive } from '../game/genshin/passives';
import { buildContext, passiveQuery, type ContextExtras } from './context';
import { totals } from './score';

/**
 * One concrete build's totals as the character sheet shows them.
 *
 * The search resolves ER-derived passives (Engulfing Lightning, Mona,
 * Raiden) at the ER the build is optimised toward, so the bound stays a
 * constant (ADR-0042). A single known build doesn't need that: its own ER is
 * known, so they are resolved at it. Exact, because no passive grants ER
 * from ER: the first pass's ER is the build's ER.
 */
export function sheetTotals(
  req: OptimizeRequest,
  build: Artifact[],
  extras: ContextExtras = {},
): { ctx: OptimizeContext; totals: StatVec } {
  const ctx = buildContext(req, extras);
  const t = totals(ctx, build);
  if (!hasErDerivedPassive(passiveQuery(req))) return { ctx, totals: t };
  const atOwnEr: OptimizeRequest = {
    ...req,
    constraints: {
      ...req.constraints,
      minStats: { ...req.constraints.minStats, er_pct: t.er_pct ?? 100 },
    },
  };
  const exact = buildContext(atOwnEr, extras);
  return { ctx: exact, totals: totals(exact, build) };
}
