/**
 * UID import (ADR-0006): fetches a player's Enka.Network showcase from the
 * browser and hands the body to the engine's pure parser.
 * @packageDocumentation
 */
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import {
  parseEnkaResponse,
  type UidError,
} from '@genshin-build-lab/engine/import/enka';

export type { UidError };

export async function fetchUidArtifacts(
  uid: string,
): Promise<Artifact[] | UidError> {
  let res: Response;
  try {
    res = await fetch(
      `https://enka.network/api/uid/${encodeURIComponent(uid)}`,
    );
  } catch {
    return { error: 'NETWORK' };
  }
  if (!res.ok) return { error: 'NOT_FOUND' };
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { error: 'NETWORK' };
  }
  return parseEnkaResponse(data);
}
