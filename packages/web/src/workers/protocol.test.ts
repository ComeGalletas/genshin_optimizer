import { describe, it, expect } from 'vitest';
import { runSearchRequest, readSearchResponse } from './protocol';
import type { WorkerProgress, WorkerRequest, WorkerResponse } from './protocol';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { buildContext } from '@genshin-build-lab/engine/optimizer/context';
import type {
  Artifact,
  OptimizeRequest,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';

let c = 0;
const inv: Artifact[] = SLOTS.flatMap((slot) =>
  [0, 1].map((i) => ({
    id: `p${c++}`,
    setKey: 'A',
    slot,
    rarity: 5 as const,
    level: 20,
    mainStat: 'crit_rate' as const,
    mainStatValue: i,
    subStats: [],
  })),
);

function makeMsg(): WorkerRequest {
  const chars = genshinAdapter.characters();
  const weapons = genshinAdapter.weapons();
  const req: OptimizeRequest = {
    characterKey: chars[0].key,
    weaponKey: weapons[0].key,
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
    topK: 3,
  };
  const ctx = buildContext(req);
  return { req, inventory: inv, ctx };
}

describe('runSearchRequest', () => {
  it('round-trip: readSearchResponse(runSearchRequest(msg)) returns builds', () => {
    const msg = makeMsg();
    const response = runSearchRequest(msg);
    expect(response.type).toBe('done');
    const result = readSearchResponse(response);
    if (result.status !== 'ok') throw new Error('expected a feasible result');
    expect(result.builds.length).toBeGreaterThan(0);
  });

  it('wraps a thrown error into a { type: error } envelope', () => {
    const msg = makeMsg();
    // Force searchBuilds to throw by making ctx.setBonuses a getter that throws.
    const brokenCtx = Object.create(msg.ctx, {
      setBonuses: {
        get() {
          throw new Error('injected failure');
        },
        enumerable: true,
        configurable: true,
      },
    });
    const response = runSearchRequest({ ...msg, ctx: brokenCtx });
    expect(response.type).toBe('error');
    expect((response as { type: 'error'; message: string }).message).toBe(
      'injected failure',
    );
  });
});

describe('runSearchRequest progress', () => {
  // Branch-and-bound prunes hard, so node count grows far more slowly than
  // pool size: a bag has to be both large and genuinely varied (competing
  // sub-stats, three sets) before the search visits the 256 nodes at which it
  // first checks in.
  const SUBS = [
    'crit_rate',
    'crit_dmg',
    'atk_pct',
    'em',
    'er_pct',
    'hp_pct',
  ] as const;
  function bigInventory(): Artifact[] {
    let n = 0;
    return SLOTS.flatMap((slot) =>
      Array.from({ length: 64 }, (_, i) => ({
        id: `big${n++}`,
        setKey: ['A', 'B', 'C'][i % 3],
        slot,
        rarity: 5 as const,
        level: 20,
        mainStat: 'crit_rate' as const,
        mainStatValue: 5 + (i % 3),
        subStats: [
          { key: SUBS[i % SUBS.length], value: 3 + (i % 5) },
          { key: SUBS[(i + 2) % SUBS.length], value: 2 + (i % 7) },
        ],
      })),
    );
  }

  it('streams progress snapshots before the final envelope', () => {
    const msg = { ...makeMsg(), inventory: bigInventory() };
    const seen: WorkerProgress[] = [];
    const response = runSearchRequest(msg, (p) => seen.push(p));
    expect(response.type).toBe('done');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].type).toBe('progress');
    expect(seen[0].explored + seen[0].pruned).toBeGreaterThan(0);
  });

  it('is identical with and without an observer (the hook cannot steer the search)', () => {
    const msg = { ...makeMsg(), inventory: bigInventory() };
    const plain = readSearchResponse(runSearchRequest(msg));
    const watched = readSearchResponse(
      runSearchRequest({ ...makeMsg(), inventory: msg.inventory }, () => {}),
    );
    expect(watched).toEqual(plain);
  });
});

describe('readSearchResponse', () => {
  it('returns result on done envelope', () => {
    const msg = makeMsg();
    const result = readSearchResponse(runSearchRequest(msg));
    if (result.status !== 'ok') throw new Error('expected a feasible result');
    expect(Array.isArray(result.builds)).toBe(true);
  });

  it('throws on error envelope', () => {
    const envelope: WorkerResponse = { type: 'error', message: 'boom' };
    expect(() => readSearchResponse(envelope)).toThrow('boom');
  });

  it('refuses a progress message as a final response', () => {
    const envelope: WorkerResponse = {
      type: 'progress',
      explored: 1,
      pruned: 0,
    };
    expect(() => readSearchResponse(envelope)).toThrow(/not a final response/);
  });
});
