/**
 * One character's window (TODO 9.9, ADR-0055): who they are and how they
 * stand now, from any character the app shows. A character not in the
 * roster opens too, at level 90 with nothing equipped.
 */
import { useMemo } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { groupByLocation } from '@genshin-build-lab/engine/roster/buildScore';
import { AppDrawer } from '../components/ui/Drawer';
import { CharacterDetail } from '../roster/CharacterDetail';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { goTo } from '../components/views';
import { scrollToId } from '../ui/scroll';
import { CharacterSplash } from './CharacterSplash';
import { useCharacterWindow } from './store';

/** Long enough to outlast vaul's close animation and its scroll-lock release. */
const DRAWER_EXIT_MS = 400;

export function CharacterWindowDrawer({
  characterKey,
}: {
  characterKey: string;
}) {
  const close = useCharacterWindow((s) => s.close);
  const entry = useRoster((s) => s.entries[characterKey]);
  const artifacts = useInventory((s) => s.artifacts);
  const equipped = useMemo(
    () => groupByLocation(artifacts)[characterKey] ?? [],
    [artifacts, characterKey],
  );
  return (
    <AppDrawer
      open
      onClose={close}
      title={genshinAdapter.characterName(characterKey)}
      background={<CharacterSplash characterKey={characterKey} />}
    >
      {/* Keyed: another character starts again on the first tab. */}
      <CharacterDetail
        key={characterKey}
        characterKey={characterKey}
        entry={entry}
        artifacts={equipped}
      />
      <button
        type="button"
        className="btn-primary mt-4 w-full"
        onClick={() => {
          const s = useOptimizeRequest.getState();
          s.setCharacterKey(characterKey);
          if (entry?.weaponKey) s.setWeaponKey(entry.weaponKey);
          close();
          // The drawer holds a body scroll lock (overflow:hidden) until it
          // has finished animating out, so scrolling synchronously here is
          // a no-op. ponytail: fixed delay rather than watching for the
          // lock to lift — revisit if vaul's exit timing changes.
          setTimeout(() => {
            goTo('optimise');
            scrollToId('step-optimise');
          }, DRAWER_EXIT_MS);
        }}
      >
        Optimise This Character
      </button>
    </AppDrawer>
  );
}
