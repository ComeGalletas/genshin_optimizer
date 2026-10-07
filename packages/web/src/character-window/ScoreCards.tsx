/**
 * The character window's two scores, with how each is worked out (ADR-0057):
 * combat readiness (how far they're levelled, out of 100) and artifact
 * quality (how good their pieces are for them, with no cap), against each of
 * their builds (ADR-0059).
 */
import type { Readiness } from '@genshin-build-lab/engine/roster/buildScore';
import { useId } from 'react';
import {
  bestOf,
  FLAT_FACTOR,
  guideErForWeapon,
  MAIN_STAT_POINTS,
  QUALITY_STAT_ORDER,
  type ArtifactQuality,
} from '@genshin-build-lab/engine/roster/artifactQuality';
import type { GuideSource } from '@genshin-build-lab/engine/meta/guideBuilds';
import {
  crossCheck,
  type CrossCheck,
} from '@genshin-build-lab/engine/roster/crossCheck';
import { SourceLink } from '../components/ui/SourceLink';
import {
  formatScore,
  formatSetName,
  formatStat,
  SLOT_LABELS,
  statLabel,
} from '../labels';
import { Crowns } from '../roster/ScoreValues';

export function ReadinessCard({ readiness }: { readiness: Readiness }) {
  return (
    <section aria-label="Combat readiness" className="well space-y-2 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase text-muted">
        Combat readiness
      </h3>
      <p className="flex items-center gap-2 font-mono text-3xl font-bold text-accent-bright">
        <span>
          {formatScore(readiness.total, 0)}
          <span className="text-base text-muted"> / 100</span>
        </span>
        <Crowns n={readiness.crowns} className="text-xl" />
      </p>
      <dl className="grid gap-1 text-xs">
        {readiness.components.map((c) => (
          <div key={c.label} className="flex justify-between gap-4">
            <dt className="text-muted">{c.label}</dt>
            <dd className="font-mono text-paper">
              {formatScore(c.points, 1)} / {c.max}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-muted">
        How far they&rsquo;re levelled: level and weapon level out of 90,
        talents out of 9/9/9, and how many of the five pieces they wear. A crown
        marks each talent at level 10, which takes a Crown of Insight; it
        doesn&rsquo;t add points.
      </p>
    </section>
  );
}

/** The guides a build comes from, in words. */
const SOURCE_NAMES: Record<GuideSource, string> = {
  kqm: 'KQM',
  genshinBuilds: 'genshin-builds',
};
const sourcesText = (sources: readonly GuideSource[]) =>
  sources.length
    ? `From ${sources.map((s) => SOURCE_NAMES[s]).join(' and ')}`
    : 'From the curated target';
const buildName = (q: ArtifactQuality) =>
  q.profile.constellation
    ? `${q.profile.name} (${q.profile.constellation})`
    : q.profile.name;

/** genshin.gg's build against the one shown (ADR-0060): a cross-check,
 *  not part of the score. */
function CrossCheckLine({ check }: { check: CrossCheck }) {
  const differences = [
    !check.topSetAgrees &&
      check.topSet.length > 0 &&
      `its top set is ${check.topSet.map(formatSetName).join(' + ')}`,
    ...check.extraMains.map(
      (m) =>
        `it also takes ${m.stats.map(statLabel).join(' or ')} on the ${SLOT_LABELS[m.slot].toLowerCase()}`,
    ),
    check.extraSubstats.length > 0 &&
      `it also lists ${check.extraSubstats.map(statLabel).join(', ')} substats`,
  ].filter(Boolean);
  return (
    <p className="text-xs leading-relaxed text-muted" data-testid="cross-check">
      Cross-check:{' '}
      <SourceLink href={check.url} className="text-accent hover:underline">
        genshin.gg
      </SourceLink>{' '}
      ({check.role}){' '}
      {check.agrees
        ? 'agrees with this build.'
        : `differs: ${differences.join('; ')}.`}
    </p>
  );
}

export function QualityCard({
  characterKey,
  qualities,
  build,
  onBuildChange,
  unscored = [],
  weapon,
}: {
  /** For the genshin.gg cross-check. */
  characterKey?: string;
  /** The pieces scored against each of the character's builds. */
  qualities: readonly ArtifactQuality[];
  /** The build shown (defaults to the best fit). */
  build?: number;
  onBuildChange?: (build: number) => void;
  /** Builds the guides list but leave stats out of, and why. */
  unscored?: readonly { name: string; source: GuideSource; reason: string }[];
  /** The weapon held, and the Energy Recharge its substat gives. */
  weapon?: { name: string; er?: number };
}) {
  const uid = useId();
  const best = bestOf(qualities);
  const quality = (build !== undefined && qualities[build]) || best;
  const notScored = unscored.length > 0 && (
    <p className="text-xs leading-relaxed text-muted" data-testid="unscored">
      {unscored.map((u) => (
        <span key={`${u.source}-${u.name}`} className="block">
          Not scored: {u.name} ({SOURCE_NAMES[u.source]}), because {u.reason}.
        </span>
      ))}
    </p>
  );
  if (!quality || !best)
    return (
      <section
        aria-label="Artifact quality"
        className="well space-y-1 px-3 py-2"
      >
        <h3 className="text-xs font-semibold uppercase text-muted">
          Artifact quality
        </h3>
        <p className="text-sm text-muted">
          No recipe yet: there&rsquo;s no build for this character, so their
          artifacts aren&rsquo;t scored rather than guessed at.
        </p>
        {notScored}
      </section>
    );
  const ok = quality.main.slots.filter((s) => s.ok).length;
  // Always in one order: CRIT Rate, CRIT DMG, HP, ATK, DEF, EM, ER.
  const stats = QUALITY_STAT_ORDER.flatMap((k) => {
    const v = quality.byStat[k] ?? 0;
    return v > 0 ? [[k, v] as const] : [];
  });
  const unused = quality.unused;
  const forWeapon = weapon && guideErForWeapon(quality.profile, weapon.name);
  const check = characterKey && crossCheck(characterKey, quality.profile);
  return (
    <section aria-label="Artifact quality" className="well space-y-2 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase text-muted">
        Artifact quality
      </h3>
      <p className="font-mono text-3xl font-bold text-paper">
        {formatScore(quality.total, 1)}
      </p>
      {qualities.length > 1 ? (
        <label className="block text-xs" htmlFor={`${uid}-build`}>
          <span className="text-muted">Build </span>
          <select
            id={`${uid}-build`}
            className="field mt-1 py-1 text-sm"
            value={quality.build}
            onChange={(e) => onBuildChange?.(Number(e.target.value))}
            data-testid="build-picker"
          >
            {qualities.map((q) => (
              <option key={q.build} value={q.build}>
                {buildName(q)} · {formatScore(q.total, 1)}
                {q.build === best.build ? ' · best fit' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-muted">
          Build: <span className="text-paper">{buildName(quality)}</span>
        </p>
      )}
      <p className="text-xs text-muted" data-testid="build-sources">
        {sourcesText(quality.profile.sources)}
        {quality.build !== best.build &&
          ` · their best fit is ${buildName(best)} (${formatScore(best.total, 1)})`}
      </p>
      <p className="text-sm text-paper/90" data-testid="quality-summary">
        Main stats {ok} of 3 · {formatScore(quality.rolls, 1)} good rolls of{' '}
        {formatScore(quality.possible, 1)} possible
      </p>
      <dl className="grid gap-1 text-xs">
        {quality.main.slots.map((s) => (
          <div key={s.slot} className="flex justify-between gap-4">
            <dt className="text-muted">{SLOT_LABELS[s.slot]} main stat</dt>
            <dd className={s.ok ? 'text-paper' : 'text-amber'}>
              {s.mainStat ? statLabel(s.mainStat) : 'none'}{' '}
              <span className="font-mono">
                {s.ok ? `+${MAIN_STAT_POINTS}` : '+0'}
              </span>
            </dd>
          </div>
        ))}
        {stats.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{statLabel(k)} rolls</dt>
            <dd className="font-mono text-paper">{formatScore(v, 1)}</dd>
          </div>
        ))}
        {quality.er && (
          <div className="flex flex-wrap justify-between gap-x-4">
            <dt className="text-muted">
              Energy Recharge
              {quality.er.min !== undefined && ' vs the build’s minimum'}
            </dt>
            <dd
              className={
                quality.er.short > 0 ? 'font-mono text-amber' : 'font-mono'
              }
            >
              {formatStat('er_pct', quality.er.total)}
              {quality.er.min !== undefined &&
                ` / ${formatStat('er_pct', quality.er.min)}`}
              {quality.er.short > 0 &&
                ` (${formatStat('er_pct', quality.er.short)} short)`}
            </dd>
            {weapon && (weapon.er || forWeapon) && (
              <dd className="w-full text-muted" data-testid="er-weapon">
                {weapon.er
                  ? `${weapon.name} gives +${formatStat('er_pct', weapon.er)}`
                  : weapon.name}
                {forWeapon &&
                  `; the guide asks ${forWeapon.min}% with ${forWeapon.weapon}`}
                .
              </dd>
            )}
          </div>
        )}
      </dl>
      <p className="text-xs leading-relaxed text-muted">
        How good their pieces are for a build: {MAIN_STAT_POINTS} points for
        each sands, goblet and circlet with a main stat it takes, plus every
        roll on a stat it uses, counted as a share of that stat&rsquo;s largest
        roll (a perfect roll is 1). Flat HP, ATK and DEF count {FLAT_FACTOR}.
        CRIT and Energy Recharge count for everyone, all of it; the
        build&rsquo;s minimum is shown, not a limit. Each build is scored, and
        the one that fits their pieces best counts. The score compares artifacts
        for this character; &ldquo;of possible&rdquo; is the most their pieces
        could hold.
      </p>
      {unused && (
        <p className="text-xs leading-relaxed text-muted" data-testid="unused">
          {unused.stats.map((k) => statLabel(k)).join(' and ')}{' '}
          {unused.stats.length > 1 ? "don't" : "doesn't"} count for them:{' '}
          {unused.reason}.
        </p>
      )}
      {notScored}
      {check && <CrossCheckLine check={check} />}
    </section>
  );
}
