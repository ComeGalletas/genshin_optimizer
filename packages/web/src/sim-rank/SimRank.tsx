/**
 * Rank by team DPS (TODO 8.2): the Optimise panel's request, run by the
 * local server as `objective: "sim"` (TODO 5.8): its exact search's top
 * builds, each simulated by gcsim in a library rotation with the owner's
 * teammates as equipped, ranked by team DPS with its 95% interval, and the
 * builds the noise can't separate from the best marked tied. It uses the
 * server's account. Offered only while the server runs.
 */
import { useEffect, useId, useState } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { formatSetName } from '@genshin-build-lab/engine/labels';
import { simSpecFromRequest } from '@genshin-build-lab/engine/constraints/fromRequest';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import { currentRequest, useOptimizeRequest } from '../state/optimizeRequest';
import { fetchRotations, type RotationSummary } from '../local-server/teamsim';
import { runSimSpec, type SimRun } from '../local-server/simrank';
import { Callout } from '../components/ui/Callout';
import { Disclosure } from '../components/ui/Disclosure';
import { PieceLine } from '../components/PieceLine';
import { cn } from '../components/ui/cn';
import { kilo } from '../teams/kilo';

const name = (k: string) => genshinAdapter.characterName(k);
const TOP = ['10', '20'] as const;
const ITERATIONS = ['500', '1000'] as const;

/** "Emblem of Severed Fate 4 + Gladiator's Finale 1": the build's sets. */
function setsOf(artifacts: Record<string, { setKey: string }>): string {
  const n = new Map<string, number>();
  for (const a of Object.values(artifacts))
    n.set(a.setKey, (n.get(a.setKey) ?? 0) + 1);
  return [...n]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `${formatSetName(k)} ${c}`)
    .join(' + ');
}

export function SimRank() {
  const state = useOptimizeRequest();
  const request = currentRequest(state);
  const character = request.characterKey;
  const [rotations, setRotations] = useState<RotationSummary[] | null>(null);
  const [rotation, setRotation] = useState('');
  const [top, setTop] = useState<(typeof TOP)[number]>('20');
  const [iterations, setIterations] =
    useState<(typeof ITERATIONS)[number]>('500');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState<{ key: string; run: SimRun } | null>(null);
  const ids = { rotation: useId(), top: useId(), iterations: useId() };

  useEffect(() => {
    let live = true;
    fetchRotations().then(
      (rs) => live && setRotations(rs.filter((r) => !r.problems)),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);

  // The library rotations this character plays in.
  const theirs = (rotations ?? []).filter((r) =>
    (r.characters ?? []).some((s) => s.split(' or ').includes(character)),
  );
  const chosen = theirs.find((r) => r.id === rotation) ?? theirs[0];
  // A result belongs to the request and rotation it ran with.
  const key = JSON.stringify([request, chosen?.id, top, iterations]);
  const run = ran?.key === key ? ran.run : null;

  async function simulate() {
    if (pending || !chosen) return;
    setPending(true);
    setError(null);
    try {
      const spec = simSpecFromRequest(request, {
        rotation: chosen.id,
        topK: Number(top),
        iterations: Number(iterations),
      });
      setRan({ key, run: await runSimSpec(spec) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  if (!rotations)
    return error ? (
      <Callout tone="error" role="alert">
        Couldn’t load the rotation library: {error}.
      </Callout>
    ) : (
      <p className="text-sm text-muted">Loading…</p>
    );
  if (!theirs.length)
    return (
      <p className="text-sm text-muted">
        No library rotation has {name(character)} yet: the Rotation Library
        lists the teams the server can simulate.
      </p>
    );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        The Optimise panel’s conditions for {name(character)}, searched on the
        server’s account; its top builds are each simulated in the team rotation
        with your teammates as equipped.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label" htmlFor={ids.rotation}>
            Rotation
          </label>
          <select
            id={ids.rotation}
            className="field"
            value={chosen?.id}
            onChange={(e) => setRotation(e.target.value)}
          >
            {theirs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.status === 'draft' ? ' (draft)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={ids.top}>
            Builds
          </label>
          <select
            id={ids.top}
            className="field"
            value={top}
            onChange={(e) => setTop(e.target.value as (typeof TOP)[number])}
          >
            {TOP.map((t) => (
              <option key={t} value={t}>
                Top {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={ids.iterations}>
            Iterations
          </label>
          <select
            id={ids.iterations}
            className="field"
            value={iterations}
            onChange={(e) =>
              setIterations(e.target.value as (typeof ITERATIONS)[number])
            }
          >
            {ITERATIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={cn('btn-primary', pending && 'animate-pulse-glow')}
          aria-busy={pending}
          aria-disabled={pending}
          onClick={() => void simulate()}
        >
          {pending ? 'Simulating…' : 'Simulate the Top Builds'}
        </button>
      </div>
      {chosen?.missing?.length ? (
        <Callout tone="warning">
          Your account can’t field{' '}
          {chosen.missing
            .map((m) => m.split(' or ').map(name).join(' or '))
            .join(', ')}{' '}
          for this rotation.
        </Callout>
      ) : null}
      <p className="sr-only" role="status">
        {pending ? 'Simulating.' : run ? 'Ranking ready.' : ''}
      </p>
      {error && (
        <Callout tone="error" role="alert">
          No ranking: {error}.
        </Callout>
      )}
      {run && <Ranking run={run} />}
    </div>
  );
}

function Ranking({ run }: { run: SimRun }) {
  if (run.status !== 'ok')
    return (
      <Callout tone="warning">
        {run.status === 'timeout'
          ? 'The search took too long: narrow the conditions.'
          : `No build meets these conditions on the server’s account.${run.why ? ` ${run.why.join(' ')}` : ''}`}
      </Callout>
    );
  if (!run.sim)
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">{run.understood}</p>
        <Callout tone="warning">
          Not simulated: {(run.notSimulated ?? []).join('; ')}. These are the
          stat search’s builds, in its order.
        </Callout>
        <ol className="space-y-1 text-sm">
          {run.builds.map((b, i) => (
            <li key={i}>
              {i + 1}. {setsOf(b.artifacts)}
            </li>
          ))}
        </ol>
      </div>
    );
  const { sim } = run;
  const mates = sim.teammates.map((t) => name(t.key)).join(', ');
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{run.understood}</p>
      <p className="text-xs text-muted" data-testid="sim-summary">
        {sim.rotation.name}
        {sim.rotation.status === 'draft' ? ' (a draft rotation)' : ''} with{' '}
        {mates} as equipped · {sim.iterations} iterations a build
        {sim.cachedRuns ? ` (${sim.cachedRuns} from the cache)` : ''} ·{' '}
        {(sim.ms / 1000).toFixed(1)} s. Tied builds are within the noise of the
        best.
      </p>
      {run.skipped?.length ? (
        <p className="text-xs text-amber">
          Left out:{' '}
          {run.skipped
            .map(
              (s) =>
                `the stat search’s #${s.statRank} (${s.reasons.join(', ')})`,
            )
            .join('; ')}
          .
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Builds by team DPS</caption>
          <thead className="text-left text-2xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-normal">
                #
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                Team DPS
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                vs best
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                Stat rank
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                Own DPS
              </th>
              <th scope="col" className="py-1 font-normal">
                Sets
              </th>
            </tr>
          </thead>
          <tbody>
            {run.builds.map((b) => (
              <tr
                key={b.rank}
                className="border-t border-white/5 align-top"
                data-testid="sim-build"
              >
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {b.rank}
                </th>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {kilo(b.teamDps.mean)}
                  <span className="block text-2xs text-muted">
                    {kilo(b.teamDps.ci95[0])}–{kilo(b.teamDps.ci95[1])}
                  </span>
                </td>
                <td
                  className={cn(
                    'py-2 pr-3 text-right font-mono tabular-nums',
                    b.tiedWithBest ? 'text-jade' : 'text-muted',
                  )}
                >
                  {b.rank === 1
                    ? 'best'
                    : b.tiedWithBest
                      ? 'tied'
                      : `−${b.behindPct.toFixed(1)}%`}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                  #{b.statRank}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {b.characterDps ? (
                    <>
                      {kilo(b.characterDps.mean)}
                      <span className="block text-2xs text-muted">
                        {(100 * b.characterDps.share).toFixed(0)}%
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 text-xs">
                  <Disclosure label={setsOf(b.artifacts)}>
                    <ul className="mt-1 space-y-0.5">
                      {SLOTS.map((s) => (
                        <PieceLine key={s} a={b.artifacts[s]} />
                      ))}
                    </ul>
                  </Disclosure>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
