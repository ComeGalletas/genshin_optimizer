/**
 * "What changed since the last import" (TODO 2.8): the difference between
 * two snapshots of the same account, taken at different times.
 *
 * Pieces pair as in the merge (ADR-0027): exact fingerprint, one-step fuzzy
 * match, or the same four first rolls (a piece levelled in between, when the
 * source exports first rolls, as Irminsul does). For sources without first
 * rolls, a piece on each side that could be the same piece levelled up is
 * paired only if the value it gained on every line can be made from the
 * rolls its upgrades give, with the real roll tiers, and it is the only such
 * candidate on both sides. Nothing else is paired: what is left is new,
 * gone, or listed as unexplained.
 * @packageDocumentation
 */

import type { Artifact, StatKey, SubStat } from '../game/types';
import {
  isSubStatKey,
  SUBSTAT_TIERS_5,
  UPGRADE_EVERY,
  type SubStatKey,
} from '../game/genshin/substatRolls';
import { displaySteps } from '../import/fingerprint';
import { reconcile, type SnapshotPiece } from '../merge/merge';
import { firstRollKey } from '../good/sidecar';

export interface Upgrade {
  before: number;
  after: number;
  /** How the pair was recognised: shared first rolls, or roll arithmetic. */
  by: 'first-rolls' | 'rolls';
}

export interface ImportDiff {
  /** After-indices of pieces that weren't there before (new drops). */
  added: number[];
  /** Before-indices of pieces that are gone (fodder, salvage). */
  removed: number[];
  upgraded: Upgrade[];
  /** Pieces now worn by someone else (or nobody); upgraded ones included. */
  moved: { before: number; after: number; from?: string; to?: string }[];
  lockChanged: { before: number; after: number; lock?: boolean }[];
  /** Pairs with nothing changed. */
  unchanged: number;
  /** Same-shape pieces too far apart to be one piece misread, and pieces
   *  with more than one possible upgrade: listed, not paired. */
  unexplained: { before?: number; after?: number; why: string }[];
}

// ---------------------------------------------------------------------------
// Roll arithmetic
// ---------------------------------------------------------------------------

const reachCache = new Map<string, Set<number>>();

/** Every shown value (in display steps) that `k` rolls of a stat can add. */
function reach(key: SubStatKey, k: number): Set<number> {
  const id = `${key}:${k}`;
  let out = reachCache.get(id);
  if (out) return out;
  let sums = new Set([0]);
  for (let i = 0; i < k; i++) {
    const next = new Set<number>();
    for (const s of sums)
      for (const t of SUBSTAT_TIERS_5[key]) next.add(Math.round((s + t) * 100));
    sums = new Set([...next].map((x) => x / 100));
  }
  out = new Set([...sums].map((v) => displaySteps({ key, value: v })));
  reachCache.set(id, out);
  return out;
}

/** Whether `d` display steps can come from `k` rolls, allowing one step of
 *  display rounding on each side of the difference. */
const canGain = (key: SubStatKey, d: number, k: number) => {
  const r = reach(key, k);
  return r.has(d) || r.has(d - 1) || r.has(d + 1);
};

const lineMap = (subs: readonly SubStat[]) =>
  new Map(subs.map((s) => [s.key, s]));

/**
 * Whether `after` can be `before` levelled up: same set, slot, rarity (5★),
 * main stat and element, a higher level, the same lines (a 3-line piece may
 * gain its fourth line at +4), and every line's gain reachable with the
 * rolls the upgrades in between give.
 */
export function couldBeUpgrade(
  before: SnapshotPiece,
  after: SnapshotPiece,
): boolean {
  const a = before.artifact;
  const b = after.artifact;
  if (
    a.rarity !== 5 ||
    b.rarity !== 5 ||
    a.setKey !== b.setKey ||
    a.slot !== b.slot ||
    a.mainStat !== b.mainStat ||
    (a.element ?? '') !== (b.element ?? '') ||
    b.level <= a.level
  )
    return false;
  const upgrades =
    Math.floor(b.level / UPGRADE_EVERY) - Math.floor(a.level / UPGRADE_EVERY);
  if (upgrades < 1) return false;

  const was = lineMap(a.subStats);
  const now = lineMap(b.subStats);
  if (now.size !== 4 || [...now.keys()].some((k) => !isSubStatKey(k)))
    return false;
  let rolls = upgrades;
  // The first upgrade of a 3-line piece activates its fourth line.
  let activated: StatKey | undefined;
  if (was.size === 3) {
    if (a.level >= UPGRADE_EVERY) return false;
    rolls -= 1;
    activated = [...now.keys()].find((k) => !was.has(k));
    if (!activated) return false;
    if (before.unactivated) {
      if (before.unactivated.key !== activated) return false;
      was.set(activated, before.unactivated);
      activated = undefined; // its starting value is known
    }
  } else if (was.size !== 4) return false;
  for (const k of was.keys()) if (!now.has(k)) return false;

  // Spread the random rolls over the lines so every gain is reachable.
  const lines = [...now.values()].map((s) => {
    const key = s.key as SubStatKey;
    const base = was.get(key);
    const gain = displaySteps(s) - (base ? displaySteps(base) : 0);
    // An unknown activated line starts at one roll that isn't a random one.
    return { key, gain, extra: key === activated ? 1 : 0 };
  });
  const fits = (i: number, left: number): boolean => {
    if (i === lines.length) return left === 0;
    const l = lines[i];
    for (let k = 0; k <= left; k++)
      if (canGain(l.key, l.gain, k + l.extra) && fits(i + 1, left - k))
        return true;
    return false;
  };
  return fits(0, rolls);
}

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

const shapeKey = (x: Artifact) =>
  `${x.setKey}|${x.slot}|${x.rarity}|${x.mainStat}|${x.element ?? ''}`;

/** What changed from `before` to `after`. Pure. */
export function diffSnapshots(
  before: readonly SnapshotPiece[],
  after: readonly SnapshotPiece[],
): ImportDiff {
  const r = reconcile(before, after);
  const upgraded: Upgrade[] = [];
  // Pieces reconcile couldn't pair, same-shape mismatches included: an
  // upgrade check runs on all of them first, so a mismatch can't take the
  // piece an upgrade came from.
  const onlyA = [...r.onlyA, ...r.mismatches.map((m) => m.a)].sort(
    (x, y) => x - y,
  );
  const onlyB = [...r.onlyB, ...r.mismatches.map((m) => m.b)].sort(
    (x, y) => x - y,
  );
  const unexplained: ImportDiff['unexplained'] = [];
  const pairs: { before: number; after: number }[] = [];
  for (const p of r.pairs) {
    if (p.kind !== 'levelled') {
      pairs.push({ before: p.a, after: p.b });
      continue;
    }
    // Same first rolls: an upgrade, if the level went up.
    if (after[p.b].artifact.level > before[p.a].artifact.level) {
      pairs.push({ before: p.a, after: p.b });
      upgraded.push({ before: p.a, after: p.b, by: 'first-rolls' });
    } else
      unexplained.push({
        before: p.a,
        after: p.b,
        why: 'same first rolls, but not levelled up',
      });
  }

  // Upgrades by roll arithmetic, unique on both sides.
  const goneByShape = new Map<string, number[]>();
  for (const i of onlyA) {
    const k = shapeKey(before[i].artifact);
    const l = goneByShape.get(k);
    if (l) l.push(i);
    else goneByShape.set(k, [i]);
  }
  const candidates = new Map<number, number[]>(); // after → before[]
  const reverse = new Map<number, number[]>(); // before → after[]
  for (const j of onlyB) {
    const pool = goneByShape.get(shapeKey(after[j].artifact)) ?? [];
    const fits = pool.filter((i) => couldBeUpgrade(before[i], after[j]));
    if (!fits.length) continue;
    candidates.set(j, fits);
    for (const i of fits) reverse.set(i, [...(reverse.get(i) ?? []), j]);
  }
  const pairedA = new Set<number>();
  const pairedB = new Set<number>();
  const doubtful = new Set<number>();
  for (const [j, fits] of candidates) {
    if (fits.length === 1 && reverse.get(fits[0])!.length === 1) {
      upgraded.push({ before: fits[0], after: j, by: 'rolls' });
      pairs.push({ before: fits[0], after: j });
      pairedA.add(fits[0]);
      pairedB.add(j);
    } else {
      doubtful.add(j);
      unexplained.push({
        after: j,
        why: `could be new, or an upgrade of one of ${fits.length} earlier pieces`,
      });
    }
  }

  // A mismatch whose two sides are both still unpaired stays unexplained,
  // unless both carry all their first rolls and they differ: an exact source
  // doesn't misread, and first rolls never change, so they are two pieces.
  const held = new Set<string>();
  for (const m of r.mismatches) {
    if (pairedA.has(m.a) || pairedB.has(m.b)) continue;
    const ka = firstRollKey(
      before[m.a].artifact,
      before[m.a].extras?.initialValues,
    );
    const kb = firstRollKey(
      after[m.b].artifact,
      after[m.b].extras?.initialValues,
    );
    if (ka !== undefined && kb !== undefined && ka !== kb) continue;
    held.add(`a${m.a}`).add(`b${m.b}`);
    unexplained.push({
      before: m.a,
      after: m.b,
      why: `same shape, but ${m.stats.join(', ')} too far apart for one piece`,
    });
  }

  const moved: ImportDiff['moved'] = [];
  const lockChanged: ImportDiff['lockChanged'] = [];
  const upgradedA = new Set(upgraded.map((u) => u.before));
  let unchanged = 0;
  for (const p of pairs) {
    const a = before[p.before];
    const b = after[p.after];
    const from = a.artifact.location;
    const to = b.artifact.location;
    const isMoved = from !== to;
    const isLock =
      a.lock !== undefined && b.lock !== undefined && a.lock !== b.lock;
    if (isMoved)
      moved.push({
        ...p,
        ...(from !== undefined && { from }),
        ...(to !== undefined && { to }),
      });
    if (isLock) lockChanged.push({ ...p, lock: b.lock });
    if (!isMoved && !isLock && !upgradedA.has(p.before)) unchanged++;
  }
  return {
    added: onlyB.filter(
      (j) => !pairedB.has(j) && !doubtful.has(j) && !held.has(`b${j}`),
    ),
    removed: onlyA.filter((i) => !pairedA.has(i) && !held.has(`a${i}`)),
    upgraded,
    moved,
    lockChanged,
    unchanged,
    unexplained,
  };
}
