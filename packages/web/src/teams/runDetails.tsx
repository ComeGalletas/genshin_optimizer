/**
 * A comparison's details (TODO 8.2): the team each run fielded (variants
 * shown by what they changed), and each character's DPS, share, field
 * time and energy waits per run.
 */
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { formatSetName } from '@genshin-build-lab/engine/labels';
import type { TeamRun } from '../local-server/teamsim';
import { Disclosure } from '../components/ui/Disclosure';
import { kilo } from './kilo';

type Member = NonNullable<TeamRun['team']>[number];

const name = (k: string) => genshinAdapter.character(k)?.name ?? k;
const weapon = (m: Member) =>
  `${genshinAdapter.weapon(m.weapon)?.name ?? m.weapon} R${m.refinement}`;
const sets = (m: Member) =>
  m.sets.length ? m.sets.map(formatSetName).join(' + ') : 'no set bonus';
const gear = (m: Member) => `${weapon(m)} · ${sets(m)}`;

/** What a variant's slot changed against the base's, in words; null when
 *  nothing did. */
function change(m: Member, b: Member | undefined): string | null {
  if (!b) return `${name(m.character)}: ${gear(m)}`;
  if (m.character !== b.character)
    return `${name(m.character)} for ${name(b.character)}: ${gear(m)}`;
  const parts = [
    weapon(m) !== weapon(b) && `${weapon(m)} (base ${weapon(b)})`,
    sets(m) !== sets(b) && `${sets(m)} (base ${sets(b)})`,
  ].filter(Boolean);
  return parts.length ? `${name(m.character)}: ${parts.join(', ')}` : null;
}

export function TeamAsRun({ runs }: { runs: TeamRun[] }) {
  const [base, ...variants] = runs;
  if (!base?.team) return null;
  return (
    <div className="space-y-2 text-xs">
      <table className="w-full">
        <caption className="sr-only">The base team</caption>
        <thead className="text-left text-2xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-normal">
              {base.label}
            </th>
            <th scope="col" className="py-1 pr-3 font-normal">
              Weapon
            </th>
            <th scope="col" className="py-1 font-normal">
              Sets
            </th>
          </tr>
        </thead>
        <tbody>
          {base.team.map((m) => (
            <tr key={m.slot} className="border-t border-white/5">
              <th scope="row" className="py-1 pr-3 text-left font-normal">
                {name(m.character)}
              </th>
              <td className="py-1 pr-3">{weapon(m)}</td>
              <td className="py-1">{sets(m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {variants.some((v) => v.team) && (
        <ul className="space-y-0.5" data-testid="variant-teams">
          {variants
            .filter((v) => v.team)
            .map((v) => {
              const changes = v
                .team!.map((m) =>
                  change(
                    m,
                    base.team!.find((b) => b.slot === m.slot),
                  ),
                )
                .filter((c): c is string => !!c);
              return (
                <li key={v.label}>
                  <span className="text-paper">{v.label}:</span>{' '}
                  <span className="text-muted">
                    {changes.length
                      ? changes.join('; ')
                      : 'the same team (another rotation or enemy)'}
                    .
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

export function PerCharacter({ runs }: { runs: TeamRun[] }) {
  const simulated = runs.filter((r) => r.characters?.length);
  if (!simulated.length) return null;
  return (
    <div className="space-y-1">
      {simulated.map((r, i) => (
        <Disclosure key={r.label} label={r.label} open={i === 0}>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full text-xs">
              <caption className="sr-only">Per character in {r.label}</caption>
              <thead className="text-left text-2xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Character
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal">
                    DPS
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal">
                    Share
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal">
                    On field
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Energy wait
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.characters!.map((c) => (
                  <tr key={c.character} className="border-t border-white/5">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      {name(c.character)}
                    </th>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">
                      {kilo(c.dps)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">
                      {(100 * c.share).toFixed(1)}%
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">
                      {c.fieldSec.toFixed(1)} s
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums">
                      {c.energyWaitSec >= 0.05
                        ? `${c.energyWaitSec.toFixed(1)} s`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      ))}
    </div>
  );
}
