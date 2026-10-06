/**
 * The plan's output (TODO 7.4): what to equip on whom, in an order that
 * works in the game, and what to farm.
 *
 * **Moves.** Each planned piece not already on its member is a move. In the
 * game, equipping a piece another character wears swaps them: that
 * character takes the piece it replaces. The list follows the swaps, so each
 * move names who wears the piece at that point, and a swap that happens to
 * put a planned piece on its member saves a move.
 *
 * **Farming.** Per member, over the pieces left to them (allowed by their
 * spec, not planned for anyone else): the curated meta target's gaps (the
 * plan's existing list, ADR-0019), a share below their best alone with who
 * holds that build's pieces, a planned piece below its top level, and why
 * a member has no build. Pure.
 * @packageDocumentation
 */

import type { Artifact, Slot } from '../game/types';
import { SLOTS } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { formatSetName, formatStat, SLOT_LABELS, statLabel } from '../labels';
import { META_TARGETS } from '../meta/metaTargets';
import { computeGapReport, setRequirementGap } from '../meta/gap';
import type { AllocatedBuild, AllocationMember } from './allocate';

export interface PlanMove {
  /** Who equips it. */
  characterKey: string;
  slot: Slot;
  artifactId: string;
  /** Who wears it at this point of the list; null when nobody does. */
  from: string | null;
  /** The piece the member wore in that slot, which goes to `from` (or back
   *  to the inventory); null when the slot was empty. */
  displaced: string | null;
  text: string;
}

export interface MoveList {
  moves: PlanMove[];
  /** Planned pieces already on their member. */
  inPlace: number;
}

const name = (key: string) => genshinAdapter.characterName(key);

/** An artifact's top level by rarity. */
const MAX_LEVEL: Record<number, number> = { 5: 20, 4: 16, 3: 12, 2: 4, 1: 4 };

/** A piece as the player finds it in the game: set, slot, main stat,
 *  level and substats. */
export function describePiece(a: Artifact): string {
  const subs = a.subStats
    .map((s) => `${statLabel(s.key)} ${formatStat(s.key, s.value)}`)
    .join(', ');
  return `${formatSetName(a.setKey)} ${SLOT_LABELS[a.slot].toLowerCase()} (${statLabel(a.mainStat)}, +${a.level}${subs ? `; ${subs}` : ''})`;
}

/** The moves from the pieces' current `location`s to the plan, in plan
 *  order, following the game's swaps. */
export function planMoves(
  builds: readonly AllocatedBuild[],
  inventory: readonly Artifact[],
): MoveList {
  const byId = new Map(inventory.map((a) => [a.id, a]));
  const wearer = new Map<string, string | null>();
  const worn = new Map<string, string>(); // `${character}|${slot}` → id
  for (const a of inventory) {
    wearer.set(a.id, a.location ?? null);
    if (a.location) worn.set(`${a.location}|${a.slot}`, a.id);
  }
  const moves: PlanMove[] = [];
  let inPlace = 0;
  for (const b of builds) {
    if (b.result.status !== 'ok') continue;
    const to = b.characterKey;
    for (const slot of SLOTS) {
      const id = b.result.builds[0].artifactIds[slot];
      const from = wearer.get(id) ?? null;
      if (from === to) {
        inPlace++;
        continue;
      }
      const displaced = worn.get(`${to}|${slot}`) ?? null;
      wearer.set(id, to);
      worn.set(`${to}|${slot}`, id);
      if (from) worn.delete(`${from}|${slot}`);
      if (displaced) {
        wearer.set(displaced, from);
        if (from) worn.set(`${from}|${slot}`, displaced);
      }
      const own = `${name(to)}'s current ${SLOT_LABELS[slot].toLowerCase()}`;
      const after = !displaced
        ? ''
        : from
          ? `; ${name(from)} takes ${own}`
          : `; ${own} goes back to the inventory`;
      moves.push({
        characterKey: to,
        slot,
        artifactId: id,
        from,
        displaced,
        text: `${name(to)}: equip the ${describePiece(byId.get(id)!)}, ${from ? `from ${name(from)}` : 'unequipped'}${after}.`,
      });
    }
  }
  return { moves, inPlace };
}

/** A member's build score over their best alone (0–1), or null without
 *  either. */
export function planShare(
  build: AllocatedBuild,
  solo: number | null | undefined,
): number | null {
  if (!solo || build.result.status !== 'ok') return null;
  return build.result.builds[0].score / solo;
}

/** "sands and goblet to Mualani, circlet to Furina". */
function heldBy(pieces: Map<string, Slot[]>): string {
  const and = (xs: string[]) =>
    xs.length < 2
      ? xs.join('')
      : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
  return [...pieces]
    .map(
      ([k, slots]) =>
        `${and(slots.map((s) => SLOT_LABELS[s].toLowerCase()))} to ${name(k)}`,
    )
    .join(', ');
}

/** The plan's farming list and notes, each line prefixed with the
 *  member's name, in plan order, without repeats. `solo` and `soloPieces`
 *  come from allocation v1 or v2; the greedy pass has neither. */
export function planFarming(
  members: readonly AllocationMember[],
  builds: readonly AllocatedBuild[],
  inventory: readonly Artifact[],
  solo?: {
    solo: Record<string, number | null>;
    soloPieces: Record<string, string[] | null>;
  },
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (key: string, line: string) => {
    const l = `${name(key)}: ${line}`;
    if (!seen.has(l)) lines.push(l);
    seen.add(l);
  };
  const plannedFor = new Map<string, string>();
  for (const b of builds)
    if (b.result.status === 'ok')
      for (const id of Object.values(b.result.builds[0].artifactIds))
        plannedFor.set(id, b.characterKey);
  const byId = new Map(inventory.map((a) => [a.id, a]));
  /** The pieces of `key`'s best alone that the plan gives others. */
  const takenFrom = (key: string) => {
    const by = new Map<string, Slot[]>();
    for (const id of solo?.soloPieces[key] ?? []) {
      const holder = plannedFor.get(id);
      if (!holder || holder === key) continue;
      by.set(holder, [...(by.get(holder) ?? []), byId.get(id)!.slot]);
    }
    return by;
  };

  for (const b of builds) {
    const key = b.characterKey;
    const m = members.find((x) => x.characterKey === key);
    if (!m) continue;
    if (m.problem) {
      add(key, m.problem);
      continue;
    }
    const allowed = inventory.filter((a) => !m.allowed || m.allowed.has(a.id));
    const left = allowed.filter((a) => {
      const holder = plannedFor.get(a.id);
      return !holder || holder === key;
    });
    const best = b.result.status === 'ok' ? b.result.builds[0] : null;
    if (!best) {
      if (solo && solo.solo[key] === null) {
        add(key, 'no build meets their conditions even with every piece.');
        const set = m.request.constraints.setRequirement;
        const gap = set && setRequirementGap(set, allowed);
        if (gap)
          add(
            key,
            `You own ${gap.have} ${formatSetName(gap.setKey)} piece${gap.have === 1 ? '' : 's'} across slots they may use; their conditions need ${gap.need}.`,
          );
      } else if (solo) {
        const by = takenFrom(key);
        add(
          key,
          `no build left for them; the plan gives ${by.size ? `their best build's ${heldBy(by)}` : 'the pieces of their best build to others'}.`,
        );
      } else {
        add(
          key,
          'no build meets their conditions from what the members ahead left.',
        );
      }
    } else {
      const share = planShare(b, solo?.solo[key]);
      if (share !== null && share < 0.9995) {
        const by = takenFrom(key);
        add(
          key,
          `${(share * 100).toFixed(1)}% of their best build alone${by.size ? `; the plan gives that build's ${heldBy(by)}` : ''}.`,
        );
      }
      // A planned piece not at its rarity's top level is cheap to improve.
      for (const slot of SLOTS) {
        const a = byId.get(best.artifactIds[slot])!;
        const top = MAX_LEVEL[a.rarity] ?? 20;
        if (a.level < top)
          add(
            key,
            `level the planned ${formatSetName(a.setKey)} ${SLOT_LABELS[slot].toLowerCase()} from +${a.level} to +${top}.`,
          );
      }
    }
    const meta = META_TARGETS[key];
    if (meta) {
      const gap = computeGapReport(meta, left, best);
      for (const line of [...gap.feasibility, ...gap.shortfalls])
        add(key, line);
    }
  }
  return lines;
}
