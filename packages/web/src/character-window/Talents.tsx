/**
 * Talent levels (TODO 9.9): each at the level the account raised it to,
 * then the +3 its constellations add, when they do ("9 + 3").
 */
import {
  talentBonus,
  type Details,
  type TalentKind,
} from '@genshin-build-lab/engine/game/genshin/details';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';

const KINDS: { kind: TalentKind; label: string }[] = [
  { kind: 'auto', label: 'Normal Attack' },
  { kind: 'skill', label: 'Elemental Skill' },
  { kind: 'burst', label: 'Elemental Burst' },
];

export function Talents({
  details,
  characterKey,
  entry,
}: {
  details: Details | null | 'failed';
  characterKey: string;
  entry: RosterEntry | undefined;
}) {
  const levels = entry?.talents;
  const c =
    details && details !== 'failed'
      ? details.characters[characterKey]
      : undefined;
  if (!levels && !c?.talents) return null;
  const bonus = c
    ? talentBonus(c, entry?.constellation ?? 0)
    : { auto: 0, skill: 0, burst: 0 };
  return (
    <section aria-label="Talents" className="well space-y-1 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase text-muted">Talents</h3>
      <dl className="grid gap-1">
        {KINDS.map(({ kind, label }, i) => (
          <div
            key={kind}
            className="flex justify-between gap-4"
            data-testid={`talent-${kind}`}
          >
            <dt className="min-w-0">
              <span className="text-paper">{label}</span>
              {c?.talents && (
                <span className="block truncate text-xs text-muted">
                  {c.talents[i]}
                </span>
              )}
            </dt>
            <dd className="flex-none font-mono">
              {levels ? (
                <>
                  <span className="text-paper">{levels[kind]}</span>
                  {bonus[kind] > 0 && (
                    <span
                      className="text-accent-bright"
                      title={`${levels[kind] + bonus[kind]} with constellations`}
                    >
                      {' '}
                      + {bonus[kind]}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
