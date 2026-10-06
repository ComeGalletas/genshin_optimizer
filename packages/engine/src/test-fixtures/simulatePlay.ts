/**
 * Test-only: play an account forward to get a "later" snapshot with a known
 * answer (TODO 2.8). From a seed, it levels pieces with real rolls (the 5★
 * roll tiers, a uniform line per upgrade, the fourth line activated at +4),
 * re-equips and re-locks pieces, consumes +0 pieces as fodder and adds new
 * drops, and records exactly which piece became which. Values are kept as
 * the game shows them (flat stats as integers, the rest to one decimal).
 * @packageDocumentation
 */

import type { StatKey, SubStat } from '../game/types';
import { isFlatStat } from '../game/types';
import {
  SUBSTAT_TIERS_5,
  UPGRADE_EVERY,
  type SubStatKey,
} from '../game/genshin/substatRolls';
import { fingerprint } from '../import/fingerprint';
import { genshinAdapter } from '../game/genshin/adapter';
import type { SnapshotPiece } from '../merge/merge';
import { mulberry32 } from '../numbers';

export interface PlayCounts {
  upgrades: number;
  moves: number;
  locks: number;
  consumed: number;
  drops: number;
}

export interface PlayTruth {
  added: number[];
  removed: number[];
  /** [before, after] */
  upgraded: [number, number][];
  moved: [number, number][];
  lockChanged: [number, number][];
}

/** The engine's seeded PRNG with the two draws test data needs. */
export function seeded(seed: number) {
  const next = mulberry32(seed);
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
  };
}

const SUB_KEYS = Object.keys(SUBSTAT_TIERS_5) as SubStatKey[];
const shown = (key: StatKey, v: number) =>
  isFlatStat(key) ? Math.round(v) : Math.round(v * 10) / 10;

function clone(p: SnapshotPiece): SnapshotPiece {
  return JSON.parse(JSON.stringify(p)) as SnapshotPiece;
}

/** Level a 5★ piece up by `n` upgrades, in place, with real rolls. */
function levelUp(p: SnapshotPiece, n: number, rng: ReturnType<typeof seeded>) {
  const a = p.artifact;
  for (let i = 0; i < n; i++) {
    if (a.subStats.length === 3) {
      // The first upgrade activates the fourth line.
      const line =
        p.unactivated ??
        (() => {
          const key = rng.pick(
            SUB_KEYS.filter(
              (k) => k !== a.mainStat && !a.subStats.some((s) => s.key === k),
            ),
          );
          return { key, value: shown(key, rng.pick(SUBSTAT_TIERS_5[key])) };
        })();
      a.subStats.push({ ...line });
      if (p.extras?.initialValues)
        p.extras.initialValues[line.key] = line.value;
      delete p.unactivated;
    } else {
      const s = rng.pick(a.subStats);
      s.value = shown(
        s.key,
        s.value + rng.pick(SUBSTAT_TIERS_5[s.key as SubStatKey]),
      );
    }
    if (p.extras?.totalRolls !== undefined) p.extras.totalRolls += 1;
  }
  a.level = Math.min(
    20,
    (Math.floor(a.level / UPGRADE_EVERY) + n) * UPGRADE_EVERY,
  );
  a.mainStatValue = genshinAdapter.mainStatValue(a.mainStat, 5, a.level);
}

/** A new +0 5★ drop shaped like an existing piece (set, slot, main stat). */
function newDrop(
  like: SnapshotPiece,
  rng: ReturnType<typeof seeded>,
): SnapshotPiece {
  const t = like.artifact;
  const keys = SUB_KEYS.filter((k) => k !== t.mainStat);
  const lines: SubStat[] = [];
  while (lines.length < 4) {
    const key = rng.pick(keys.filter((k) => !lines.some((l) => l.key === k)));
    lines.push({ key, value: shown(key, rng.pick(SUBSTAT_TIERS_5[key])) });
  }
  const threeLine = rng.next() < 0.8; // most 5★ drops start with 3 lines
  const p: SnapshotPiece = {
    artifact: {
      id: 'new',
      setKey: t.setKey,
      slot: t.slot,
      rarity: 5,
      level: 0,
      mainStat: t.mainStat,
      mainStatValue: genshinAdapter.mainStatValue(t.mainStat, 5, 0),
      subStats: threeLine ? lines.slice(0, 3) : lines,
      ...(t.element && { element: t.element }),
    },
    lock: false,
    extras: {
      totalRolls: threeLine ? 3 : 4,
      initialValues: Object.fromEntries(lines.map((l) => [l.key, l.value])),
    },
  };
  if (threeLine) p.unactivated = lines[3];
  return p;
}

/**
 * Play `before` forward. Every piece is touched by at most one of
 * upgrade / consumed; moves and lock changes may also hit upgraded pieces.
 * The result is shuffled, so nothing can rely on positions.
 */
export function simulatePlay(
  before: readonly SnapshotPiece[],
  counts: PlayCounts,
  seed: number,
): { after: SnapshotPiece[]; truth: PlayTruth } {
  const rng = seeded(seed);
  const next: { piece: SnapshotPiece; from?: number }[] = before.map(
    (p, i) => ({ piece: clone(p), from: i }),
  );
  const five = next.filter((x) => x.piece.artifact.rarity === 5);
  const used = new Set<number>();
  const take = (pool: typeof next, n: number) => {
    const out: typeof next = [];
    const free = pool.filter((x) => !used.has(x.from!));
    while (out.length < n && free.length) {
      const x = free.splice(rng.int(free.length), 1)[0];
      used.add(x.from!);
      out.push(x);
    }
    return out;
  };

  const upgraded = take(
    five.filter((x) => x.piece.artifact.level < 20),
    counts.upgrades,
  );
  for (const x of upgraded) {
    const left = 5 - Math.floor(x.piece.artifact.level / UPGRADE_EVERY);
    levelUp(x.piece, 1 + rng.int(left), rng);
  }
  const consumed = take(
    five.filter((x) => x.piece.artifact.level === 0 && !x.piece.lock),
    counts.consumed,
  );
  const chars = [
    ...new Set(before.map((p) => p.artifact.location).filter(Boolean)),
  ] as string[];
  for (let i = 0; i < counts.moves; i++) {
    const x = rng.pick(next.filter((y) => !consumed.includes(y)));
    const to = rng.next() < 0.2 ? undefined : rng.pick(chars);
    if (to === undefined) delete x.piece.artifact.location;
    else x.piece.artifact.location = to;
  }
  // Moved: where it ends up differs from where it started (a piece moved
  // away and back again hasn't moved).
  const movedSet = new Set(
    next
      .filter(
        (x) =>
          !consumed.includes(x) &&
          x.piece.artifact.location !== before[x.from!].artifact.location,
      )
      .map((x) => x.from!),
  );
  const lockSet = new Set<number>();
  for (let i = 0; i < counts.locks; i++) {
    const x = rng.pick(
      next.filter((y) => !consumed.includes(y) && y.piece.lock !== undefined),
    );
    x.piece.lock = !x.piece.lock;
    if (lockSet.has(x.from!)) lockSet.delete(x.from!);
    else lockSet.add(x.from!);
  }

  const kept = next.filter((x) => !consumed.includes(x));
  const prints = new Set(kept.map((x) => fingerprint(x.piece.artifact)));
  const drops: typeof next = [];
  while (drops.length < counts.drops) {
    const p = newDrop(rng.pick(five).piece, rng);
    const f = fingerprint(p.artifact);
    if (prints.has(f)) continue; // an exact twin would be a real duplicate
    prints.add(f);
    drops.push({ piece: p });
  }

  const all = [...kept, ...drops];
  for (let i = all.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  const at = new Map(all.map((x, i) => [x, i]));
  const byFrom = new Map(kept.map((x) => [x.from!, at.get(x)!]));
  const pair = (i: number): [number, number] => [i, byFrom.get(i)!];
  return {
    after: all.map((x) => x.piece),
    truth: {
      added: drops.map((x) => at.get(x)!).sort((a, b) => a - b),
      removed: consumed.map((x) => x.from!).sort((a, b) => a - b),
      upgraded: upgraded.map((x) => pair(x.from!)).sort((a, b) => a[0] - b[0]),
      moved: [...movedSet].sort((a, b) => a - b).map(pair),
      lockChanged: [...lockSet].sort((a, b) => a - b).map(pair),
    },
  };
}

/** What an OCR scanner exports: no first rolls or roll counts. */
export function withoutRollData(
  pieces: readonly SnapshotPiece[],
  keepUnactivated = true,
): SnapshotPiece[] {
  return pieces.map((p) => {
    const q = clone(p);
    delete q.extras;
    if (!keepUnactivated) delete q.unactivated;
    return q;
  });
}
