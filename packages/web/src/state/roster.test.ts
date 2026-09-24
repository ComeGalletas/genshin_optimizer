import { describe, it, expect, beforeEach } from 'vitest';
import { useRoster } from './roster';

describe('roster store', () => {
  beforeEach(() => useRoster.getState().clear());

  it('setRoster replaces wholesale rather than merging', () => {
    useRoster.getState().setRoster({ raiden_shogun: { buildLevel: 90 } });
    useRoster
      .getState()
      .setRoster({ the_catch_owner: { weaponKey: 'the_catch' } });
    expect(useRoster.getState().entries).toEqual({
      the_catch_owner: { weaponKey: 'the_catch' },
    });
  });

  it('clear empties the roster', () => {
    useRoster.getState().setRoster({ raiden_shogun: { buildLevel: 90 } });
    useRoster.getState().clear();
    expect(useRoster.getState().entries).toEqual({});
  });
});

describe('roster rehydration is a trust boundary', () => {
  beforeEach(() => useRoster.getState().clear());

  it('drops unresolvable characters and malformed rows, keeping the rest', async () => {
    localStorage.setItem(
      'rpg-build-optimizer/roster',
      JSON.stringify({
        state: {
          entries: {
            raiden_shogun: { buildLevel: 90, weaponKey: 'the_catch' },
            // Not in the frozen dataset: every reader indexes by this key.
            traveler_anemo: { buildLevel: 90 },
            // A real character, but a shape its readers can't use.
            nahida: { buildLevel: 'ninety' },
            klee: 'not an object',
          },
        },
      }),
    );
    await useRoster.persist.rehydrate();
    expect(Object.keys(useRoster.getState().entries)).toEqual([
      'raiden_shogun',
    ]);
  });

  it('survives a blob whose entries field is not an object', async () => {
    localStorage.setItem(
      'rpg-build-optimizer/roster',
      JSON.stringify({ state: { entries: [1, 2, 3] } }),
    );
    await useRoster.persist.rehydrate();
    expect(useRoster.getState().entries).toEqual({});
  });
});
