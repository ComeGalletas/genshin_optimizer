/**
 * Team recommendations for endgame content. Abyss is the only mode wired up.
 * The other two are named in one muted line rather than offered as a control:
 * a mode picker whose only enabled option changes nothing is a promise the
 * page can't keep.
 */
import { useMemo } from 'react';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { CURATION_PATCH } from '@genshin-build-lab/engine/curation';
import {
  band,
  rosterBuildScores,
} from '@genshin-build-lab/engine/roster/buildScore';
import {
  getArchetype,
  archetypeName,
} from '@genshin-build-lab/engine/teams/comps';
import {
  recommendAbyss,
  type TeamInstance,
  type ArchetypeGap,
} from '@genshin-build-lab/engine/teams/recommend';
import { BAND_TONE, bandLabel, formatScore, ROLE_LABELS } from '../labels';
import { Badge } from '../components/ui/Badge';

/** The endgame modes this view does not recommend for yet. Named, not offered:
 *  the `EndgameMode` union still carries them, so adding one here is the only
 *  edit a wired-up mode needs on this side. */
const COMING_SOON: string[] = ['Imaginarium Theater', 'Stygian Onslaught'];

function TeamCard({ title, team }: { title: string; team: TeamInstance }) {
  const arch = getArchetype(team.archetypeId);
  return (
    <div data-testid="team-card" className="card p-4">
      <p className="micro-label">{title}</p>
      <h3 className="font-display text-base font-bold text-paper">
        {archetypeName(team.archetypeId)}
      </h3>
      {arch && <p className="mt-1 text-xs text-muted">{arch.notes}</p>}
      <ul className="mt-3 space-y-2">
        {team.members.map((m) => {
          const b = band(m.buildScore);
          return (
            <li
              key={m.characterKey}
              data-testid="team-member"
              className="flex items-center gap-3 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-paper">
                {genshinAdapter.characterName(m.characterKey)}
              </span>
              <span className="text-xs text-muted">{ROLE_LABELS[m.role]}</span>
              <span className="font-mono text-xs text-muted">
                {formatScore(m.buildScore, 0)}
              </span>
              <Badge tone={BAND_TONE[b]}>{bandLabel(b)}</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GapList({ gaps }: { gaps: ArchetypeGap[] }) {
  if (gaps.length === 0) return null;
  return (
    <div className="border-t border-white/5 pt-4">
      <p className="micro-label">One character short</p>
      <ul className="mt-2 space-y-1 text-sm">
        {gaps.slice(0, 5).map((g) => (
          <li key={g.archetypeId} className="text-muted">
            <span className="font-semibold text-paper">
              {archetypeName(g.archetypeId)}
            </span>{' '}
            is missing its {ROLE_LABELS[g.missingRole].toLowerCase()} —{' '}
            {g.candidates
              .slice(0, 3)
              .map((c) => genshinAdapter.characterName(c))
              .join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TeamsView() {
  const entries = useRoster((s) => s.entries);
  const artifacts = useInventory((s) => s.artifacts);

  const rec = useMemo(
    () => recommendAbyss(rosterBuildScores(entries, artifacts)),
    [entries, artifacts],
  );

  return (
    <div className="panel panel-md space-y-4">
      <p className="text-xs text-muted">
        Curated from KQM guides for patch {CURATION_PATCH} — Abyss blessings
        change each patch, so treat these as archetypes, not answers.
      </p>

      {rec.teams ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TeamCard title="First half" team={rec.teams[0]} />
          <TeamCard title="Second half" team={rec.teams[1]} />
        </div>
      ) : (
        <p className="text-sm text-muted">
          {Object.keys(entries).length === 0
            ? 'Import a GOOD file to see recommended teams.'
            : 'Your roster can’t field two disjoint teams from the curated archetypes yet.'}
        </p>
      )}

      <p className="text-xs text-muted">
        Coming soon: {COMING_SOON.join(' · ')}.
      </p>

      <GapList gaps={rec.gaps} />
    </div>
  );
}
