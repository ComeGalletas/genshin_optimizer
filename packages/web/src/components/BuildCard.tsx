import { useMemo } from 'react';
import type {
  Artifact,
  BuildResult,
  OptimizeRequest,
  Slot,
  StatKey,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import {
  formatScore,
  formatSetName,
  formatStat,
  isPctStat,
  objectiveLabel,
  SLOT_LABELS,
  statLabel,
} from '../labels';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { gradeBuild } from '@genshin-build-lab/engine/meta/grade';
import { countSets } from '@genshin-build-lab/engine/optimizer/score';
import { fourPieceAssumptions } from '@genshin-build-lab/engine/damage/setBonuses';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { SlotGlyph } from './SlotGlyph';
import { CheckGlyph } from './ui/Glyphs';
import { cn } from './ui/cn';
import { Meter } from './ui/Meter';
import { GradeMarker } from './ui/GradeMarker';
import { Disclosure } from './ui/Disclosure';

const SHOW: StatKey[] = [
  'atk',
  'atk_pct',
  'crit_rate',
  'crit_dmg',
  'er_pct',
  'em',
  'elemental_dmg',
];

/** The five slot marks on one line, filled where this build actually has a
 *  piece. A build's shape at a glance, next to its score — decorative, because
 *  the piece list below states every one of these slots in words. */
function Fingerprint({ filled }: { filled: (s: Slot) => boolean }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1 text-[13px]">
      {SLOTS.map((s) => (
        <SlotGlyph
          key={s}
          slot={s}
          className={filled(s) ? 'text-accent' : 'text-paper/15'}
        />
      ))}
    </span>
  );
}

/**
 * The optimiser's own notes on a build: which constraints it was pressed
 * against, and how much of the score each slot is carrying. Collapsed, muted
 * and rank-1-only by the caller — a curiosity for the reader who wants it, not
 * a second headline. `details`/`summary` is natively accessible; the twisty is
 * decorative and matches App's disclosure.
 */
function DrivingThis({
  build,
  request,
  artifacts,
}: {
  build: BuildResult;
  request: OptimizeRequest;
  artifacts: Artifact[];
}) {
  // Optional-chained on purpose: a shared `?b=` link is untrusted input, and
  // `parseBuildSnapshot` is the only thing standing between it and this
  // readout. Belt and braces — a missing field skips the row rather than
  // throwing the whole result list away.
  const bindingConstraints = build.diagnostics?.bindingConstraints ?? [];
  // What the 4pc's contribution assumes, or why it isn't scored (ADR-0020) —
  // the last lines of the disclosure, not a headline.
  const assumptions = fourPieceAssumptions(
    Object.entries(countSets(artifacts))
      .filter(([, n]) => n >= 4)
      .map(([key]) => key),
    {
      hasDamage: request.objective === 'avg_damage',
      weaponType: genshinAdapter.weapon(request.weaponKey)?.type,
    },
    formatSetName,
  );
  const marginals = SLOTS.map((s) => ({
    slot: s,
    value: build.diagnostics?.marginalBySlot?.[s],
  }))
    .filter((m): m is { slot: Slot; value: number } => m.value != null)
    .filter((m) => Number.isFinite(m.value));
  if (
    bindingConstraints.length === 0 &&
    marginals.length === 0 &&
    assumptions.length === 0
  )
    return null;
  // Bars are relative to the biggest contributor, so the row reads as "this
  // slot against the others" — the absolute objective units mean little here.
  const peak = Math.max(...marginals.map((m) => Math.abs(m.value)), 0);

  return (
    <Disclosure
      label={<span className="micro-label">What’s Driving This Build</span>}
    >
      <div className="mt-2 space-y-2 text-xs text-muted">
        {bindingConstraints.length > 0 && (
          <ul className="space-y-0.5">
            {bindingConstraints.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        )}
        {marginals.length > 0 && (
          <div>
            <p className="micro-label">Where the Score Comes From</p>
            <ul className="mt-1 space-y-1">
              {marginals.map((m) => (
                <li key={m.slot} className="flex items-center gap-2">
                  {/* Decorative: the slot name is right beside it. */}
                  <SlotGlyph
                    slot={m.slot}
                    className="h-3.5 w-3.5 flex-none text-accent/70"
                  />
                  <span className="w-16 flex-none">{SLOT_LABELS[m.slot]}</span>
                  <Meter
                    value={peak > 0 ? (Math.abs(m.value) / peak) * 100 : 0}
                    className="min-w-0 flex-1"
                  />
                  <span className="flex-none font-mono tabular-nums text-paper/80">
                    {formatScore(m.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {assumptions.map((line) => (
          <p key={line} className="text-2xs leading-relaxed text-muted">
            {line}
          </p>
        ))}
      </div>
    </Disclosure>
  );
}

export function BuildCard({
  build,
  request,
  artifacts,
  rank,
  delta,
  variants,
  compact,
  onShare,
}: {
  build: BuildResult;
  request: OptimizeRequest;
  artifacts: Artifact[];
  rank?: number;
  /** Gap to rank 1 in the *ranking score* — the number the list is actually
   *  ordered by — already signed, and therefore never positive. Omitted on
   *  rank 1, where "0" would be noise. Deliberately not the objective
   *  difference: with a target-style objective (a crit ratio, say) the
   *  displayed objective can be *higher* at rank 2, and a "−" chip on a
   *  bigger number reads as a rendering bug. */
  delta?: number;
  /** How many further builds scored exactly this, and what separates them.
   *  Collapsed into this card rather than repeated as identical siblings. */
  variants?: { count: number; differs: string };
  /** This card is sharing the row with another one. The two-column internals
   *  are sized for the full 768px shell — in half of it they'd wrap mid-value,
   *  so from `lg` (where the caller's two-up grid starts) they stay single
   *  column. */
  compact?: boolean;
  onShare?: () => void | Promise<void>;
}) {
  const bySlot = new Map(artifacts.map((a) => [a.slot, a]));
  const statTargets = META_TARGETS[request.characterKey]?.statTargets;
  const grade = useMemo(
    () => (statTargets ? gradeBuild(build.totals, statTargets) : null),
    [build.totals, statTargets],
  );
  const weakest = grade?.perStat.reduce((a, s) => (s.pct < a.pct ? s : a));

  return (
    <div className="panel panel-sm space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {rank != null && (
            <span
              className="section-badge section-badge-sm"
              aria-label={`Rank ${rank}`}
            >
              {rank}
            </span>
          )}
          <div>
            <p className="micro-label">{objectiveLabel(request.objective)}</p>
            <div className="flex items-baseline gap-2">
              <p className="font-mono text-2xl font-bold leading-tight text-accent-bright">
                {formatScore(build.objectiveValue)}
              </p>
              {delta != null && (
                // The gap to rank 1 in the ranking score, which is the only
                // reason to read a runner-up's number at all. U+2212, not a
                // hyphen: at mono weights a hyphen next to digits reads as a
                // separator. The sign comes from the value rather than being
                // written in, so a zero gap can't print as "−0.0".
                <span
                  className="chip flex-none px-1.5 py-0 font-mono text-2xs tabular-nums text-muted"
                  aria-label={`Rank gap: ${formatScore(delta)} against rank 1`}
                  title="Gap to rank 1 in the ranking score"
                >
                  {delta < 0 && '−'}
                  {formatScore(Math.abs(delta))}
                </span>
              )}
            </div>
            <Fingerprint filled={(s) => bySlot.has(s)} />
          </div>
          {grade && <GradeMarker grade={grade.grade} />}
        </div>
        {onShare && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void onShare()}
          >
            Copy Share Link
          </button>
        )}
      </div>

      {variants && variants.count > 0 && (
        // Equal score means equal answer, so the alternatives are one line here
        // rather than N more cards printing the same number.
        <p className="text-xs text-muted">
          {`×${variants.count + 1} equivalent variants — same score, ${variants.differs}.`}
        </p>
      )}

      {grade && (
        <div className="well px-3 py-2 text-xs text-muted">
          <div
            className={cn(
              'grid gap-x-4 gap-y-1.5 sm:grid-cols-2',
              compact && 'lg:grid-cols-1',
            )}
          >
            {grade.perStat.map((s) => {
              const unit = isPctStat(s.key) ? '%' : '';
              const met = s.pct >= 1;
              return (
                <div key={s.key}>
                  <p>
                    {/* Glyph, not hue alone: the bar below is decorative, so
                        "met" has to survive a colour-blind read of the text. */}
                    {met && (
                      <>
                        <CheckGlyph className="text-jade" />{' '}
                      </>
                    )}
                    {statLabel(s.key)} {formatScore(s.have, 0)}
                    {unit}/{formatScore(s.target, 0)}
                    {unit}{' '}
                    <span className={met ? 'text-jade' : 'text-paper/80'}>
                      ({formatScore(s.pct * 100, 0)}%)
                    </span>
                  </p>
                  <Meter
                    value={s.pct * 100}
                    tone={met ? 'jade' : 'accent'}
                    className="mt-0.5"
                  />
                </div>
              );
            })}
          </div>
          {weakest && weakest.pct < 1 && (
            <p className="mt-1 text-paper/80">
              Weakest: {statLabel(weakest.key)} — upgrading it helps your grade
              most.
            </p>
          )}
        </div>
      )}

      {/* One column below sm: two columns of "label … value" overflowed a
          375px viewport by ~42px. */}
      <dl
        className={cn(
          'grid grid-cols-1 gap-x-6 gap-y-1.5 border-y border-white/5 py-4 text-sm sm:grid-cols-2',
          compact && 'lg:grid-cols-1',
        )}
      >
        {SHOW.map((k) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="text-muted">{statLabel(k)}</dt>
            <dd className="font-mono tabular-nums text-paper">
              {formatStat(k, build.totals[k] ?? 0)}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="space-y-1.5">
        {SLOTS.map((s) => {
          const a = bySlot.get(s);
          return (
            <li key={s} className="well px-3 py-2">
              <div className="flex items-center gap-3 text-sm text-paper/90">
                {/* Decorative: the slot name sits right beside it. The grey
                    box this used to sit in was scaffolding for an unreliable
                    text glyph — the mark carries itself now. */}
                <SlotGlyph slot={s} className="h-[17px] w-[17px] text-accent" />
                <span className="w-16 flex-none text-xs uppercase tracking-wide text-muted">
                  {SLOT_LABELS[s]}
                </span>
                {a ? (
                  <>
                    {/* Wraps below sm; truncation only once there's room for
                        a single line to be the honest reading. */}
                    <span className="min-w-0 flex-1 sm:truncate">
                      <span className="font-medium">
                        {formatSetName(a.setKey)}
                      </span>
                      <span className="text-muted">
                        {' '}
                        · {statLabel(a.mainStat)}{' '}
                        {/* The main-stat VALUE, not the level — a +20 flower
                            printing "HP +20" read as a 20-HP piece. */}
                        <span className="font-mono text-xs text-paper/80">
                          {formatStat(a.mainStat, a.mainStatValue)}
                        </span>
                      </span>
                    </span>
                    <span className="chip flex-none px-2 py-0.5">
                      Lv {a.level}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
              {a && a.subStats.length > 0 && (
                <p className="mt-1 pl-[29px] font-mono text-2xs leading-relaxed text-muted">
                  {a.subStats.map((sub, i) => (
                    <span key={sub.key}>
                      {i > 0 && <span className="text-muted/40"> · </span>}
                      {statLabel(sub.key)}{' '}
                      <span className="text-paper/80">
                        +{formatStat(sub.key, sub.value)}
                      </span>
                    </span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* Rank 1 only (and the single shared build, which carries no rank): the
          same notes under every card would be five disclosures of noise. */}
      {(rank == null || rank === 1) && (
        <DrivingThis build={build} request={request} artifacts={artifacts} />
      )}
    </div>
  );
}
