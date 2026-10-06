/**
 * The game's image names (ADR-0052), loaded once for every `GameImage` on
 * the page, the first time one mounts.
 * @packageDocumentation
 */
import {
  loadImageNames,
  type ImageNames,
} from '@genshin-build-lab/engine/game/genshin/images';
import { lazyResource } from '../hooks/lazyResource';

const names = lazyResource(loadImageNames);

/** The names, or null until they arrive (or if they can't: every image
 *  keeps its fallback). */
export function useImageNames(): ImageNames | null {
  const v = names.useValue();
  return v === 'failed' ? null : v;
}

/** Test hook: these names (or none), as if loaded. */
export const setImageNamesForTests = names.setForTests;
