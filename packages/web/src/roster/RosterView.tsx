/**
 * Roster assessment: every owned character with their two scores (ADR-0057),
 * combat readiness (banded, and the order) and artifact quality, best first.
 * A row opens the character's window (TODO 9.9).
 */
import { useMemo, useState } from 'react';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { PlayGlyph, ChevronGlyph } from '../components/ui/Glyphs';
import {
  band,
  computeReadiness,
  groupByLocation,
  READINESS_POINTS,
} from '@genshin-build-lab/engine/roster/buildScore';
import {
  artifactQuality,
  type ArtifactQuality,
} from '@genshin-build-lab/engine/roster/artifactQuality';
import { QualityValue, ReadinessValue } from './ScoreValues';
import { openCharacter } from '../character-window/store';
import { BAND_TONE, bandLabel } from '../labels';
import { CharacterLine } from '../components/ui/CharacterLine';
import { Badge } from '../components/ui/Badge';
import { Meter } from '../components/ui/Meter';
import { CharacterPortrait } from '../components/GameArt';

function Row({
  characterKey,
  name,
  element,
  weaponName,
  total,
  crowns,
  quality,
  equippedCount,
  onOpen,
}: {
  characterKey: string;
  name: string;
  element?: string;
  weaponName?: string;
  total: number;
  crowns: number;
  quality: ArtifactQuality | null;
  equippedCount: number;
  onOpen: (characterKey: string) => void;
}) {
  const b = band(total);
  return (
    <li className="card transition-colors hover:border-accent/30 hover:bg-surface-700/70">
      <button
        type="button"
        className="focus-ring touch-target flex w-full flex-col items-stretch gap-2 rounded-xl px-4 py-3 text-left transition-transform active:scale-[0.995] sm:flex-row sm:items-center sm:gap-3"
        onClick={() => onOpen(characterKey)}
      >
        {/* No <h3>: a heading inside a button is stripped of its heading role
            anyway, and 16 identical rows are not a useful heading outline. */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CharacterPortrait characterKey={characterKey} size={40} />
          <div className="min-w-0 flex-1">
            <span
              className="block truncate font-display text-sm font-bold text-paper"
              data-testid="roster-name"
            >
              {name}
            </span>
            <span className="block truncate text-xs text-muted">
              <CharacterLine element={element} weaponName={weaponName} />
            </span>
            {equippedCount === 0 && (
              <span className="block text-xs text-amber">
                No equipped artifacts found — {READINESS_POINTS.artifacts}{' '}
                readiness points unscored
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-3">
          <div className="flex-none">
            {/* "/ 100" is visible text, so it lands in the row's accessible
                name too — a bare "60" said nothing about the scale. */}
            <ReadinessValue total={total} crowns={crowns} className="text-lg" />
            {/* Decorative restatement of the number above. Hidden below sm:
                it is what squeezed the row's content at 375px. */}
            <Meter value={total} className="mt-0.5 hidden w-12 sm:block" />
            <QualityValue quality={quality} className="block" />
          </div>
          <Badge tone={BAND_TONE[b]}>{bandLabel(b)}</Badge>
          <ChevronGlyph className="ml-auto text-muted sm:ml-0" />
        </div>
      </button>
    </li>
  );
}

/** Long rosters scroll past everything below them, so only the best-scored
 *  slice shows until the user asks for the rest. */
const COLLAPSED_COUNT = 12;

export function RosterView() {
  const entries = useRoster((s) => s.entries);
  const artifacts = useInventory((s) => s.artifacts);
  const [showAll, setShowAll] = useState(false);

  const byLocation = useMemo(() => groupByLocation(artifacts), [artifacts]);

  const rows = useMemo(
    () =>
      Object.entries(entries)
        .map(([key, entry]) => {
          const worn = byLocation[key] ?? [];
          const readiness = computeReadiness(entry, worn);
          return {
            characterKey: key,
            name: genshinAdapter.characterName(key),
            element: genshinAdapter.character(key)?.element,
            weaponName: entry.weaponKey
              ? genshinAdapter.weapon(entry.weaponKey)?.name
              : undefined,
            equippedCount: worn.length,
            total: readiness.total,
            crowns: readiness.crowns,
            quality: artifactQuality(key, entry, worn),
          };
        })
        .sort((a, b) => b.total - a.total),
    [entries, byLocation],
  );

  if (rows.length === 0) {
    return (
      <div className="panel panel-md">
        <p className="text-sm text-muted">
          Import a GOOD file to see your roster.
        </p>
      </div>
    );
  }

  const visible = showAll ? rows : rows.slice(0, COLLAPSED_COUNT);

  return (
    <div className="panel panel-md space-y-3">
      {/* The Section hint above already says what this list is and how it is
          ordered; this line only adds the count and how to read the scores. */}
      <p className="text-sm text-muted">
        <span className="font-semibold text-paper">{rows.length}</span>{' '}
        characters. A crown marks each talent at level 10; an artifact score
        compares pieces for that one character, so read two characters by their
        &ldquo;good rolls of possible&rdquo; in their window.
      </p>
      <ul className="space-y-2">
        {visible.map((r) => (
          <Row key={r.characterKey} {...r} onOpen={openCharacter} />
        ))}
      </ul>
      {rows.length > COLLAPSED_COUNT && !showAll && (
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => setShowAll(true)}
        >
          <PlayGlyph /> Show All {rows.length} Characters, Sorted by Score
        </button>
      )}
    </div>
  );
}
