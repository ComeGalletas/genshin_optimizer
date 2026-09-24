/**
 * Gap analysis: compares the best build the player can field from their own
 * inventory against a curated meta target and reports feasibility gaps,
 * numeric shortfalls, and one grounded action (ADR-0007).
 * @packageDocumentation
 */

import type {
  Artifact,
  BuildResult,
  SetRequirement,
  Slot,
  StatKey,
} from '../game/types';
import { SLOTS } from '../game/types';
import type { MetaTarget } from './metaTargets';
import {
  formatCritRatio,
  formatSetName,
  objectiveLabel,
  SLOT_LABELS,
  statLabel,
} from '../labels';

export interface GapReport {
  characterKey: string;
  feasibility: string[]; // Level 1
  shortfalls: string[]; // Level 2
  action: string | null; // Level 3 — exactly one
}

function distinctSlots(inventory: Artifact[], setKey: string): number {
  const s = new Set<Slot>();
  for (const a of inventory) if (a.setKey === setKey) s.add(a.slot);
  return s.size;
}

/** The required set the inventory can't form, if any. Exported because the
 *  infeasible-search message needs the same answer for a *request's* set
 *  requirement, not just a meta target's. */
export function setRequirementGap(
  req: SetRequirement,
  inventory: Artifact[],
): { setKey: string; have: number; need: number } | null {
  if (req.kind === '4pc') {
    const have = distinctSlots(inventory, req.setKey);
    return have < 4 ? { setKey: req.setKey, have, need: 4 } : null;
  }
  if (req.kind === '2pc') {
    const have = distinctSlots(inventory, req.setKey);
    return have < 2 ? { setKey: req.setKey, have, need: 2 } : null;
  }
  for (const setKey of req.setKeys) {
    const have = distinctSlots(inventory, setKey);
    if (have < 2) return { setKey, have, need: 2 };
  }
  return null;
}

function mainGaps(
  meta: MetaTarget,
  inventory: Artifact[],
): { slot: Slot; want: StatKey }[] {
  const gaps: { slot: Slot; want: StatKey }[] = [];
  for (const slot of Object.keys(meta.mains) as Slot[]) {
    const want = meta.mains[slot];
    if (!want) continue;
    if (!inventory.some((a) => a.slot === slot && a.mainStat === want))
      gaps.push({ slot, want });
  }
  return gaps;
}

export function computeGapReport(
  meta: MetaTarget,
  inventory: Artifact[],
  build: BuildResult | null,
): GapReport {
  // Level 1 — feasibility (inventory vs recipe)
  const feasibility: string[] = [];
  const sg = setRequirementGap(meta.setRequirement, inventory);
  if (sg)
    feasibility.push(
      `You own ${sg.have} ${formatSetName(sg.setKey)} piece${sg.have === 1 ? '' : 's'} across slots — need ${sg.need} for the meta set.`,
    );
  const mg = mainGaps(meta, inventory);
  for (const g of mg)
    feasibility.push(
      `You own no ${statLabel(g.want)} ${SLOT_LABELS[g.slot]} — the meta build needs it.`,
    );

  // Level 2 — numeric shortfall (best build vs targets)
  const shortfalls: string[] = [];
  if (build) {
    if (meta.erTarget != null) {
      const have = build.totals.er_pct ?? 0;
      if (have < meta.erTarget)
        shortfalls.push(
          `Best build reaches ER ${have.toFixed(0)}% vs ${meta.erTarget}% target — short by ${(meta.erTarget - have).toFixed(0)}%.`,
        );
    }
    if (meta.critRatioTarget != null) {
      const cr = build.totals.crit_rate ?? 0;
      const cd = build.totals.crit_dmg ?? 0;
      if (cr + cd > 0) {
        const ratio = cr / (cr + cd);
        // 0.05 tolerance is a display heuristic: only flag a crit-ratio shortfall
        // when the build is off the target ratio by more than 5 points, so
        // near-on-target builds aren't nagged. Not correctness-critical.
        if (Math.abs(ratio - meta.critRatioTarget) > 0.05) {
          const haveX = cr > 0 ? (cd / cr).toFixed(1) : '∞';
          const targetX =
            meta.critRatioTarget > 0
              ? formatCritRatio(meta.critRatioTarget)
              : '∞';
          shortfalls.push(
            `Crit ratio is 1:${haveX} vs meta’s ~1:${targetX} — ${ratio > meta.critRatioTarget ? 'favour CRIT DMG' : 'favour CRIT Rate'}.`,
          );
        }
      }
    }
  }

  // Level 3 — exactly one grounded action (prioritised)
  let action: string | null = null;
  if (sg) {
    action = `Farm ${formatSetName(sg.setKey)} — you can’t form the meta set yet.`;
  } else if (mg.length > 0) {
    action = `Farm a ${statLabel(mg[0].want)} ${SLOT_LABELS[mg[0].slot]} — the meta wants it and you have none.`;
  } else if (build) {
    let weakest: Slot | null = null;
    let min = Infinity;
    for (const slot of SLOTS) {
      const v = build.diagnostics.marginalBySlot[slot];
      if (v != null && v < min) {
        min = v;
        weakest = slot;
      }
    }
    if (weakest)
      action = `Your ${SLOT_LABELS[weakest]} contributes least to ${objectiveLabel(meta.objective)} — upgrading it has the most upside.`;
  }

  return { characterKey: meta.characterKey, feasibility, shortfalls, action };
}
