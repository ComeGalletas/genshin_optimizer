/**
 * One artifact as the game shows it, on one line: set, slot, main stat,
 * level, substats, and who wears it (the import center, the simulated
 * ranking).
 */
import type { ReactNode } from 'react';
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  formatSetName,
  formatStat,
  SLOT_LABELS,
  statLabel,
} from '@genshin-build-lab/engine/labels';

const name = (key: string) => genshinAdapter.characterName(key);

/** A piece as the game shows it: set, slot, main stat, level, substats,
 *  and who wears it. */
export function PieceLine({ a, note }: { a: Artifact; note?: ReactNode }) {
  return (
    <li className="text-xs leading-relaxed">
      <span className="font-medium text-paper">
        {formatSetName(a.setKey)} {SLOT_LABELS[a.slot].toLowerCase()}
      </span>{' '}
      <span className="text-muted">
        · {statLabel(a.mainStat)} · +{a.level} ·{' '}
        {a.subStats
          .map((s) => `${statLabel(s.key)} ${formatStat(s.key, s.value)}`)
          .join(', ')}
        {a.location ? ` · on ${name(a.location)}` : ''}
      </span>
      {note && <span className="text-paper"> {note}</span>}
    </li>
  );
}
