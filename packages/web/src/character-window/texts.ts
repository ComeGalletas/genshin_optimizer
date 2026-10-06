/**
 * A character's talent and constellation texts (TODO 9.10), one small file
 * each, loaded the first time their window asks and kept for the session.
 * A load that finds nothing isn't kept: the next window tries again.
 * @packageDocumentation
 */
import { useEffect, useState } from 'react';
import {
  loadCharacterTexts,
  type CharacterTexts,
} from '@genshin-build-lab/engine/game/genshin/details';

const cache = new Map<string, Promise<CharacterTexts | null>>();

/** The texts; undefined while loading, null when there are none. */
export function useCharacterTexts(
  key: string,
): CharacterTexts | null | undefined {
  const [state, setState] = useState<{
    key: string;
    texts: CharacterTexts | null | undefined;
  }>({ key, texts: undefined });
  useEffect(() => {
    let live = true;
    let p = cache.get(key);
    if (!p) {
      p = loadCharacterTexts(key);
      cache.set(key, p);
    }
    void p.then((texts) => {
      if (!texts) cache.delete(key);
      if (live) setState({ key, texts });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return state.key === key ? state.texts : undefined;
}
