/**
 * The comparison view's charts (TODO 6.2): each run's DPS distribution as a
 * box plot on one shared axis, and each run's damage share by character.
 * The shapes are decoration for sighted readers; every number is also in
 * text beside them, so nothing depends on seeing the bars.
 */
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type { TeamRun } from '../local-server/teamsim';
import { cn } from '../components/ui/cn';
import { kilo } from './kilo';

/** Element → bar fill. Written out so Tailwind keeps every class. */
const FILL: Record<string, string> = {
  pyro: 'bg-element-pyro',
  hydro: 'bg-element-hydro',
  electro: 'bg-element-electro',
  cryo: 'bg-element-cryo',
  anemo: 'bg-element-anemo',
  geo: 'bg-element-geo',
  dendro: 'bg-element-dendro',
};

const charName = (k: string) => genshinAdapter.character(k)?.name ?? k;

type Simulated = TeamRun & { dps: NonNullable<TeamRun['dps']> };
const simulated = (runs: TeamRun[]): Simulated[] =>
  runs.filter((r): r is Simulated => r.dps !== undefined);

/** One box plot per run on a shared scale: whiskers min–max, box q1–q3,
 *  a line at the median, a dot at the mean. */
export function DpsDistribution({ runs }: { runs: TeamRun[] }) {
  const rows = simulated(runs);
  if (!rows.length) return null;
  const lo = Math.min(...rows.map((r) => r.dps.min ?? r.dps.mean));
  const hi = Math.max(...rows.map((r) => r.dps.max ?? r.dps.mean));
  const span = hi - lo || 1;
  const x = (v: number) => `${(100 * (v - lo)) / span}%`;
  return (
    <ul className="space-y-3" aria-label="DPS distribution per run">
      {rows.map((r) => {
        const d = r.dps;
        return (
          <li key={r.label} data-testid="dps-row">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-paper">{r.label}</span>
              <span className="font-mono tabular-nums text-muted">
                median {kilo(d.median ?? d.mean)} · middle half{' '}
                {kilo(d.q1 ?? d.mean)}–{kilo(d.q3 ?? d.mean)} · range{' '}
                {kilo(d.min ?? d.mean)}–{kilo(d.max ?? d.mean)}
              </span>
            </div>
            <svg
              aria-hidden="true"
              className="mt-1 h-5 w-full overflow-visible"
              data-testid="box-plot"
            >
              <line
                x1={x(d.min ?? d.mean)}
                x2={x(d.max ?? d.mean)}
                y1="50%"
                y2="50%"
                className="stroke-muted"
                strokeWidth={1}
              />
              <rect
                x={x(d.q1 ?? d.mean)}
                width={`${(100 * ((d.q3 ?? d.mean) - (d.q1 ?? d.mean))) / span}%`}
                y="15%"
                height="70%"
                rx={2}
                className="fill-accent/30 stroke-accent"
              />
              <line
                x1={x(d.median ?? d.mean)}
                x2={x(d.median ?? d.mean)}
                y1="10%"
                y2="90%"
                className="stroke-paper"
                strokeWidth={2}
              />
              <circle cx={x(d.mean)} cy="50%" r={3} className="fill-amber" />
            </svg>
          </li>
        );
      })}
      <li className="flex justify-between font-mono text-2xs text-muted">
        <span>{kilo(lo)}</span>
        <span>team DPS per fight · dot = mean</span>
        <span>{kilo(hi)}</span>
      </li>
    </ul>
  );
}

/** Each run's damage split by character, as a bar and as text. */
export function DamageShare({ runs }: { runs: TeamRun[] }) {
  const rows = runs.filter((r) => r.characters?.length);
  if (!rows.length) return null;
  return (
    <ul className="space-y-3" aria-label="Damage share per run">
      {rows.map((r) => {
        const chars = [...r.characters!].sort((a, b) => b.share - a.share);
        return (
          <li key={r.label} data-testid="share-row">
            <p className="text-xs text-paper">{r.label}</p>
            <div
              aria-hidden="true"
              className="mt-1 flex h-3 w-full gap-px overflow-hidden rounded-full bg-white/5"
            >
              {chars.map((c) => (
                <span
                  key={c.character}
                  className={cn(
                    'h-full',
                    FILL[
                      genshinAdapter.character(c.character)?.element ?? ''
                    ] ?? 'bg-muted',
                  )}
                  style={{ width: `${100 * c.share}%` }}
                />
              ))}
            </div>
            <p className="mt-1 text-2xs text-muted">
              {chars
                .map(
                  (c) =>
                    `${charName(c.character)} ${(100 * c.share).toFixed(0)}% (${kilo(c.dps)})`,
                )
                .join(' · ')}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
