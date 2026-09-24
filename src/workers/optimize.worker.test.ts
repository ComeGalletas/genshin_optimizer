import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildContext } from '@genshin-build-lab/engine/optimizer/context';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type {
  Artifact,
  OptimizeRequest,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

// jsdom (this suite's test environment) has no global `Worker`, and Vitest's
// default pool doesn't spin up real worker threads for browser-style module
// workers either — so there is no way to `new Worker(...)` this file and get
// a message back the way the app does in a real browser. The smallest
// workable approximation that still exercises `optimize.worker.ts` itself
// (not just `runSearchRequest` in `protocol.ts`, which is already covered by
// `optimizeClient.test.ts`'s mocked-worker tests) is to stub the global
// `self` the module writes `onmessage` onto, import the worker module fresh
// so its top-level `self.onmessage = ...` assignment runs, and then invoke
// that handler exactly the way the browser's worker runtime would: by
// calling it with a `MessageEvent`-shaped object carrying the posted
// `WorkerRequest`, and reading back what it passes to `postMessage`.
describe('optimize.worker.ts (real worker entry point, self-stubbed smoke test)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('wires self.onmessage to post back a well-formed done envelope', async () => {
    const postMessage = vi.fn();
    const fakeSelf: {
      onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
      postMessage: typeof postMessage;
    } = { onmessage: null, postMessage };
    vi.stubGlobal('self', fakeSelf);

    // Import after stubbing so the module's top-level assignment
    // (`self.onmessage = ...`) attaches to our fake self, not jsdom's window.
    await import('./optimize.worker');
    expect(fakeSelf.onmessage).toBeInstanceOf(Function);

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
    let n = 0;
    const inventory: Artifact[] = SLOTS.flatMap((slot) =>
      [0, 1].map((i) => ({
        id: `w${n++}`,
        setKey: 'A',
        slot,
        rarity: 5,
        level: 20,
        mainStat: 'crit_rate' as const,
        mainStatValue: i,
        subStats: [],
      })),
    );
    const message: WorkerRequest = { req, inventory, ctx: buildContext(req) };

    fakeSelf.onmessage!({ data: message } as MessageEvent<WorkerRequest>);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const response = postMessage.mock.calls[0][0] as WorkerResponse;
    expect(response.type).toBe('done');
    if (response.type !== 'done') throw new Error('expected a done envelope');
    expect(response.result.status).toBe('ok');
    if (response.result.status !== 'ok') throw new Error('expected ok result');
    expect(response.result.builds.length).toBeGreaterThan(0);
  });

  it('posts an error envelope instead of throwing when the search itself fails', async () => {
    const postMessage = vi.fn();
    const fakeSelf: {
      onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
      postMessage: typeof postMessage;
    } = { onmessage: null, postMessage };
    vi.stubGlobal('self', fakeSelf);
    await import('./optimize.worker');

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
    // A non-finite contribution (corrupt import data) makes the search's
    // branch-and-bound bound inadmissible, so `searchBuilds` throws rather
    // than silently mis-ranking — the worker's job is to catch that and post
    // an error envelope instead of crashing the message handler.
    let n = 0;
    const corruptInventory: Artifact[] = SLOTS.flatMap((slot) =>
      [0, 1, 2].map((i) => ({
        id: `c${n++}`,
        setKey: 'A',
        slot,
        rarity: 5,
        level: 20,
        mainStat: 'crit_rate' as const,
        mainStatValue: i,
        subStats: [],
      })),
    );
    corruptInventory[0] = { ...corruptInventory[0], mainStatValue: NaN };
    const badMessage: WorkerRequest = {
      req,
      inventory: corruptInventory,
      ctx: buildContext(req),
    };

    fakeSelf.onmessage!({ data: badMessage } as MessageEvent<WorkerRequest>);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const response = postMessage.mock.calls[0][0] as WorkerResponse;
    expect(response.type).toBe('error');
  });
});
