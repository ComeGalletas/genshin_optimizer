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
  computeReadiness,
  groupByLocation,
  rosterReadiness,
} from '@genshin-build-lab/engine/roster/buildScore';
import { artifactQuality } from '@genshin-build-lab/engine/roster/artifactQuality';
import { QualityValue, ReadinessValue } from '../roster/ScoreValues';
import {
  getArchetype,
  archetypeName,
} from '@genshin-build-lab/engine/teams/comps';
import {
  recommendAbyss,
  type TeamInstance,
  type ArchetypeGap,
} from '@genshin-build-lab/engine/teams/recommend';
import { BAND_TONE, bandLabel, ROLE_LABELS } from '../labels';
import { Badge } from '../components/ui/Badge';
import { CharacterPortrait } from '../components/GameArt';
import { CharacterButton } from '../character-window/CharacterButton';

/** The endgame modes this view does not recommend for yet. Named, not offered:
 *  the `EndgameMode` union still carries them, so adding one here is the only
 *  edit a wired-up mode needs on this side. */
const COMING_SOON: string[] = ['Imaginarium Theater', 'Stygian Onslaught'];

function TeamCard({ title, team }: { title: string; team: TeamInstance }) {
  const arch = getArchetype(team.archetypeId);
  const entries = useRoster((s) => s.entries);
  const artifacts = useInventory((s) => s.artifacts);
  // Each member's crowns and artifact score, beside the readiness the team
  // was picked by (ADR-0057).
  const scores = useMemo(() => {
    const worn = groupByLocation(artifacts);
    return Object.fromEntries(
      team.members.map((m) => {
        const pieces = worn[m.characterKey] ?? [];
        const entry = entries[m.characterKey] ?? {};
        return [
          m.characterKey,
          {
            crowns: computeReadiness(entry, pieces).crowns,
            quality: artifactQuality(m.characterKey, entry, pieces),
          },
        ];
      }),
    );
  }, [team, entries, artifacts]);
  return (
    <div data-testid="team-card" className="card p-4">
      <p className="micro-label">{title}</p>
      <h3 className="font-display text-base font-bold text-paper">
        {archetypeName(team.archetypeId)}
      </h3>
      {arch && <p className="mt-1 text-xs text-muted">{arch.notes}</p>}
      <ul className="mt-3 space-y-2">
        {team.members.map((m) => {
          const b = band(
            m.readiness,
            scores[m.characterKey]?.quality?.total ?? null,
          );
          return (
            <li
              key={m.characterKey}
              data-testid="team-member"
              className="flex items-center gap-3 text-sm"
            >
              <CharacterButton
                characterKey={m.characterKey}
                className="min-w-0 flex-1 gap-3"
              >
                <CharacterPortrait characterKey={m.characterKey} size={28} />
                <span className="min-w-0 flex-1 truncate font-semibold text-paper">
                  {genshinAdapter.characterName(m.characterKey)}
                </span>
              </CharacterButton>
              <span className="text-xs text-muted">{ROLE_LABELS[m.role]}</span>
              <span className="flex flex-none flex-col items-end">
                <ReadinessValue
                  total={m.readiness}
                  crowns={scores[m.characterKey]?.crowns ?? 0}
                  className="text-xs"
                />
                <QualityValue
                  quality={scores[m.characterKey]?.quality ?? null}
                  className="text-2xs"
                />
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
    () => recommendAbyss(rosterReadiness(entries, artifacts)),
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
