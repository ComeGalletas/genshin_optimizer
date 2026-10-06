/**
 * A character's stats as they stand (TODO 9.9, ADR-0055): each one's base,
 * then what the artifacts add, then what the weapon's substat and the
 * ascension stat add, and the total: "HP 15307 + 9180 = 24487".
 */
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import {
  weaponCapUnknown,
  type Details,
} from '@genshin-build-lab/engine/game/genshin/details';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';
import {
  ascensionOf,
  characterSheet,
  type SheetInput,
  type SheetStat,
} from '@genshin-build-lab/engine/roster/characterSheet';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { elementLabel, formatStat, statLabel } from '../labels';

/** The sheet's inputs from a roster entry; level 90 and nothing equipped
 *  for a character the account doesn't have. */
function sheetInput(
  characterKey: string,
  entry: RosterEntry | undefined,
  artifacts: readonly Artifact[],
): SheetInput {
  if (!entry) return { characterKey, level: 90, ascension: 6, artifacts: [] };
  return {
    characterKey,
    level: entry.level ?? entry.buildLevel ?? 1,
    ascension: ascensionOf(entry.buildLevel),
    weaponKey: entry.weaponKey,
    weaponLevel: entry.weaponLevel,
    weaponAscension: entry.weaponAscension,
    artifacts,
  };
}

function label(stat: SheetStat, element: string | undefined) {
  return stat === 'elemental_dmg' && element && element !== 'physical'
    ? `${elementLabel(element)} DMG Bonus`
    : statLabel(stat);
}

export function CharacterStats({
  details,
  characterKey,
  entry,
  artifacts,
}: {
  details: Details | null | 'failed';
  characterKey: string;
  entry: RosterEntry | undefined;
  artifacts: readonly Artifact[];
}) {
  if (details === null) return <p className="text-muted">Loading stats…</p>;
  if (details === 'failed')
    return <p className="text-muted">The stat data could not load.</p>;
  const sheet = characterSheet(
    details,
    sheetInput(characterKey, entry, artifacts),
  );
  if (!sheet)
    return (
      <p className="text-muted">
        No stat data for this character yet: they are newer than the app’s game
        data.
      </p>
    );
  const element = genshinAdapter.character(characterKey)?.element;
  const w = entry?.weaponKey ? details.weapons[entry.weaponKey] : undefined;
  const capUnknown =
    !!w &&
    entry?.weaponLevel !== undefined &&
    weaponCapUnknown(w, entry.weaponLevel, entry.weaponAscension);
  return (
    <div className="well px-3 py-2">
      <dl className="divide-y divide-white/5">
        {sheet.rows.map((r) => (
          <div
            key={r.stat}
            className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5"
            data-testid={`stat-${r.stat}`}
          >
            <dt className="text-muted">{label(r.stat, element)}</dt>
            <dd className="font-mono text-xs text-paper/80">
              {formatStat(r.stat, r.base)}{' '}
              <span className="text-accent-bright">
                + {formatStat(r.stat, r.artifacts)}
              </span>
              {r.other !== 0 && (
                <span className="text-flux-bright">
                  {' '}
                  + {formatStat(r.stat, r.other)}
                </span>
              )}{' '}
              ={' '}
              <span className="text-sm font-bold text-paper">
                {formatStat(r.stat, r.total)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        Base <span className="text-accent-bright">+ artifacts</span>{' '}
        <span className="text-flux-bright">+ weapon substat and ascension</span>{' '}
        = <span className="text-paper">total</span>. Weapon passives, 4-piece
        bonuses and constellations are left out: most depend on the fight.
      </p>
      {capUnknown && (
        <p className="mt-1 text-xs text-amber" data-testid="weapon-cap-unknown">
          The weapon is at an ascension cap and this saved roster doesn’t say
          whether it has ascended: its ATK and substat are counted before
          ascending. Load your account again for the exact values.
        </p>
      )}
    </div>
  );
}
