import { describe, it, expect, afterEach } from 'vitest';
import { sourceLabel, useAccount } from './account';

afterEach(() => useAccount.getState().clear());

describe('the account’s source (TODO 9.4)', () => {
  it('says where the data came from', () => {
    expect(
      [
        { kind: 'demo' as const },
        { kind: 'server' as const },
        { kind: 'file' as const, name: 'export.json' },
        { kind: 'uid' as const, uid: '700000000' },
        { kind: 'manual' as const },
      ].map(sourceLabel),
    ).toEqual([
      'the demo data',
      'the local server',
      'export.json',
      'UID 700000000',
      'added by hand',
    ]);
  });

  it('keeps the source with its time and the last load’s confirmation, and clears them', () => {
    useAccount.getState().setSource({ kind: 'server' });
    useAccount.getState().setLoaded('Loaded.');
    expect(useAccount.getState()).toMatchObject({
      source: { kind: 'server' },
      at: expect.stringMatching(/^\d{4}-/),
      loaded: 'Loaded.',
    });
    useAccount.getState().clear();
    expect(useAccount.getState()).toMatchObject({
      source: null,
      at: null,
      loaded: null,
    });
  });
});
