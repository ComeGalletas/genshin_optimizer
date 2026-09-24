/**
 * The Plan page: recommended Abyss teams → an optimised build for each of the
 * eight members → one farming list.
 *
 * Eight exact solves are not free, so the plan only runs on an explicit click —
 * never on mount.
 */
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  rosterBuildScores,
  groupByLocation,
  equippedGrade,
} from '@genshin-build-lab/engine/roster/buildScore';
import { recommendAbyss } from '@genshin-build-lab/engine/teams/recommend';
import { archetypeName } from '@genshin-build-lab/engine/teams/comps';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { formatScore, objectiveHint, objectiveLabel } from '../labels';
import { gradeBuild, type Grade } from '@genshin-build-lab/engine/meta/grade';
import { GradeMarker } from '../components/ui/GradeMarker';
import { SourceLink } from '../components/ui/SourceLink';
import { BuildCard } from '../components/BuildCard';
import { Callout } from '../components/ui/Callout';
import { cn } from '../components/ui/cn';
import { optimize } from '../workers/optimizeClient';
import {
  composePlan,
  type Plan,
  type RunOptimize,
} from '@genshin-build-lab/engine/plan/composePlan';
import {
  adviseInvestments,
  type Advice,
} from '@genshin-build-lab/engine/invest/advise';
import type {
  Artifact,
  OptimizeRequest,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';

/** The grade a member's winning build would earn, or null when the character
 *  has no curated stat targets (or failed to gear). */
function memberGrade(b: Plan['builds'][number]): Grade | null {
  const targets = META_TARGETS[b.characterKey]?.statTargets;
  if (!targets || b.result.status !== 'ok') return null;
  return gradeBuild(b.result.builds[0].totals, targets)?.grade ?? null;
}

/** One line of the team summary: who, how well they scored, how close to the
 *  endgame stat line, and whether the shared bag cost them anything — with the
 *  whole row as the disclosure control for that member's full card.
 *
 *  Native `details`/`summary`: the browser owns the expanded state and the
 *  aria wiring, so the only state left here is "has this row ever been
 *  opened" — a member's card is eight artifacts of rendering, so it is
 *  mounted on first open and kept mounted after. */
function SummaryRow({
  build,
  currentGrade,
  children,
}: {
  build: Plan['builds'][number];
  /** What's currently equipped on this member, graded the same way — null
   *  when there's nothing to compare (no recipe, or nothing equipped). */
  currentGrade: Grade | null;
  children: ReactNode;
}) {
  const name = genshinAdapter.characterName(build.characterKey);
  const grade = memberGrade(build);
  const [mounted, setMounted] = useState(false);
  const value =
    build.result.status === 'ok'
      ? formatScore(build.result.builds[0].objectiveValue)
      : null;
  return (
    <li data-testid="plan-summary-row">
      <details
        className="group"
        onToggle={(e) => {
          if (e.currentTarget.open) setMounted(true);
        }}
      >
        <summary className="focus-ring touch-target flex w-full cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5">
          <span
            aria-hidden="true"
            className="w-3 flex-none text-2xs text-muted transition group-open:rotate-90"
          >
            ▶
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-paper">
            {name}
          </span>
          {value !== null ? (
            <span className="font-mono text-sm tabular-nums text-accent-bright">
              {value}
            </span>
          ) : (
            <span className="text-xs text-muted">no build</span>
          )}
          {currentGrade && (
            <GradeMarker grade={currentGrade} subject="your current build" />
          )}
          {grade && (
            <GradeMarker grade={grade} subject="the optimizer's best build" />
          )}
          <span className="w-20 flex-none text-right text-2xs text-muted">
            {build.conflicts.length > 0
              ? `${build.conflicts.length} conflict${build.conflicts.length === 1 ? '' : 's'}`
              : ''}
          </span>
        </summary>
        <div className="px-3 pb-3 pt-1">{mounted && children}</div>
      </details>
    </li>
  );
}

function MemberCard({
  characterKey,
  objective,
  result,
  conflicts,
  weaponKey,
  buildLevel,
  artifactsById,
}: Plan['builds'][number] & {
  weaponKey: string;
  buildLevel: OptimizeRequest['buildLevel'];
  artifactsById: Record<string, Artifact>;
}) {
  const name = genshinAdapter.characterName(characterKey);
  const request: OptimizeRequest = {
    characterKey,
    weaponKey,
    buildLevel,
    constraints: {},
    objective,
  };
  return (
    <div data-testid="plan-member" className="space-y-2">
      <h4 className="font-display text-sm font-bold text-paper">{name}</h4>
      {/* Per member, not per card: Results hoists this above its list because
          ten cards share one objective, but eight plan members do not. */}
      <p className="text-xs text-muted">{objectiveHint(objective)}</p>
      {!META_TARGETS[characterKey] && (
        <p className="text-xs text-amber">
          No curated recipe for {name} yet — this is the highest raw{' '}
          {objectiveLabel(objective)} from the remaining pieces, ignoring set
          bonuses. Treat it as a stat-stick draft, not a real build.
        </p>
      )}
      {result.status === 'ok' ? (
        <BuildCard
          build={result.builds[0]}
          request={request}
          artifacts={SLOTS.map(
            (s) => artifactsById[result.builds[0].artifactIds[s]],
          ).filter((a): a is Artifact => Boolean(a))}
        />
      ) : (
        <p className="panel panel-md text-sm text-muted">
          Couldn’t gear {name}: teammates earlier in the plan had first pick of
          the shared inventory, and the artifacts left don’t meet {name}’s
          recommended loadout (required set, main stats and ER). The notes below
          show which pieces went where.
        </p>
      )}
      {conflicts.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted marker:text-muted">
          {conflicts.slice(0, 3).map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlanView({
  runOptimize = optimize,
  advise = adviseInvestments,
}: {
  /** Injected in tests; the app runs the real worker client. */
  runOptimize?: RunOptimize;
  advise?: typeof adviseInvestments;
}) {
  const entries = useRoster((s) => s.entries);
  const artifacts = useInventory((s) => s.artifacts);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [failed, setFailed] = useState(false);
  // Eight full cards is ~3,500px of scrolling, so the plan leads with a
  // summary and each member's card is opened on demand. `planSeq` keys the
  // rendered plan, so a freshly built plan remounts the rows — which is what
  // collapses them, now that `details` owns its own open state.
  const [planSeq, setPlanSeq] = useState(0);
  // A plan is eight awaited solves. If its inputs are replaced mid-flight the
  // run in progress describes gear the user no longer has, so only the most
  // recently started run may commit progress, a plan, or a failure.
  const planToken = useRef(0);

  // Resolves each member's chosen artifact ids back to Artifact objects for
  // BuildCard — mirrors Results.tsx's artifactsFor.
  const artifactsById = useMemo(() => {
    const m: Record<string, Artifact> = {};
    for (const a of artifacts) m[a.id] = a;
    return m;
  }, [artifacts]);

  const equippedByChar = useMemo(() => groupByLocation(artifacts), [artifacts]);

  const { teams, advice } = useMemo(() => {
    const scores = rosterBuildScores(entries, artifacts);
    const rec = recommendAbyss(scores);
    return {
      teams: rec.teams,
      advice: advise(rec.gaps, entries, scores) as Advice[],
    };
  }, [entries, artifacts, advise]);

  // A plan is a solve over one specific roster + inventory. Re-importing
  // replaces both, so the eight cards on screen describe gear the user no
  // longer has. Reset during render, the way Results.tsx resets its share
  // cues — React re-runs this pass before painting the stale plan.
  const [planInputs, setPlanInputs] = useState({ entries, artifacts });
  if (planInputs.entries !== entries || planInputs.artifacts !== artifacts) {
    setPlanInputs({ entries, artifacts });
    setPlan(null);
    setFailed(false);
    setProgress(null);
  }
  // Layout, not passive: layout effects run inside the commit, so the token
  // is already bumped by the time an awaited solve's continuation — a
  // microtask, which cannot run until the stack empties — gets to check it.
  useLayoutEffect(() => {
    planToken.current++;
  }, [planInputs]);

  async function build() {
    // The button is aria-disabled rather than disabled so it keeps focus
    // across the run; the guard has to be here.
    if (!teams || running) return;
    const token = ++planToken.current;
    setFailed(false);
    setProgress([0, 8]);
    try {
      const p = await composePlan(
        teams,
        entries,
        artifacts,
        runOptimize,
        (d, t) => {
          if (planToken.current === token) setProgress([d, t]);
        },
      );
      if (planToken.current !== token) return; // superseded
      setPlan(p);
      setPlanSeq((n) => n + 1);
    } catch (err) {
      if (planToken.current !== token) return;
      console.error('Plan failed', err);
      setFailed(true);
    } finally {
      if (planToken.current === token) setProgress(null);
    }
  }

  const running = progress !== null;

  return (
    <div className="space-y-4">
      <div className="panel panel-md flex flex-wrap items-center justify-between gap-3">
        {/* The Section hint above already says "an optimised build for all
            eight members, plus one farming list"; this line only adds the
            part it doesn't — who gets first pick of the shared bag. */}
        <p className="text-sm text-muted">
          {teams
            ? 'The carries get first pick of the shared inventory.'
            : 'Import a GOOD file — the plan needs a roster to pick teams from.'}
        </p>
        <button
          type="button"
          className={cn('btn-primary', running && 'animate-pulse-glow')}
          aria-busy={running}
          aria-disabled={!teams || running}
          onClick={() => void build()}
        >
          {running
            ? `Optimising ${progress[0]}/${progress[1]}…`
            : 'Build My Abyss Plan'}
        </button>
      </div>

      {/* Persistent regions for both notices below: a role mounted in the
          same commit as its text (a fresh `role="status"`/`role="alert"`
          node) isn't reliably announced — see App.tsx's live region — so
          these always-mounted twins carry the announcement and the visible
          progress/Callout below stay purely visual. */}
      <p className="sr-only" role="status">
        {running ? `Optimising member ${progress[0]} of ${progress[1]}…` : ''}
      </p>
      <p className="sr-only" role="alert">
        {failed ? 'Building the plan failed — please try again.' : ''}
      </p>

      {running && (
        <div className="space-y-1">
          <p className="text-xs text-muted" data-testid="progress-text">
            Optimising member {progress[0]} of {progress[1]}…
          </p>
          <div
            aria-hidden="true"
            className="h-1.5 overflow-hidden rounded-full bg-white/5"
          >
            <div
              className="h-full rounded-full bg-accent/70 transition-[width]"
              style={{ width: `${(progress[0] / progress[1]) * 100}%` }}
            />
          </div>
        </div>
      )}

      {failed && (
        <Callout tone="error">
          Building the plan failed — please try again.
        </Callout>
      )}

      {plan && (
        // While the next plan is solving, the eight cards on screen are the
        // previous one. Dim them and mark the region busy so the old numbers
        // aren't read as the new ones.
        <div
          key={planSeq}
          aria-busy={running}
          className={cn(
            'space-y-4 transition-opacity',
            running && 'opacity-40',
          )}
        >
          {plan.teams.map((team, i) => {
            const members = new Set(team.members.map((m) => m.characterKey));
            return (
              <section
                key={team.archetypeId}
                className="panel panel-sm space-y-2"
              >
                <h3 className="font-display text-base font-bold text-paper">
                  {i === 0 ? 'First Half' : 'Second Half'} —{' '}
                  {archetypeName(team.archetypeId)}
                </h3>
                <ul className="-mx-1">
                  {plan.builds
                    .filter((b) => members.has(b.characterKey))
                    .map((b) => (
                      <SummaryRow
                        key={b.characterKey}
                        build={b}
                        currentGrade={
                          entries[b.characterKey]?.weaponKey
                            ? equippedGrade(
                                b.characterKey,
                                entries[b.characterKey].weaponKey as string,
                                entries[b.characterKey]?.buildLevel ?? 90,
                                equippedByChar[b.characterKey] ?? [],
                              )
                            : null
                        }
                      >
                        <MemberCard
                          {...b}
                          weaponKey={entries[b.characterKey]?.weaponKey ?? ''}
                          buildLevel={entries[b.characterKey]?.buildLevel ?? 90}
                          artifactsById={artifactsById}
                        />
                      </SummaryRow>
                    ))}
                </ul>
              </section>
            );
          })}

          {plan.farming.length > 0 && (
            <div className="panel panel-md space-y-2">
              <h3 className="font-display text-base font-bold text-paper">
                What to Farm
              </h3>
              <ul className="list-disc space-y-1 pl-4 text-sm text-paper/90 marker:text-muted">
                {plan.farming.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {advice.length > 0 && (
            <div className="panel panel-md space-y-2">
              <h3 className="font-display text-base font-bold text-paper">
                Worth Investing In
              </h3>
              <ul className="space-y-2 text-sm">
                {advice.map((a) => (
                  <li
                    key={`${a.kind}:${a.subjectKey}:${a.provenance}`}
                    data-testid="advice"
                  >
                    <p className="text-paper">{a.headline}</p>
                    <p className="text-xs text-muted">
                      {a.detail}
                      {a.source && (
                        <>
                          {' '}
                          <SourceLink
                            href={a.source}
                            className="focus-ring underline decoration-dotted underline-offset-2 hover:text-paper"
                          >
                            source
                          </SourceLink>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
