/**
 * One character's window (TODO 9.9, 9.10, ADR-0055): who they are and how
 * they stand now, from any character the app shows. A character not in the
 * roster opens too, at level 90 with nothing equipped. Optimise is at the
 * bottom of Overview, and a small Optimize beside the name on the others.
 */
import { useMemo, useState } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { groupByLocation } from '@genshin-build-lab/engine/roster/buildScore';
import { AppDrawer } from '../components/ui/Drawer';
import { CharacterDetail, type CharacterTab } from '../roster/CharacterDetail';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { goTo } from '../components/views';
import { scrollToIdWhenShown } from '../ui/scroll';
import { CharacterSplash } from './CharacterSplash';
import { useCharacterWindow } from './store';

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
  // Another character starts again on Overview.
  const [tab, setTab] = useState<{ key: string; tab: CharacterTab }>({
    key: characterKey,
    tab: 'Overview',
  });
  const current = tab.key === characterKey ? tab.tab : 'Overview';

  const optimise = () => {
    const s = useOptimizeRequest.getState();
    s.setCharacterKey(characterKey);
    if (entry?.weaponKey) s.setWeaponKey(entry.weaponKey);
    // The drawer unmounts at once (no close animation), taking its scroll
    // lock with it; the Optimise view may still be loading, so the scroll
    // waits for its section.
    close();
    goTo('optimise');
    scrollToIdWhenShown('step-optimise');
  };

  return (
    <AppDrawer
      onClose={close}
      title={genshinAdapter.characterName(characterKey)}
      largeTitle
      titleAction={
        current !== 'Overview' && (
          <button
            type="button"
            className="focus-ring flex-none rounded-md bg-accent px-3 py-1 text-xs font-semibold text-surface-900 transition-opacity hover:opacity-90"
            onClick={optimise}
          >
            Optimize
          </button>
        )
      }
      background={<CharacterSplash characterKey={characterKey} />}
    >
      <CharacterDetail
        key={characterKey}
        characterKey={characterKey}
        entry={entry}
        artifacts={equipped}
        tab={current}
        onTabChange={(t) => setTab({ key: characterKey, tab: t })}
        footer={
          <button
            type="button"
            className="btn-primary w-full"
            onClick={optimise}
          >
            Optimise This Character
          </button>
        }
      />
    </AppDrawer>
  );
}
