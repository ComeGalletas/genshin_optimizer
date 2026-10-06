/**
 * The weapon a character holds, as it is now (TODO 9.9): its level and
 * refinement, base ATK and substat at that level, its passive at that
 * refinement, and its description.
 */
import {
  passiveText,
  weaponStatsAt,
  type Details,
} from '@genshin-build-lab/engine/game/genshin/details';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { formatStat, statLabel } from '../labels';
import { WeaponIcon } from '../components/GameArt';

export function WeaponCard({
  details,
  entry,
}: {
  details: Details | null | 'failed';
  entry: RosterEntry | undefined;
}) {
  const key = entry?.weaponKey;
  if (!key)
    return (
      <section aria-label="Weapon" className="well px-3 py-2 text-muted">
        No weapon equipped.
      </section>
    );
  const meta = genshinAdapter.weapon(key);
  const d = details && details !== 'failed' ? details : null;
  const w = d?.weapons[key];
  const level = entry.weaponLevel;
  const stats =
    d && w && level !== undefined
      ? weaponStatsAt(d, w, level, entry.weaponAscension)
      : null;
  const refinement = entry.weaponRefinement ?? 1;
  return (
    <section aria-label="Weapon" className="well space-y-2 px-3 py-2">
      <div className="flex items-center gap-3">
        <WeaponIcon weaponKey={key} size={56} />
        <div className="min-w-0">
          <p className="font-semibold text-paper">{meta?.name ?? key}</p>
          <p className="text-xs text-muted">
            {meta?.type &&
              `${meta.type[0].toUpperCase()}${meta.type.slice(1)} · `}
            {meta?.rarity ? `${meta.rarity}★ · ` : ''}
            {level !== undefined && `Lv ${level} · `}R{refinement}
          </p>
        </div>
      </div>
      {stats && w && (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted">Base ATK</dt>
            <dd className="font-mono text-paper">
              {formatStat('atk', stats.atk)}
            </dd>
          </div>
          {w.subStat && (
            <div>
              <dt className="text-muted">{statLabel(w.subStat)}</dt>
              <dd className="font-mono text-paper">
                {formatStat(w.subStat, stats.sub)}
              </dd>
            </div>
          )}
        </dl>
      )}
      {w?.passive && (
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-paper">
            {w.passive.name}{' '}
            <span className="font-normal text-muted">(R{refinement})</span>
          </p>
          <p className="whitespace-pre-line text-paper/80">
            {passiveText(w, refinement)}
          </p>
        </div>
      )}
      {w?.description && (
        <p className="whitespace-pre-line text-2xs italic leading-relaxed text-muted">
          {w.description}
        </p>
      )}
      {details === null && <p className="text-xs text-muted">Loading…</p>}
    </section>
  );
}
