/**
 * The character window's body: who they are and how they stand now (their
 * score, talents, stats at their exact level, weapon and artifacts, TODO
 * 9.9), what the meta wants, and which curated teams they slot into.
 * @packageDocumentation
 */
import { useId, useMemo, useState } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { computeBuildScore } from '@genshin-build-lab/engine/roster/buildScore';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { archetypesFor } from '@genshin-build-lab/engine/teams/comps';
import { getDamageProfile } from '@genshin-build-lab/engine/damage/profiles';
import { fourPieceAssumptions } from '@genshin-build-lab/engine/damage/setBonuses';
import {
  formatScore,
  formatSetName,
  formatStat,
  statLabel,
  objectiveHint,
  objectiveLabel,
  ROLE_LABELS,
  setRequirementLabel,
  SLOT_LABELS,
} from '../labels';
import { Segmented } from '../components/ui/Segmented';
import { CharacterLine } from '../components/ui/CharacterLine';
import { SourceLink } from '../components/ui/SourceLink';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';
import type {
  Artifact,
  Slot,
  StatKey,
} from '@genshin-build-lab/engine/game/types';
import { CharacterPortrait, WeaponIcon } from '../components/GameArt';
import { useDetails } from '../character-window/details';
import { CharacterStats } from '../character-window/CharacterStats';
import { Talents } from '../character-window/Talents';
import { WeaponCard } from '../character-window/WeaponCard';
import { ArtifactList } from '../character-window/ArtifactList';

const TABS = ['Overview', 'Stats', 'Gear', 'Recommended', 'Teams'] as const;
type Tab = (typeof TABS)[number];

export function CharacterDetail({
  characterKey,
  entry,
  artifacts,
}: {
  characterKey: string;
  /** Their roster entry; none for a character the account doesn't have. */
  entry: RosterEntry | undefined;
  /** The pieces this character currently has equipped. */
  artifacts: Artifact[];
}) {
  const [tab, setTab] = useState<Tab>('Overview');
  const uid = useId();
  const tabId = (t: Tab) => `${uid}-tab-${t}`;
  const panelId = `${uid}-panel`;
  const char = genshinAdapter.character(characterKey);
  const details = useDetails();
  const weaponKey = entry?.weaponKey;
  const weaponName = weaponKey
    ? genshinAdapter.weapon(weaponKey)?.name
    : undefined;
  const score = useMemo(
    () => (entry ? computeBuildScore(entry, artifacts) : null),
    [entry, artifacts],
  );
  const meta = META_TARGETS[characterKey];
  const profile = getDamageProfile(characterKey);
  const comps = archetypesFor(characterKey);
  // Only a 4pc recipe lights up a 4-piece bonus; a 2+2 or 2pc requirement has
  // no set effect to state an assumption about.
  const fourPcKey =
    meta?.setRequirement.kind === '4pc'
      ? meta.setRequirement.setKey
      : undefined;

  return (
    <div className="space-y-4">
      {/* Deliberately unnumbered: numbered badges mark real sequences (the
          page steps), and this is a menu. */}
      <Segmented
        options={TABS}
        value={tab}
        onChange={setTab}
        label="Character detail"
        itemId={tabId}
        controls={panelId}
      />

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(tab)}
        tabIndex={0}
        className="focus-ring space-y-3 rounded-lg text-sm"
      >
        {tab === 'Overview' && (
          <>
            <div className="flex items-center gap-3">
              <CharacterPortrait characterKey={characterKey} size={64} />
              {weaponKey && <WeaponIcon weaponKey={weaponKey} size={44} />}
            </div>
            <p className="text-muted">
              <CharacterLine element={char?.element} weaponName={weaponName} />
              {details && details !== 'failed' && (
                <Stars n={details.characters[characterKey]?.rarity} />
              )}
              {entry?.level != null && ` · Lv ${entry.level}`}
              {entry?.constellation != null && ` · C${entry.constellation}`}
            </p>
            {/* On wells: the window's art shows through everything else. */}
            {score ? (
              <div className="well space-y-2 px-3 py-2">
                <p className="font-mono text-3xl font-bold text-accent-bright">
                  {formatScore(score.total, 0)}
                  <span className="text-base text-muted"> / 100</span>
                </p>
                <dl className="grid gap-1 text-xs">
                  {score.components.map((c) => (
                    <div key={c.label} className="flex justify-between gap-4">
                      <dt className="text-muted">{c.label}</dt>
                      <dd className="font-mono text-paper">
                        {formatScore(c.points, 1)} / {c.max}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted">
                  {objectiveHint(meta?.objective ?? 'crit_value')}
                </p>
              </div>
            ) : (
              <p className="well px-3 py-2 text-muted">
                Not in your roster: their stats show at level 90, with no weapon
                or artifacts.
              </p>
            )}
            <Talents
              details={details}
              characterKey={characterKey}
              entry={entry}
            />
          </>
        )}

        {tab === 'Stats' && (
          <CharacterStats
            details={details}
            characterKey={characterKey}
            entry={entry}
            artifacts={artifacts}
          />
        )}

        {tab === 'Gear' && (
          <>
            <WeaponCard details={details} entry={entry} />
            <ArtifactList artifacts={artifacts} />
          </>
        )}

        {tab === 'Recommended' &&
          (meta ? (
            <>
              <p>
                <span className="text-muted">Set:</span>{' '}
                {setRequirementLabel(meta.setRequirement)}
              </p>
              {Object.entries(meta.mains).map(([slot, stat]) => (
                <p key={slot}>
                  <span className="text-muted">
                    {SLOT_LABELS[slot as Slot]}:
                  </span>{' '}
                  {statLabel(stat)}
                </p>
              ))}
              {meta.erTarget && (
                <p>
                  <span className="text-muted">ER floor:</span> {meta.erTarget}%
                </p>
              )}
              {meta.statTargets && (
                <p className="text-xs text-muted">
                  Endgame targets:{' '}
                  {Object.entries(meta.statTargets)
                    .map(
                      ([k, v]) =>
                        `${statLabel(k as StatKey)} ${formatStat(k as StatKey, v)}`,
                    )
                    .join(', ')}
                </p>
              )}
              <SourceLink
                className="text-xs text-flux-bright underline"
                href={meta.source}
              >
                Source guide (KQM)
              </SourceLink>
              {/* The damage profile is usually cited from the very same KQM
                  page as the recipe above, and two links to one page read as
                  two sources. Only shown when it really is a second one. */}
              {profile && profile.source !== meta.source && (
                <p>
                  <SourceLink
                    className="text-xs text-muted underline"
                    href={profile.source}
                  >
                    Damage Profile Source
                  </SourceLink>
                </p>
              )}
              {/* What the 4pc number assumes (ADR-0020), or why there is no
                  number — the unmodelled sets, the wrong weapon class and the
                  hit-kind bonuses a scalar objective can't see all come back
                  from the same call now. Quiet on purpose: it qualifies the
                  figure above rather than competing with it. */}
              {fourPcKey &&
                fourPieceAssumptions(
                  [fourPcKey],
                  {
                    hasDamage: meta.objective === 'avg_damage',
                    weaponType: weaponKey
                      ? genshinAdapter.weapon(weaponKey)?.type
                      : undefined,
                  },
                  formatSetName,
                ).map((line) => (
                  <p key={line} className="text-2xs leading-relaxed text-muted">
                    {line}
                  </p>
                ))}
              {!profile && (
                <p className="text-xs text-muted">
                  No curated damage profile yet — builds for this character are
                  ranked by {objectiveLabel(meta.objective)} instead of
                  estimated damage.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">
              No curated recipe for this character yet.
            </p>
          ))}

        {tab === 'Teams' &&
          (comps.length ? (
            <ul className="space-y-2">
              {comps.map((a) => (
                <li key={a.id} className="well px-3 py-2">
                  <p className="font-semibold text-paper">{a.name}</p>
                  <p className="text-xs text-muted">{a.notes}</p>
                  <p className="mt-1 text-xs text-muted">
                    {a.slots
                      .map((s) => {
                        const k = s.options[0]?.characterKey;
                        return `${ROLE_LABELS[s.role]}: ${k ? genshinAdapter.characterName(k) : '—'}`;
                      })
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Not in any curated team archetype yet.</p>
          ))}
      </div>
    </div>
  );
}

/** " · 5★", once the details know the rarity. */
function Stars({ n }: { n: number | undefined }) {
  return n ? <> · {n}★</> : null;
}
