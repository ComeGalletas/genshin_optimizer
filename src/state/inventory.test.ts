import { describe, it, expect, beforeEach } from 'vitest';
import { useInventory } from './inventory';
import type { Artifact } from '@genshin-build-lab/engine/game/types';

const sample = (over: Partial<Artifact> = {}): Artifact => ({
  id: 'a1',
  setKey: 'EmblemOfSeveredFate',
  slot: 'sands',
  rarity: 5,
  level: 20,
  mainStat: 'atk_pct',
  mainStatValue: 46.6,
  subStats: [{ key: 'crit_dmg', value: 14 }],
  ...over,
});

describe('inventory store', () => {
  beforeEach(() => useInventory.getState().clear());

  it('adds an artifact', () => {
    useInventory.getState().add(sample());
    expect(useInventory.getState().artifacts).toHaveLength(1);
  });
});

describe('inventory rehydration is a trust boundary', () => {
  beforeEach(() => useInventory.getState().clear());

  it('keeps the valid rows of a legacy blob and drops the corrupt one', async () => {
    // A blob written by an older build (or hand-edited in devtools) reaches
    // the optimiser and BuildCard's render unchecked. One bad row must cost
    // the player that row, not their whole inventory.
    localStorage.setItem(
      'rpg-build-optimizer/inventory',
      JSON.stringify({
        state: {
          artifacts: [
            sample({ id: 'good-1' }),
            { id: 'corrupt', slot: 'sands' },
            sample({ id: 'good-2', level: 999 }),
          ],
        },
      }),
    );
    await useInventory.persist.rehydrate();
    expect(useInventory.getState().artifacts.map((a) => a.id)).toEqual([
      'good-1',
    ]);
  });

  it('survives a blob whose artifacts field is not an array', async () => {
    localStorage.setItem(
      'rpg-build-optimizer/inventory',
      JSON.stringify({ state: { artifacts: 'everything' } }),
    );
    await useInventory.persist.rehydrate();
    expect(useInventory.getState().artifacts).toEqual([]);
  });
});
