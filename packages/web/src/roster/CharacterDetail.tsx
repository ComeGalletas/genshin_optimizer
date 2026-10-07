/**
 * The character window's body, three tabs (TODO 9.9, 9.10): Overview (their
 * score, the curated teams they slot into, what the meta wants), Stats (the
 * sheet at their exact level, talents, constellations) and Gear (weapon and
 * artifacts).
 * @packageDocumentation
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { computeReadiness } from '@genshin-build-lab/engine/roster/buildScore';
import {
  artifactQualities,
  bestOf,
  unscoredBuilds,
} from '@genshin-build-lab/engine/roster/artifactQuality';
import {
  characterSheet,
  sheetInput,
} from '@genshin-build-lab/engine/roster/characterSheet';
import { QualityCard, ReadinessCard } from '../character-window/ScoreCards';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { archetypesFor } from '@genshin-build-lab/engine/teams/comps';
import { getDamageProfile } from '@genshin-build-lab/engine/damage/profiles';
import { fourPieceAssumptions } from '@genshin-build-lab/engine/damage/setBonuses';
import {
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
import { Constellations } from '../character-window/Constellations';

const TABS = ['Overview', 'Stats', 'Gear'] as const;
export type CharacterTab = (typeof TABS)[number];
type Tab = CharacterTab;

export function CharacterDetail({
  characterKey,
  entry,
  artifacts,
  tab: tabProp,
  onTabChange,
  footer,
}: {
  characterKey: string;
  /** Their roster entry; none for a character the account doesn't have. */
  entry: RosterEntry | undefined;
  /** The pieces this character currently has equipped. */
  artifacts: Artifact[];
  /** The open tab, when the window holds it (its header's Optimize shows
   *  on every tab but Overview); else the body keeps its own. */
  tab?: Tab;
  onTabChange?: (tab: Tab) => void;
  /** At the bottom of Overview: the window's Optimise This Character. */
  footer?: ReactNode;
}) {
  const [ownTab, setOwnTab] = useState<Tab>('Overview');
  const tab = tabProp ?? ownTab;
  const setTab = (t: Tab) => {
    setOwnTab(t);
    onTabChange?.(t);
  };
  const uid = useId();
  const tabId = (t: Tab) => `${uid}-tab-${t}`;
  const panelId = `${uid}-panel`;
  const char = genshinAdapter.character(characterKey);
  const details = useDetails();
  const weaponKey = entry?.weaponKey;
  const weaponName = weaponKey
    ? genshinAdapter.weapon(weaponKey)?.name
    : undefined;
  const readiness = useMemo(
    () => (entry ? computeReadiness(entry, artifacts) : null),
    [entry, artifacts],
  );
  const qualities = useMemo(
    () => (entry ? artifactQualities(characterKey, entry, artifacts) : []),
    [characterKey, entry, artifacts],
  );
  // The build shown: the best fit, until the reader picks another (for this
  // character only).
  const [picked, setPicked] = useState<{ key: string; build: number } | null>(
    null,
  );
  const build =
    picked?.key === characterKey
      ? picked.build
      : (bestOf(qualities)?.build ?? 0);
  // The weapon held, and the Energy Recharge its substat gives at its level.
  const sheet =
    details && details !== 'failed' && entry?.weaponKey
      ? characterSheet(details, sheetInput(characterKey, entry, artifacts))
      : null;
  const weapon = weaponName
    ? {
        name: weaponName,
        ...(sheet?.weapon?.subStat === 'er_pct' && { er: sheet.weapon.sub }),
      }
    : undefined;
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
            {readiness ? (
              <>
                <ReadinessCard readiness={readiness} />
                <QualityCard
                  characterKey={characterKey}
                  qualities={qualities}
                  build={build}
                  onBuildChange={(b) =>
                    setPicked({ key: characterKey, build: b })
                  }
                  unscored={unscoredBuilds(characterKey)}
                  weapon={weapon}
                />
                <p className="text-xs text-muted">
                  {objectiveHint(meta?.objective ?? 'crit_value')}
                </p>
              </>
            ) : (
              <p className="well px-3 py-2 text-muted">
                Not in your roster: their stats show at level 90, with no weapon
                or artifacts.
              </p>
            )}
            {/* Teams first, then the recipe; Optimise last (TODO 9.10). */}
            <section aria-label="Teams" className="well space-y-2 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase text-muted">
                Teams
              </h3>
              {comps.length ? (
                <ul className="space-y-2">
                  {comps.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg bg-white/[0.03] px-3 py-2"
                    >
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
                <p className="text-muted">
                  Not in any curated team archetype yet.
                </p>
              )}
            </section>
            <section
              aria-label="Recommended"
              className="well space-y-2 px-3 py-2"
            >
              <h3 className="text-xs font-semibold uppercase text-muted">
                Recommended
              </h3>
              {meta ? (
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
                      <span className="text-muted">ER floor:</span>{' '}
                      {meta.erTarget}%
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
                      <p
                        key={line}
                        className="text-2xs leading-relaxed text-muted"
                      >
                        {line}
                      </p>
                    ))}
                  {!profile && (
                    <p className="text-xs text-muted">
                      No curated damage profile yet — builds for this character
                      are ranked by {objectiveLabel(meta.objective)} instead of
                      estimated damage.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted">
                  No curated recipe for this character yet.
                </p>
              )}
            </section>
            {footer}
          </>
        )}

        {tab === 'Stats' && (
          <>
            <CharacterStats
              details={details}
              characterKey={characterKey}
              entry={entry}
              artifacts={artifacts}
            />
            <Talents
              details={details}
              characterKey={characterKey}
              entry={entry}
            />
            <Constellations characterKey={characterKey} entry={entry} />
          </>
        )}

        {tab === 'Gear' && (
          <>
            <WeaponCard details={details} entry={entry} />
            <ArtifactList
              characterKey={characterKey}
              build={build}
              details={details}
              artifacts={artifacts}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** " · 5★", once the details know the rarity. */
function Stars({ n }: { n: number | undefined }) {
  return n ? <> · {n}★</> : null;
}
