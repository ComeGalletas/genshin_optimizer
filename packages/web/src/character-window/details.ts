/**
 * The character and weapon details (ADR-0055), loaded once, the first
 * time a character window asks for them.
 * @packageDocumentation
 */
import {
  loadDetails,
  type Details,
} from '@genshin-build-lab/engine/game/genshin/details';
import { lazyResource } from '../hooks/lazyResource';

const details = lazyResource(loadDetails);

/** The details; null while loading, 'failed' when they could not load (the
 *  next window tries again). */
export function useDetails(): Details | null | 'failed' {
  return details.useValue();
}
