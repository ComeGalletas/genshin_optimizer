/**
 * Roster → comp archetype matching, and the Spiral Abyss two-half
 * recommendation: two teams that share no character.
 */
import { COMP_ARCHETYPES } from './comps';
import type { CompArchetype, Role } from './types';

export interface TeamInstance {
  archetypeId: string;
  members: { characterKey: string; role: Role; buildScore: number }[]; // length 4, distinct
  score: number;
}

export interface ArchetypeGap {
  archetypeId: string;
  missingRole: Role;
  /** The slot's option keys the roster lacks. */
  candidates: string[];
  /** Score the team would reach if the gap were filled at weight × 100. */
  bestPossibleScore: number;
}

const TIER_WEIGHT: Record<CompArchetype['tier'], number> = {
  1: 1.0,
  2: 0.85,
  3: 0.7,
};

function teamScore(
  arch: CompArchetype,
  contributions: number[], // option weight × buildScore per slot
): number {
  const mean = contributions.reduce((a, b) => a + b, 0) / contributions.length;
  return TIER_WEIGHT[arch.tier] * mean;
}

/**
 * Fill each slot with the owned, non-excluded option maximizing
 * `option weight × buildScore`, never reusing a character.
 *
 * // ponytail: greedy slot fill in listed order — swap for an exact 4-slot
 * // assignment if curation ever makes greedy visibly wrong.
 *
 * Returns the instantiated team, a single-slot gap report, or null when more
 * than one slot is unfillable (the archetype is simply out of reach).
 */
export function instantiate(
  arch: CompArchetype,
  scores: Record<string, number>, // characterKey -> buildScore (present = owned)
  exclude: ReadonlySet<string>,
): TeamInstance | { missing: ArchetypeGap } | null {
  const used = new Set<string>();
  const members: TeamInstance['members'] = [];
  const contributions: number[] = [];
  const unfilled: { role: Role; candidates: string[]; bestWeight: number }[] =
    [];

  for (const slot of arch.slots) {
    let best: { characterKey: string; weight: number; score: number } | null =
      null;
    for (const o of slot.options) {
      if (exclude.has(o.characterKey) || used.has(o.characterKey)) continue;
      const score = scores[o.characterKey];
      if (score === undefined) continue; // not owned
      const value = o.weight * score;
      if (!best || value > best.weight * best.score)
        best = { characterKey: o.characterKey, weight: o.weight, score };
    }
    if (!best) {
      unfilled.push({
        role: slot.role,
        candidates: slot.options.map((o) => o.characterKey),
        bestWeight: slot.options[0].weight,
      });
      continue;
    }
    used.add(best.characterKey);
    members.push({
      characterKey: best.characterKey,
      role: slot.role,
      buildScore: best.score,
    });
    contributions.push(best.weight * best.score);
  }

  if (unfilled.length === 0)
    return {
      archetypeId: arch.id,
      members,
      score: teamScore(arch, contributions),
    };
  if (unfilled.length > 1) return null;

  const gap = unfilled[0];
  return {
    missing: {
      archetypeId: arch.id,
      missingRole: gap.role,
      candidates: gap.candidates,
      // What the team would score if the missing slot were filled by a fully
      // built ideal — the upside of acquiring one of the candidates.
      bestPossibleScore: teamScore(arch, [
        ...contributions,
        gap.bestWeight * 100,
      ]),
    },
  };
}

export interface AbyssRecommendation {
  teams: [TeamInstance, TeamInstance] | null;
  gaps: ArchetypeGap[];
}

/**
 * Spiral Abyss wants two halves that share no character. Instantiate every
 * archetype for the first half, then re-instantiate every other archetype with
 * the first half's members excluded, and keep the pair maximizing the weaker
 * half — an Abyss clear is bounded by its worse team, not its better one.
 */
export function recommendAbyss(
  scores: Record<string, number>,
): AbyssRecommendation {
  const singles: TeamInstance[] = [];
  const gaps: ArchetypeGap[] = [];
  const abyss = COMP_ARCHETYPES.filter((a) => a.modes.includes('abyss'));

  for (const arch of abyss) {
    const out = instantiate(arch, scores, new Set());
    if (out === null) continue;
    if ('missing' in out) gaps.push(out.missing);
    else singles.push(out);
  }
  // The pair search below keeps the first pair to reach a given weaker score,
  // so ordering the halves best-first is what breaks ties toward the stronger
  // first half.
  singles.sort((a, b) => b.score - a.score);
  gaps.sort((a, b) => b.bestPossibleScore - a.bestPossibleScore);

  let best: [TeamInstance, TeamInstance] | null = null;
  let bestWeaker = -Infinity;
  for (const first of singles) {
    const exclude = new Set(first.members.map((m) => m.characterKey));
    for (const arch of abyss) {
      if (arch.id === first.archetypeId) continue;
      const out = instantiate(arch, scores, exclude);
      if (out === null || 'missing' in out) continue;
      const weaker = Math.min(first.score, out.score);
      if (weaker > bestWeaker) {
        bestWeaker = weaker;
        best = [first, out];
      }
    }
  }
  return { teams: best, gaps };
}
