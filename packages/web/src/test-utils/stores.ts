/**
 * Store set-up for tests only: what the app itself never does, so it isn't
 * in the stores (appending raw pieces, putting the request back to its
 * defaults).
 * @packageDocumentation
 */
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';

/** Append pieces to the inventory. */
export function addArtifacts(items: readonly Artifact[]): void {
  useInventory.setState((s) => ({ artifacts: [...s.artifacts, ...items] }));
}

/** The optimize request as the app starts it. */
export function resetOptimizeRequest(): void {
  useOptimizeRequest.setState(useOptimizeRequest.getInitialState());
}
