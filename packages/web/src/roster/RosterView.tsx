/**
 * Roster assessment: every owned character with a build score, banded and
 * sorted. A row opens the character's detail drawer.
 */
import { useMemo, useState } from 'react';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { PlayGlyph, ChevronGlyph } from '../components/ui/Glyphs';
import {
  computeBuildScore,
  band,
  groupByLocation,
} from '@genshin-build-lab/engine/roster/buildScore';
import { AppDrawer } from '../components/ui/Drawer';
import { CharacterDetail } from './CharacterDetail';
import { scrollToId } from '../ui/scroll';
import { BAND_TONE, bandLabel, formatScore } from '../labels';
import { CharacterLine } from '../components/ui/CharacterLine';
import { Badge } from '../components/ui/Badge';
import { Meter } from '../components/ui/Meter';

/** Artifact count (10) + artifact quality (30) in `computeBuildScore` — the two
 *  components a character with nothing equipped can never earn. */
const UNSCORED_WITHOUT_GEAR = 40;

function Row({
  characterKey,
  name,
  element,
  weaponName,
  total,
  equippedCount,
  onOpen,
}: {
  characterKey: string;
  name: string;
  element?: string;
  weaponName?: string;
  total: number;
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
        <div className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-bold text-paper">
            {name}
          </span>
          <span className="block truncate text-xs text-muted">
            <CharacterLine element={element} weaponName={weaponName} />
          </span>
          {equippedCount === 0 && (
            <span className="block text-xs text-amber">
              No equipped gear found — {UNSCORED_WITHOUT_GEAR} pts unscored
            </span>
          )}
        </div>
        <div className="flex flex-none items-center gap-3">
          <div className="flex-none">
            {/* "/ 100" is visible text, so it lands in the row's accessible
                name too — a bare "60" said nothing about the scale. */}
            <span className="font-mono text-lg font-bold text-accent-bright">
              {formatScore(total, 0)}
              <span className="text-xs text-muted"> / 100</span>
            </span>
            {/* Decorative restatement of the number above. Hidden below sm:
                it is what squeezed the row's content at 375px. */}
            <Meter value={total} className="mt-0.5 hidden w-12 sm:block" />
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

/** Long enough to outlast vaul's close animation and its scroll-lock release. */
const DRAWER_EXIT_MS = 400;

export function RosterView() {
  const entries = useRoster((s) => s.entries);
  const artifacts = useInventory((s) => s.artifacts);
  const [showAll, setShowAll] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const byLocation = useMemo(() => groupByLocation(artifacts), [artifacts]);

  const rows = useMemo(
    () =>
      Object.entries(entries)
        .map(([key, entry]) => ({
          characterKey: key,
          name: genshinAdapter.characterName(key),
          element: genshinAdapter.character(key)?.element,
          weaponName: entry.weaponKey
            ? genshinAdapter.weapon(entry.weaponKey)?.name
            : undefined,
          equippedCount: (byLocation[key] ?? []).length,
          total: computeBuildScore(entry, byLocation[key] ?? []).total,
        }))
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
  const openEntry = openKey ? entries[openKey] : undefined;

  return (
    <div className="panel panel-md space-y-3">
      {/* The Section hint above already says what this list is and how it is
          ordered; this line only adds what the hint can't — the formula. */}
      <p className="text-sm text-muted">
        Score weighs level, talents, weapon, and the artifacts each of your{' '}
        <span className="font-semibold text-paper">{rows.length}</span>{' '}
        characters has equipped.
      </p>
      <ul className="space-y-2">
        {visible.map((r) => (
          <Row key={r.characterKey} {...r} onOpen={setOpenKey} />
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

      {openKey && openEntry && (
        <AppDrawer
          open
          onClose={() => setOpenKey(null)}
          title={rows.find((r) => r.characterKey === openKey)?.name ?? openKey}
        >
          <CharacterDetail
            characterKey={openKey}
            entry={openEntry}
            artifacts={byLocation[openKey] ?? []}
          />
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => {
              const s = useOptimizeRequest.getState();
              s.setCharacterKey(openKey);
              const w = openEntry.weaponKey;
              if (w) s.setWeaponKey(w);
              setOpenKey(null);
              // The drawer holds a body scroll lock (overflow:hidden) until it
              // has finished animating out, so scrolling synchronously here is
              // a no-op. ponytail: fixed delay rather than watching for the
              // lock to lift — revisit if vaul's exit timing changes.
              setTimeout(() => scrollToId('step-optimise'), DRAWER_EXIT_MS);
            }}
          >
            Optimise This Character
          </button>
        </AppDrawer>
      )}
    </div>
  );
}
