/**
 * Drawer body for one character: what they have, what the meta wants, and
 * which curated teams they slot into.
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
import { SLOTS } from '@genshin-build-lab/engine/game/types';

const TABS = ['Overview', 'Gear', 'Recommended', 'Teams'] as const;
type Tab = (typeof TABS)[number];

export function CharacterDetail({
  characterKey,
  entry,
  artifacts,
}: {
  characterKey: string;
  entry: RosterEntry;
  /** The pieces this character currently has equipped. */
  artifacts: Artifact[];
}) {
  const [tab, setTab] = useState<Tab>('Overview');
  const uid = useId();
  const tabId = (t: Tab) => `${uid}-tab-${t}`;
  const panelId = `${uid}-panel`;
  const char = genshinAdapter.character(characterKey);
  const weaponName = entry.weaponKey
    ? genshinAdapter.weapon(entry.weaponKey)?.name
    : undefined;
  const score = useMemo(
    () => computeBuildScore(entry, artifacts),
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
            <p className="text-muted">
              <CharacterLine element={char?.element} weaponName={weaponName} />
              {entry.level != null && ` · Lv ${entry.level}`}
              {entry.constellation != null && ` · C${entry.constellation}`}
            </p>
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
          </>
        )}

        {tab === 'Gear' && (
          <ul className="space-y-1.5">
            {SLOTS.map((s) => {
              const a = artifacts.find((x) => x.slot === s);
              return (
                <li key={s} className="well px-3 py-2">
                  <span className="mr-2 text-xs uppercase text-muted">
                    {SLOT_LABELS[s]}
                  </span>
                  {a ? (
                    <span>
                      {formatSetName(a.setKey)} · {statLabel(a.mainStat)}{' '}
                      {/* The value, then the level as its own chip — printing
                          "+20" here read as a 20-point main stat. */}
                      <span className="font-mono text-xs text-paper/80">
                        {formatStat(a.mainStat, a.mainStatValue)}
                      </span>{' '}
                      <span className="chip px-2 py-0.5">Lv {a.level}</span>
                    </span>
                  ) : (
                    <span className="text-muted">empty</span>
                  )}
                </li>
              );
            })}
          </ul>
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
                    weaponType: entry.weaponKey
                      ? genshinAdapter.weapon(entry.weaponKey)?.type
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
