/**
 * The artifacts a character has on now (TODO 9.9): each slot with its
 * main stat and substats, and the set bonuses they complete.
 */
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import { countSets } from '@genshin-build-lab/engine/optimizer/score';
import { formatSetName, formatStat, SLOT_LABELS, statLabel } from '../labels';
import { ArtifactIcon } from '../components/GameArt';

export function ArtifactList({
  artifacts,
}: {
  artifacts: readonly Artifact[];
}) {
  const sets = Object.entries(countSets([...artifacts])).filter(
    ([, n]) => n >= 2,
  );
  return (
    <section aria-label="Artifacts" className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase text-muted">Artifacts</h3>
      <ul className="space-y-1.5">
        {SLOTS.map((s) => {
          const a = artifacts.find((x) => x.slot === s);
          return (
            <li key={s} className="well flex items-start gap-2 px-3 py-2">
              {a ? (
                <ArtifactIcon setKey={a.setKey} slot={s} size={32} />
              ) : (
                <span className="w-8 flex-none" />
              )}
              <div className="min-w-0 flex-1">
                <p>
                  <span className="mr-2 text-xs uppercase text-muted">
                    {SLOT_LABELS[s]}
                  </span>
                  {a ? (
                    <span>
                      {formatSetName(a.setKey)} · {statLabel(a.mainStat)}{' '}
                      {/* The value, then the level as its own chip — printing
                          "+20" here read as a 20-point main stat. */}
                      <span className="font-mono text-xs text-paper/80">
                        {formatStat(a.mainStat, a.mainStatValue)}
                      </span>{' '}
                      <span className="chip px-2 py-0.5">Lv {a.level}</span>
                    </span>
                  ) : (
                    <span className="text-muted">empty</span>
                  )}
                </p>
                {a && a.subStats.length > 0 && (
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-muted">
                    {a.subStats.map((sub) => (
                      <li key={sub.key}>
                        {statLabel(sub.key)}{' '}
                        <span className="font-mono text-paper/80">
                          {formatStat(sub.key, sub.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {sets.length > 0 && (
        <p className="text-xs text-muted">
          Sets:{' '}
          {sets
            .map(([k, n]) => `${formatSetName(k)} ${n >= 4 ? 4 : 2}-piece`)
            .join(', ')}
        </p>
      )}
    </section>
  );
}
