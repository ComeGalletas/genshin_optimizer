/**
 * Investment advice: what to pull for and what to craft next, ranked from the
 * near-miss archetypes the Abyss recommender reports, plus the curated table of
 * how obtainable each notable weapon is.
 * @packageDocumentation
 */
import { genshinAdapter } from '../game/genshin/adapter';
import { archetypeName } from '../teams/comps';
import { ROLE_LABELS } from '../labels';
import type { ArchetypeGap } from '../teams/recommend';
import type { RosterEntry } from '../import/good';
import { WEAPON_OBTAINABILITY } from './obtainability';

export interface Advice {
  kind: 'character' | 'weapon';
  subjectKey: string;
  headline: string;
  detail: string;
  /** The archetype id or character key the advice came from. */
  provenance: string;
  /** Team-score points unlocked; the ranking key. */
  upside: number;
  /** Curated wiki page for the subject, where the table has one. Surfaced as
   *  a quiet "source" link so a reader can re-verify the claim; it plays no
   *  part in the ranking. */
  source?: string;
}

const MAX_ADVICE = 10;

/** No banner-schedule data ships with the app — say so rather than guess. */
const ROTATES = 'Availability rotates — check a banner tracker before pulling.';

const weaponName = (key: string) => genshinAdapter.weapon(key)?.name ?? key;

/** The best craftable weapon in the curated table for a given weapon type. */
function craftableFor(weaponType: string): string | undefined {
  for (const [key, entry] of Object.entries(WEAPON_OBTAINABILITY)) {
    if (entry.tier !== 'craftable') continue;
    if (genshinAdapter.weapon(key)?.type === weaponType) return key;
  }
  return undefined;
}

export function adviseInvestments(
  gaps: ArchetypeGap[],
  roster: Record<string, RosterEntry>,
  scores: Record<string, number>,
): Advice[] {
  const out: Advice[] = [];
  const seen = new Set<string>();

  for (const gap of gaps) {
    for (const candidate of gap.candidates) {
      // Owned means the slot wasn't really missing them — it means the greedy
      // fill already used them elsewhere, which pulling won't fix.
      if (candidate in roster) continue;
      const dedupe = `character:${candidate}:${gap.archetypeId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        kind: 'character',
        subjectKey: candidate,
        headline: `Owning ${genshinAdapter.characterName(candidate)} unlocks ${archetypeName(
          gap.archetypeId,
        )} (+${gap.bestPossibleScore.toFixed(0)} team score)`,
        detail: `They fill the ${ROLE_LABELS[gap.missingRole].toLowerCase()} slot that team is short. ${ROTATES}`,
        provenance: gap.archetypeId,
        upside: gap.bestPossibleScore,
      });
    }
  }

  // Weapon advice: a character the plan leans on holding something that isn't
  // even a recommended weapon, when a craftable option exists for their type.
  const relevant = new Set(gaps.flatMap((g) => g.candidates));
  for (const key of relevant) {
    const equipped = roster[key]?.weaponKey;
    if (!equipped || equipped in WEAPON_OBTAINABILITY) continue;
    const type = genshinAdapter.weapon(equipped)?.type;
    if (!type) continue;
    const craft = craftableFor(type);
    if (!craft) continue;
    const dedupe = `weapon:${key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      kind: 'weapon',
      subjectKey: craft,
      headline: `${genshinAdapter.characterName(key)} is holding ${weaponName(equipped)} — ${weaponName(craft)} is a free upgrade path`,
      detail: `${weaponName(craft)} is craftable — no wishes needed.`,
      provenance: key,
      upside: scores[key] ?? 0,
      source: WEAPON_OBTAINABILITY[craft]?.source,
    });
  }

  return out.sort((a, b) => b.upside - a.upside).slice(0, MAX_ADVICE);
}
