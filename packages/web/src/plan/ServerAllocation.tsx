/**
 * The plan's account-wide allocation (TODO 8.2, ADR-0048): the same eight
 * members, their pieces shared out jointly by the local server instead of
 * in turn, with each member's share of their best build alone, the plan's
 * score, the moves to make in the game, and the farming list. Offered only
 * while the server runs; it plans the server's account.
 */
import { useId, useState } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { planMembers } from '@genshin-build-lab/engine/plan/composePlan';
import type { TeamInstance } from '@genshin-build-lab/engine/teams/recommend';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import {
  postAllocate,
  type AllocateMode,
  type AllocateResult,
} from '../local-server/allocate';
import { BuildCard } from '../components/BuildCard';
import { Callout } from '../components/ui/Callout';
import { cn } from '../components/ui/cn';

const MODES: { mode: AllocateMode; label: string; hint: string }[] = [
  {
    mode: 'exact',
    label: 'Best plan (exact)',
    hint: 'the best plan within each member’s top 20 builds, proven',
  },
  {
    mode: 'v1',
    label: 'Local search',
    hint: 'the greedy plan, improved by swaps until none helps',
  },
  {
    mode: 'greedy',
    label: 'Greedy (fastest)',
    hint: 'each member in turn over what is left, as the plan above',
  },
];

const name = (k: string) => genshinAdapter.characterName(k);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

export function ServerAllocation({
  teams,
}: {
  teams: [TeamInstance, TeamInstance];
}) {
  const [mode, setMode] = useState<AllocateMode>('exact');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AllocateResult | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const modeId = useId();

  async function run() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      // The plan's members, its picking order and its role weights.
      const members = planMembers(teams, {}).map((m) => ({
        spec: { character: m.characterKey },
        priority: m.priority,
        weight: m.weight,
      }));
      setResult(await postAllocate({ members, mode }));
      setDone(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  const s = result?.score;
  return (
    <div className="panel panel-md space-y-4" data-testid="server-allocation">
      <div className="space-y-1">
        <h3 className="font-display text-base font-bold text-paper">
          Share the Pieces Jointly
        </h3>
        <p className="text-xs text-muted">
          The local server plans the same eight members together, so a carry
          isn’t handed a piece a teammate needs more. It uses the server’s
          account and takes a minute or two.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label" htmlFor={modeId}>
            Allocation
          </label>
          <select
            id={modeId}
            className="field"
            value={mode}
            onChange={(e) => setMode(e.target.value as AllocateMode)}
          >
            {MODES.map((m) => (
              <option key={m.mode} value={m.mode}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={cn('btn-primary', pending && 'animate-pulse-glow')}
          aria-busy={pending}
          aria-disabled={pending}
          onClick={() => void run()}
        >
          {pending ? 'Allocating…' : 'Allocate on the Server'}
        </button>
        <p className="text-xs text-muted">
          {MODES.find((m) => m.mode === mode)!.hint}.
        </p>
      </div>
      <p className="sr-only" role="status">
        {pending
          ? 'Allocating on the server.'
          : result
            ? 'Allocation ready.'
            : ''}
      </p>
      {error && (
        <Callout tone="error" role="alert">
          No allocation: {error}.
        </Callout>
      )}

      {result && (
        <div
          aria-busy={pending}
          className={cn('space-y-4', pending && 'opacity-40')}
        >
          <p className="text-sm" data-testid="plan-score">
            {s ? (
              <>
                Plan score {pct(s.exact ?? s.improved)}
                <span className="text-muted">
                  {' '}
                  (greedy {pct(s.greedy)}
                  {s.exact !== undefined
                    ? `, local search ${pct(s.improved)}`
                    : ''}
                  )
                </span>
                {result.solver && (
                  <span className="text-muted">
                    {result.solver.exact
                      ? ' · proven best within each member’s top builds'
                      : ' · the search stopped at its budget: the best found'}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">Greedy plan</span>
            )}
            <span className="text-muted">
              {' '}
              · {(result.ms / 1000).toFixed(0)} s
            </span>
          </p>
          <p className="text-2xs text-muted">
            A member’s share is their build against their best build alone; the
            plan’s score averages the shares, a carry counting twice.
          </p>

          <ul className="space-y-2">
            {result.members.map((m) => (
              <li key={m.characterKey} data-testid="alloc-member">
                <details className="group rounded-lg bg-white/[0.02] px-3 py-2">
                  <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 rounded">
                    <span className="min-w-28 text-sm text-paper">
                      {name(m.characterKey)}
                    </span>
                    {m.share !== undefined ? (
                      <span className="flex flex-1 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5"
                        >
                          <span
                            className={cn(
                              'block h-full rounded-full',
                              m.share >= 0.9995 ? 'bg-jade/70' : 'bg-amber/70',
                            )}
                            style={{ width: `${Math.min(1, m.share) * 100}%` }}
                          />
                        </span>
                        <span className="w-14 text-right font-mono text-xs tabular-nums">
                          {pct(Math.min(1, m.share))}
                        </span>
                      </span>
                    ) : (
                      <span className="flex-1" />
                    )}
                    <span className="text-2xs text-muted">×{m.weight}</span>
                    {m.status !== 'ok' && (
                      <span className="text-xs text-rose">no build</span>
                    )}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted">{m.understood}</p>
                    {m.build ? (
                      <BuildCard
                        build={m.build}
                        request={m.request}
                        artifacts={SLOTS.map((sl) => m.build!.artifacts[sl])}
                      />
                    ) : (
                      <p className="text-sm text-muted">
                        No build meets {name(m.characterKey)}’s conditions from
                        the pieces left; the farming list says why.
                      </p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>

          <section aria-labelledby="moves-h" className="space-y-2">
            <h4 id="moves-h" className="text-sm font-bold text-paper">
              Moves in the Game
            </h4>
            <p className="text-xs text-muted">
              {result.moves.moves.length
                ? `In this order: equipping a piece someone wears swaps it with yours. ${result.moves.inPlace} planned ${result.moves.inPlace === 1 ? 'piece is' : 'pieces are'} already in place.`
                : 'Nothing to move: every planned piece is already in place.'}
            </p>
            <ol className="space-y-1 text-sm">
              {result.moves.moves.map((mv, i) => (
                <li key={i}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={done.has(i)}
                      onChange={() =>
                        setDone((d) => {
                          const n = new Set(d);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          return n;
                        })
                      }
                    />
                    <span
                      className={cn(done.has(i) && 'text-muted line-through')}
                    >
                      {mv.text}
                    </span>
                  </label>
                </li>
              ))}
            </ol>
          </section>

          {result.farming.length > 0 && (
            <section aria-labelledby="alloc-farm-h" className="space-y-2">
              <h4 id="alloc-farm-h" className="text-sm font-bold text-paper">
                What to Farm or Level
              </h4>
              <ul className="list-disc space-y-1 pl-4 text-sm text-paper/90 marker:text-muted">
                {result.farming.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
