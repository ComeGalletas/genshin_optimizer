/**
 * The character window's two scores, with how each is worked out (ADR-0057):
 * combat readiness (how far they're levelled, out of 100) and artifact
 * quality (how good their pieces are for them, with no cap).
 */
import type { Readiness } from '@genshin-build-lab/engine/roster/buildScore';
import {
  FLAT_FACTOR,
  MAIN_STAT_POINTS,
  QUALITY_STAT_ORDER,
  type ArtifactQuality,
} from '@genshin-build-lab/engine/roster/artifactQuality';
import { formatScore, formatStat, SLOT_LABELS, statLabel } from '../labels';
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

export function QualityCard({ quality }: { quality: ArtifactQuality | null }) {
  if (!quality)
    return (
      <section
        aria-label="Artifact quality"
        className="well space-y-1 px-3 py-2"
      >
        <h3 className="text-xs font-semibold uppercase text-muted">
          Artifact quality
        </h3>
        <p className="text-sm text-muted">
          No recipe yet: there&rsquo;s no curated build for this character, so
          their artifacts aren&rsquo;t scored rather than guessed at.
        </p>
      </section>
    );
  const ok = quality.main.slots.filter((s) => s.ok).length;
  // Always in one order: CRIT Rate, CRIT DMG, HP, ATK, DEF, EM, ER.
  const stats = QUALITY_STAT_ORDER.flatMap((k) => {
    const v = quality.byStat[k] ?? 0;
    return v > 0 ? [[k, v] as const] : [];
  });
  const unused = quality.unused;
  return (
    <section aria-label="Artifact quality" className="well space-y-2 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase text-muted">
        Artifact quality
      </h3>
      <p className="font-mono text-3xl font-bold text-paper">
        {formatScore(quality.total, 1)}
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
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              Energy Recharge
              {quality.er.min !== undefined && ' vs guide minimum'}
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
          </div>
        )}
      </dl>
      <p className="text-xs leading-relaxed text-muted">
        How good their pieces are for them: {MAIN_STAT_POINTS} points for each
        sands, goblet and circlet with a main stat they use, plus every roll on
        a stat they use, counted as a share of that stat&rsquo;s largest roll (a
        perfect roll is 1). Flat HP, ATK and DEF count {FLAT_FACTOR}. CRIT and
        Energy Recharge count for everyone, all of it; the guide&rsquo;s minimum
        is shown, not a limit. The score compares artifacts for this character;
        &ldquo;of possible&rdquo; is the most their pieces could hold.
      </p>
      {unused && (
        <p className="text-xs leading-relaxed text-muted" data-testid="unused">
          {unused.stats.map((k) => statLabel(k)).join(' and ')}{' '}
          {unused.stats.length > 1 ? "don't" : "doesn't"} count for them:{' '}
          {unused.reason}.
        </p>
      )}
    </section>
  );
}
