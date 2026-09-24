/**
 * The exact branch-and-bound optimiser (ADR-0004): explores per-slot
 * artifact pools, scores builds and constraint satisfaction, and returns the
 * top-K valid builds by objective, plus the diagnostics and benchmark
 * instrumentation that explain and measure the search.
 * @packageDocumentation
 */

import type {
  Artifact,
  ScalarObjective,
  OptimizeContext,
  OptimizeRequest,
  OptimizeResult,
  BuildResult,
  Slot,
  StatKey,
  StatVec,
} from '../game/types';
import { SLOTS } from '../game/types';
import {
  totals,
  objectiveValue,
  evaluateObjective,
  satisfies,
  critRatioPenalty,
  addInto,
  subFrom,
  artifactContribution,
} from './score';
import { buildDiagnostics } from './diagnostics';

function poolsBySlot(
  inventory: Artifact[],
  req: OptimizeRequest,
): Record<Slot, Artifact[]> {
  const pools = {} as Record<Slot, Artifact[]>;
  for (const slot of SLOTS) {
    let pool = inventory.filter((a) => a.slot === slot);
    const lock = req.constraints.mainStatLocks?.[slot];
    if (lock) pool = pool.filter((a) => a.mainStat === lock);
    pools[slot] = pool;
  }
  return pools;
}

/** Inclusive suffix count: how many of pools[slotIndex..end] contain at least
 *  one artifact matching `setKey` — an admissible upper bound on how many more
 *  set-matching pieces could still be picked from here on. */
function suffixSetPotential(
  pools: Record<Slot, Artifact[]>,
  order: Slot[],
  setKey: string,
): number[] {
  const flags = order.map((s) => pools[s].some((a) => a.setKey === setKey));
  const suffix = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--)
    suffix[i] = suffix[i + 1] + (flags[i] ? 1 : 0);
  return suffix;
}

interface RelevantSetBonus {
  key: string;
  two: number;
  four: number;
  /** Inclusive suffix count of how many more pieces of this set could still
   *  be picked from pools[slotIndex..end] — see suffixSetPotential. */
  remaining: number[];
}

/** Sets whose 2pc/4pc grants a nonzero contribution to this objective — most
 *  sets grant 0 (their bonus is a different stat, or unscored per ADR-0003),
 *  so this list is typically tiny (0-5 entries) even across a full dataset. */
function relevantSetBonuses(
  ctx: OptimizeContext,
  objective: ScalarObjective,
  pools: Record<Slot, Artifact[]>,
  order: Slot[],
): RelevantSetBonus[] {
  const out: RelevantSetBonus[] = [];
  for (const key of Object.keys(ctx.setBonuses)) {
    const b = ctx.setBonuses[key];
    const two = b.two ? objectiveValue(b.two, objective) : 0;
    const four = b.four ? objectiveValue(b.four, objective) : 0;
    if (two || four) {
      out.push({
        key,
        two,
        four,
        remaining: suffixSetPotential(pools, order, key),
      });
    }
  }
  return out;
}

/**
 * Admissible over-estimate of the objective gain any reachable set-bonus layout
 * can grant (ADR-0004), given how many pieces of each relevant set are already
 * chosen (`matched`, parallel to `relevant`) and how many more could still be
 * picked from here (`relevant[i].remaining[slotIndex]`). Unlike a single
 * global constant, this shrinks as choices rule sets out — e.g. once a set's
 * 2pc is no longer reachable, its contribution drops out of the bound instead
 * of inflating every branch's ceiling for the rest of the search.
 */
function setBonusCeilingAt(
  relevant: RelevantSetBonus[],
  matched: number[],
  slotIndex: number,
): number {
  let bestSingle = 0;
  // Top two `two` values across distinct sets, tracked without allocating —
  // this runs once per search node (potentially hundreds of thousands of times).
  let top1 = 0;
  let top2 = 0;
  for (let i = 0; i < relevant.length; i++) {
    const r = relevant[i];
    const feasibleMax = matched[i] + r.remaining[slotIndex];
    const two = feasibleMax >= 2 ? r.two : 0;
    const four = feasibleMax >= 4 ? r.four : 0;
    bestSingle = Math.max(bestSingle, two + four);
    if (two > top1) {
      top2 = top1;
      top1 = two;
    } else if (two > top2) {
      top2 = two;
    }
  }
  return Math.max(bestSingle, top1 + top2);
}

function maxInto(acc: StatVec, v: StatVec): void {
  for (const k of Object.keys(v) as StatKey[])
    acc[k] = Math.max(acc[k] ?? 0, v[k] ?? 0);
}

/** Per-slot statwise-max contribution, summed over slots i..end. Every real
 *  completion's added stats are ≤ this vector statwise, so feeding it to a
 *  per-stat monotone objective yields an admissible bound (ADR-0004). */
function suffixMaxVectors(
  pools: Record<Slot, Artifact[]>,
  order: Slot[],
  contributions: Map<string, StatVec>,
): StatVec[] {
  const perSlot = order.map((s) => {
    const m: StatVec = {};
    for (const a of pools[s]) maxInto(m, contributions.get(a.id)!);
    return m;
  });
  const suffix: StatVec[] = new Array(order.length + 1);
  suffix[order.length] = {};
  for (let i = order.length - 1; i >= 0; i--) {
    const v: StatVec = { ...suffix[i + 1] };
    addInto(v, perSlot[i]);
    suffix[i] = v;
  }
  return suffix;
}

/**
 * Statwise ceiling on what any reachable set-bonus layout can add.
 *
 * A `setRequirement` bounds this hard, so honour it: with a 4pc requirement the
 * fifth piece can never reach a second 2pc, and a 2+2 of two distinct sets pins
 * both halves. Without one, fall back to the best single set (2pc+4pc) versus
 * the two best 2pc bonuses, per stat, over the sets actually present in the pools.
 * // ponytail: root-constant ceiling — tighten per node like setBonusCeilingAt
 * // if damage searches ever prove too slow again.
 */
function setCeilingVector(
  ctx: OptimizeContext,
  pools: Record<Slot, Artifact[]>,
  setRequirement: OptimizeRequest['constraints']['setRequirement'],
): StatVec {
  const present = new Set<string>();
  for (const s of SLOTS) for (const a of pools[s]) present.add(a.setKey);
  const bonus = (key: string) => ctx.setBonuses[key];

  const sum = (...vs: (StatVec | undefined)[]): StatVec => {
    const out: StatVec = {};
    for (const v of vs) if (v) addInto(out, v);
    return out;
  };

  if (setRequirement?.kind === '4pc') {
    // Four pieces of one set plus a single free piece: only this set's bonuses
    // can ever be active.
    const b = bonus(setRequirement.setKey);
    return sum(b?.two, b?.four);
  }
  if (
    setRequirement?.kind === '2+2' &&
    setRequirement.setKeys[0] !== setRequirement.setKeys[1]
  ) {
    const [a, b] = setRequirement.setKeys;
    return sum(bonus(a)?.two, bonus(b)?.two);
  }
  // A 2+2 naming the same set twice collapses to "≥2 of A", which a 5-piece
  // build can satisfy while also activating A's 4pc — so the two-2pc ceiling
  // above would be inadmissible and could reject a feasible build. Fall
  // through to the '2pc' branch below, which bounds that case correctly.
  const twoPcKey =
    setRequirement?.kind === '2pc'
      ? setRequirement.setKey
      : setRequirement?.kind === '2+2'
        ? setRequirement.setKeys[0]
        : undefined;

  const ceil: StatVec = {};
  const top1: StatVec = {};
  const top2: StatVec = {};
  const candidates =
    twoPcKey !== undefined
      ? // The required set's 2pc is guaranteed; the three free pieces can add
        // at most one more 2pc (or upgrade the required set to 4pc). A Set
        // (not an array) so the required key isn't counted twice when it's
        // already among `present` — that would double its own 2pc value into
        // both "top1" and "top2" below instead of pairing it with a genuine
        // second set.
        new Set([twoPcKey, ...present])
      : present;
  for (const key of candidates) {
    const b = bonus(key);
    if (!b) continue;
    maxInto(ceil, sum(b.two, b.four));
    for (const k of Object.keys(b.two ?? {}) as StatKey[]) {
      const v = b.two?.[k] ?? 0;
      if (v > (top1[k] ?? 0)) {
        top2[k] = top1[k] ?? 0;
        top1[k] = v;
      } else if (v > (top2[k] ?? 0)) {
        top2[k] = v;
      }
    }
  }
  for (const k of Object.keys(top1) as StatKey[])
    ceil[k] = Math.max(ceil[k] ?? 0, (top1[k] ?? 0) + (top2[k] ?? 0));
  return ceil;
}

/**
 * The statwise ceiling the search itself uses when it prunes on `minStats`:
 * the character/weapon base, plus the per-slot statwise-max of everything
 * still selectable under the main-stat locks, plus the set-bonus ceiling for
 * the requirement in force.
 *
 * Exported so the diagnostics can explain an infeasible run with the very
 * bound that rejected it — an optimistic (admissible) over-estimate, so a
 * floor above this ceiling is provably unreachable, and one below it may still
 * be unreachable for reasons the bound cannot see.
 *
 * Returns `null` when some slot has no legal piece at all — the search's own
 * hard-infeasible case, where no ceiling is meaningful.
 */
export function reachableCeiling(
  ctx: OptimizeContext,
  req: OptimizeRequest,
  inventory: Artifact[],
): StatVec | null {
  const pools = poolsBySlot(inventory, req);
  if (SLOTS.some((s) => pools[s].length === 0)) return null;
  const order = [...SLOTS];
  const contributions = new Map<string, StatVec>();
  for (const s of order)
    for (const a of pools[s]) contributions.set(a.id, artifactContribution(a));
  const ceiling: StatVec = { ...ctx.base };
  addInto(ceiling, suffixMaxVectors(pools, order, contributions)[0]);
  addInto(
    ceiling,
    setCeilingVector(ctx, pools, req.constraints.setRequirement),
  );
  return ceiling;
}

function makeBuildResult(
  ctx: OptimizeContext,
  req: OptimizeRequest,
  chosen: Artifact[],
): BuildResult {
  const t = totals(ctx, chosen);
  const ov = evaluateObjective(ctx, req.objective, t);
  const score = ov - critRatioPenalty(t, req.constraints.critRatioTarget);
  const ids = {} as Record<Slot, string>;
  for (const a of chosen) ids[a.slot] = a.id;
  return {
    artifactIds: ids,
    totals: t,
    objectiveValue: ov,
    score,
    diagnostics: {
      bindingConstraints: [],
      marginalBySlot: {},
      explored: 0,
      pruned: 0,
    },
  };
}

/** A snapshot of the search's own counters, mid-flight. */
export interface SearchProgress {
  /** Leaves (complete five-piece builds) evaluated so far. */
  explored: number;
  /** Subtrees rejected by a bound so far. */
  pruned: number;
}

export interface SearchOptions {
  /**
   * Called periodically while the search runs, so a long solve can report
   * progress instead of looking frozen. Purely observational: it sees the
   * counters, it cannot steer the search, and nothing about pruning or
   * iteration order depends on whether it is supplied.
   */
  onProgress?: (progress: SearchProgress) => void;
  /** Minimum wall-clock gap between `onProgress` calls. */
  progressIntervalMs?: number;
}

export function searchBuilds(
  req: OptimizeRequest,
  inventory: Artifact[],
  ctx: OptimizeContext,
  options?: SearchOptions,
): OptimizeResult {
  // Precondition: artifact ids are unique across `inventory`. The per-artifact
  // caches below (contributions, scalar values, minContrib) and the result's
  // artifactIds→artifact lookup are all id-keyed, so duplicate ids collapse
  // into one entry. Every producer mints ids with crypto.randomUUID().
  const k = req.topK ?? 10;
  // `avg_damage` is multiplicative in the totals, so the scalar-additive bound
  // below does not hold for it. Until the vector bound lands the search is
  // still exact for it — just unpruned on the objective (the set-requirement
  // prunes and constraint checks are unaffected).
  const scalarObjective: ScalarObjective | null =
    req.objective === 'avg_damage' ? null : req.objective;
  const pools = poolsBySlot(inventory, req);
  if (SLOTS.some((s) => pools[s].length === 0)) {
    return { status: 'infeasible', explored: 0, pruned: 0 };
  }

  // Decide the most constrained slots first: with a 17-piece sands and a
  // 115-piece flower, choosing the sands early lets the set-requirement and
  // objective bounds reject whole subtrees before the big pools are ever
  // walked. Iteration order only — the returned optimum is unchanged (covered
  // by the brute-force equivalence tests).
  const order = [...SLOTS].sort((a, b) => pools[a].length - pools[b].length);

  // Contributions are a pure function of the artifact, but the sorts, the
  // suffix bounds and `recurse` (once per surviving path above the artifact)
  // all read them — fold each artifact exactly once, here.
  const contributions = new Map<string, StatVec>();
  for (const s of order)
    for (const a of pools[s]) contributions.set(a.id, artifactContribution(a));
  // The same fold projected onto the scalar objective. Same canonical
  // definition the leaf score uses (objectiveValue over artifactContribution),
  // so the pruning bound and the score can never drift apart.
  const scalarValues = new Map<string, number>();
  if (scalarObjective)
    for (const [id, c] of contributions) {
      const v = objectiveValue(c, scalarObjective);
      // A NaN/Infinity here (corrupt import, a substat parsed as text) would
      // poison every comparison in the bound — `NaN <= x` is false, so the
      // branch never prunes, while `Infinity` prunes everything. Either way the
      // search silently stops being exact. Fail loudly instead: one isFinite
      // per artifact, paid once, outside the recursion.
      if (!Number.isFinite(v)) {
        throw new Error(
          `optimizer: artifact ${id} has a non-finite ${scalarObjective} contribution (${v}). ` +
            'The inventory is corrupt — refusing to search, because a non-finite value ' +
            'makes the branch-and-bound bound inadmissible.',
        );
      }
      scalarValues.set(id, v);
    }
  const scalarOf = (a: Artifact) => scalarValues.get(a.id) ?? 0;

  // Surface high-contribution pieces first so the kept list fills with strong
  // builds early and the admissible bound tightens sooner. Iteration order only —
  // the returned optimum is unchanged (covered by the brute-force equivalence test).
  if (scalarObjective) {
    for (const s of order) pools[s].sort((a, b) => scalarOf(b) - scalarOf(a));
  }

  const suffixMax: number[] = new Array(order.length + 1).fill(0);
  if (scalarObjective) {
    // pools[s] was just sorted descending by exactly this key, so its head is
    // the per-slot maximum. (Reading it that way also avoids spreading a
    // full-inventory pool into Math.max — a stack-overflow risk on real
    // accounts, where one slot can hold hundreds of pieces.)
    const maxBySlot = order.map((s) => scalarOf(pools[s][0]));
    for (let i = order.length - 1; i >= 0; i--)
      suffixMax[i] = suffixMax[i + 1] + maxBySlot[i];
  }
  // Vector mode (avg_damage): the objective is multiplicative in the totals, so
  // the scalar-additive bound above does not apply. Bound instead by evaluating
  // the objective on an optimistic *stat vector* — the running totals plus the
  // statwise-max of everything still selectable. Admissible because the damage
  // function is monotone in every stat it reads (proved in formula.test.ts).
  // Statwise reachability data. Vector-mode bounding needs it; so does the
  // minStats prune below, which applies to every objective.
  const suffixMaxVec = suffixMaxVectors(pools, order, contributions);
  const setCeilVec = setCeilingVector(
    ctx,
    pools,
    req.constraints.setRequirement,
  );
  const runningVec: StatVec = {};
  if (!scalarObjective) {
    // Ordering heuristic only (the oracle test proves the optimum is unchanged):
    // rank each piece by the damage it adds on its own.
    const baseDamage = evaluateObjective(ctx, 'avg_damage', ctx.base);
    const gain = new Map<string, number>();
    for (const s of order)
      for (const a of pools[s]) {
        const t: StatVec = { ...ctx.base };
        addInto(t, contributions.get(a.id)!);
        gain.set(a.id, evaluateObjective(ctx, 'avg_damage', t) - baseDamage);
      }
    for (const s of order)
      pools[s].sort((a, b) => (gain.get(b.id) ?? 0) - (gain.get(a.id) ?? 0));
  }
  const relevantSets = scalarObjective
    ? relevantSetBonuses(ctx, scalarObjective, pools, order)
    : [];
  const relevantIndex = new Map(relevantSets.map((r, i) => [r.key, i]));
  const matchedRelevant: number[] = new Array(relevantSets.length).fill(0);
  // The base stats always contribute to the objective (e.g. crit_rate/crit_dmg from character/weapon).
  // Include this in the upper bound so pruning remains admissible.
  const baseObjective = scalarObjective
    ? objectiveValue(ctx.base, scalarObjective)
    : 0;

  // A setRequirement (e.g. 4pc) is otherwise only checked at the leaf via
  // satisfies(), so on an inventory spanning many sets almost every branch is
  // explored to full depth just to be rejected. This mirrors suffixMax above,
  // but bounds "how many more required-set pieces could still be picked" —
  // an admissible feasibility bound, so pruning stays exact (ADR-0004) while
  // engaging long before the leaf.
  const setReq = req.constraints.setRequirement;
  let neededA = 0,
    neededB = 0,
    setKeyA = '',
    setKeyB = '';
  let remainingA: number[] | null = null;
  let remainingB: number[] | null = null;
  if (setReq) {
    if (setReq.kind === '2+2') {
      [setKeyA, setKeyB] = setReq.setKeys;
      neededA = 2;
      neededB = 2;
      remainingB = suffixSetPotential(pools, order, setKeyB);
    } else {
      setKeyA = setReq.setKey;
      neededA = setReq.kind === '4pc' ? 4 : 2;
    }
    remainingA = suffixSetPotential(pools, order, setKeyA);
  }

  // A minStats floor is otherwise only checked at the leaf, so on a large
  // inventory almost every branch is walked to full depth just to be rejected
  // for, say, missing an ER target. This mirrors the set-requirement bound:
  // "could the remaining picks still reach this floor at all?" — admissible,
  // because no real completion can beat the statwise maximum.
  const minKeys = Object.keys(req.constraints.minStats ?? {}) as StatKey[];
  const minNeed = minKeys.map((k) => req.constraints.minStats?.[k] ?? 0);
  const minBase = minKeys.map((k) => (ctx.base[k] ?? 0) + (setCeilVec[k] ?? 0));
  const minSuffix = minKeys.map((k) => suffixMaxVec.map((v) => v[k] ?? 0));
  const runningMin = new Array<number>(minKeys.length).fill(0);
  /** The same contributions, projected onto just the constrained stats. */
  const minContrib = new Map<string, number[]>();
  if (minKeys.length > 0) {
    for (const [id, c] of contributions)
      minContrib.set(
        id,
        minKeys.map((k) => c[k] ?? 0),
      );
  }

  const kept: BuildResult[] = [];
  let explored = 0;
  let pruned = 0;
  const chosen: Artifact[] = [];

  // Progress reporting. Two guards keep it off the hot path when nobody is
  // listening: `onProgress` is captured as a local (so the common case is one
  // truthiness test per node) and the clock is only read once every 256
  // nodes. Node count, not leaf count: a heavily-pruned search can spend
  // seconds without reaching a single leaf.
  const onProgress = options?.onProgress;
  const progressIntervalMs = options?.progressIntervalMs ?? 80;
  let visited = 0;
  // -Infinity, not the start time: the first tick should land as soon as there
  // is anything to say, rather than making the reader wait out a full interval
  // staring at zeroes.
  let lastReportAt = -Infinity;
  function reportProgress() {
    const now = Date.now();
    if (now - lastReportAt < progressIntervalMs) return;
    lastReportAt = now;
    onProgress!({ explored, pruned });
  }

  /**
   * The score a branch must beat to be worth exploring.
   *
   * Invariant: `kept` is exactly the anti-clone greedy (drop exact duplicates,
   * at most 2 per shared 4-piece core, stop at k) applied to every feasible
   * build found so far — re-run over the whole score-sorted list on every
   * insertion, so it never drifts from what a from-scratch run would produce.
   * The threshold is therefore the k-th *survivor*, not the k-th raw build.
   *
   * Why that is admissible — the search may only ever return anti-clone
   * survivors, so a branch whose ceiling cannot beat the current k-th survivor
   * cannot change the output:
   *
   * 1. *Suppression is monotone.* A build is dropped only when ≥2 strictly
   *    better builds share its 4-piece core. Those two displacers can never
   *    themselves vanish in a way that revives it: anything that displaces a
   *    displacer shares the same core, so the core's "2 taken" state only ever
   *    persists. Later discoveries can push a survivor down the list, never
   *    resurrect a suppressed build above them.
   * 2. *Truncating at k is safe.* To evict a survivor currently ranked above
   *    score `s`, later builds must outrank it — and any newcomer that
   *    suppresses (rather than outranks) it needs 2 higher same-core builds,
   *    which themselves occupy at least as many output slots as they displace.
   *    So the count of survivors at or above `s` never decreases.
   *
   * Together: the k-th survivor score is monotonically non-decreasing and is a
   * lower bound on the final k-th score, so pruning at it is exact.
   *
   * WARNING: this proof depends on the anti-clone rule being a **per-core cap**
   * — a partition matroid, where each build belongs to exactly one core class
   * with a fixed quota. It is **void** if the rule ever becomes general
   * diversity clustering (a candidate could then be suppressed by a cluster
   * that later dissolves), which is precisely the v1.1 idea ADR-0004 defers.
   * Changing the rule means re-deriving this bound or reverting to a raw
   * top-`k * 6` retention buffer.
   */
  function minKeptScore(): number {
    return kept.length >= k ? kept[k - 1].score : -Infinity;
  }
  function offer(b: BuildResult) {
    // Cheap reject: `kept` already holds k survivors at least this good, and a
    // build that ties the k-th cannot displace it (stable order keeps the
    // earlier find). Mirrors the `<=` in the prune test above.
    if (kept.length >= k && b.score <= kept[k - 1].score) return;
    // Binary-insert by descending score, after any equal scores — the same
    // order Array#sort (stable) gives `bruteForce`, so the two rank ties alike.
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (kept[mid].score >= b.score) lo = mid + 1;
      else hi = mid;
    }
    kept.splice(lo, 0, b);
    // Re-run the greedy over the whole sorted list (not just the tail): a
    // newcomer can un-suppress nothing, but it can itself be suppressed, and it
    // shifts everything below it by one.
    const survivors = antiClone(kept, k);
    kept.length = 0;
    for (const s of survivors) kept.push(s);
  }

  function recurse(
    slotIndex: number,
    runningObjective: number,
    matchedA: number,
    matchedB: number,
  ) {
    if (onProgress && (++visited & 0xff) === 0) reportProgress();
    if (slotIndex === order.length) {
      explored++;
      const t = totals(ctx, chosen);
      if (!satisfies(req.constraints, chosen, t)) return;
      offer(makeBuildResult(ctx, req, [...chosen]));
      return;
    }
    if (scalarObjective) {
      const upper =
        baseObjective +
        runningObjective +
        suffixMax[slotIndex] +
        setBonusCeilingAt(relevantSets, matchedRelevant, slotIndex);
      if (upper <= minKeptScore()) {
        pruned++;
        return;
      }
    } else {
      const optimistic: StatVec = { ...ctx.base };
      addInto(optimistic, runningVec);
      addInto(optimistic, suffixMaxVec[slotIndex]);
      addInto(optimistic, setCeilVec);
      if (evaluateObjective(ctx, 'avg_damage', optimistic) <= minKeptScore()) {
        pruned++;
        return;
      }
    }
    for (let j = 0; j < minKeys.length; j++) {
      if (minBase[j] + runningMin[j] + minSuffix[j][slotIndex] < minNeed[j]) {
        pruned++;
        return;
      }
    }
    if (remainingA && matchedA + remainingA[slotIndex] < neededA) {
      pruned++;
      return;
    }
    if (remainingB && matchedB + remainingB[slotIndex] < neededB) {
      pruned++;
      return;
    }
    const hasRelevant = relevantSets.length > 0;
    // `chosen`, `runningVec`, `runningMin` and `matchedRelevant` are pushed
    // before the recursive call and popped after it. Any early return added
    // inside this loop must undo all four, or the bounds silently stop being
    // admissible.
    for (const a of pools[order[slotIndex]]) {
      chosen.push(a);
      const contribution = scalarObjective
        ? null
        : (contributions.get(a.id) ?? null);
      if (contribution) addInto(runningVec, contribution);
      const mc = minContrib.get(a.id);
      if (mc) for (let j = 0; j < mc.length; j++) runningMin[j] += mc[j];
      const relIdx = hasRelevant ? relevantIndex.get(a.setKey) : undefined;
      if (relIdx !== undefined) matchedRelevant[relIdx]++;
      recurse(
        slotIndex + 1,
        runningObjective + (scalarObjective ? scalarOf(a) : 0),
        matchedA + (setKeyA && a.setKey === setKeyA ? 1 : 0),
        matchedB + (setKeyB && a.setKey === setKeyB ? 1 : 0),
      );
      if (relIdx !== undefined) matchedRelevant[relIdx]--;
      if (contribution) subFrom(runningVec, contribution);
      if (mc) for (let j = 0; j < mc.length; j++) runningMin[j] -= mc[j];
      chosen.pop();
    }
  }

  recurse(0, 0, 0, 0);

  if (kept.length === 0) return { status: 'infeasible', explored, pruned };

  const byId = new Map(inventory.map((a) => [a.id, a]));
  return {
    status: 'ok',
    // `kept` is already the anti-clone survivor list (see minKeptScore), so
    // this call is idempotent — kept as a cheap assertion that the incremental
    // invariant and the batch rule agree.
    builds: antiClone(kept, k).map((b) => ({
      ...b,
      // Every id came from an inventory artifact (via the pools), so byId always
      // resolves it — the assertion holds and no defensive filter is needed.
      diagnostics: buildDiagnostics(
        ctx,
        req,
        b,
        SLOTS.map((s) => byId.get(b.artifactIds[s])!),
        explored,
        pruned,
      ),
    })),
    explored,
    pruned,
  };
}

/** Anti-clone cap over a score-descending candidate list: drop exact
 *  duplicates, allow at most 2 results per shared 4-piece core, stop at k.
 *  Shared with `bruteForce` so the oracle test compares like with like. */
function antiClone(ranked: BuildResult[], k: number): BuildResult[] {
  const seenExact = new Set<string>();
  const coreCount: Record<string, number> = {};
  const final: BuildResult[] = [];
  for (const b of ranked) {
    const exact = SLOTS.map((s) => b.artifactIds[s]).join(',');
    if (seenExact.has(exact)) continue;
    const core = SLOTS.slice(0, 4)
      .map((s) => b.artifactIds[s])
      .join(',');
    if ((coreCount[core] ?? 0) >= 2) continue;
    seenExact.add(exact);
    coreCount[core] = (coreCount[core] ?? 0) + 1;
    final.push(b);
    if (final.length >= k) break;
  }
  return final;
}

/**
 * Exhaustive reference search — used only by the correctness test. Returns the
 * full top-K, filtered exactly as `searchBuilds` filters it: rank every feasible
 * leaf, then apply the anti-clone cap over *all* of them. No retention buffer:
 * `searchBuilds` maintains the same greedy incrementally and prunes at the k-th
 * survivor, so "anti-clone over everything feasible" is the exact spec it
 * implements, and the oracle must not truncate before applying it.
 */
export function bruteForce(
  req: OptimizeRequest,
  inventory: Artifact[],
  ctx: OptimizeContext,
): OptimizeResult {
  const k = req.topK ?? 10;
  const pools = poolsBySlot(inventory, req);
  if (SLOTS.some((s) => pools[s].length === 0))
    return { status: 'infeasible', explored: 0, pruned: 0 };
  const feasible: BuildResult[] = [];
  const chosen: Artifact[] = [];
  function rec(i: number) {
    if (i === SLOTS.length) {
      const t = totals(ctx, chosen);
      if (!satisfies(req.constraints, chosen, t)) return;
      feasible.push(makeBuildResult(ctx, req, [...chosen]));
      return;
    }
    for (const a of pools[SLOTS[i]]) {
      chosen.push(a);
      rec(i + 1);
      chosen.pop();
    }
  }
  rec(0);
  if (feasible.length === 0)
    return { status: 'infeasible', explored: 0, pruned: 0 };
  feasible.sort((x, y) => y.score - x.score);
  return {
    status: 'ok',
    builds: antiClone(feasible, k),
    explored: 0,
    pruned: 0,
  };
}
