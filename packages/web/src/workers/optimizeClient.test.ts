import { describe, it, expect, vi, afterEach } from 'vitest';
import { optimize, optimizeRun, isOptimizeCancelled } from './optimizeClient';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type {
  Artifact,
  OptimizeRequest,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';

let c = 0;
const inv: Artifact[] = SLOTS.flatMap((slot) =>
  [0, 1].map((i) => ({
    id: `i${c++}`,
    setKey: 'A',
    slot,
    rarity: 5,
    level: 20,
    mainStat: 'crit_rate' as const,
    mainStatValue: i,
    subStats: [],
  })),
);

describe('optimize (deep entry, sync fallback)', () => {
  it('builds context from the adapter and resolves with builds', async () => {
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
    // Worker is undefined in the Vitest/Node environment, so this exercises the
    // synchronous fallback path (buildContext -> searchBuilds) end to end.
    const r = await optimize(req, inv);
    if (r.status !== 'ok') throw new Error('expected a feasible result');
    expect(r.builds.length).toBeGreaterThan(0);
  });

  it('zeroes an off-element goblet main stat before it reaches the solver (ADR-0014)', async () => {
    const chars = genshinAdapter.characters();
    const character = chars[0];
    const offElement = (
      ['pyro', 'hydro', 'electro', 'cryo', 'anemo', 'geo', 'dendro'] as const
    ).find((e) => e !== character.element)!;
    const goblet: Artifact = {
      id: 'goblet-off',
      setKey: 'A',
      slot: 'goblet',
      rarity: 5,
      level: 20,
      mainStat: 'elemental_dmg',
      mainStatValue: 1000, // would dominate the objective if not zeroed
      subStats: [],
      element: offElement,
    };
    const req: OptimizeRequest = {
      characterKey: character.key,
      weaponKey: genshinAdapter.weapons()[0].key,
      buildLevel: 90,
      constraints: {},
      objective: 'elemental_dmg',
      topK: 1,
    };
    const withGoblet = [
      ...inv.filter((a) => a.slot !== 'goblet'),
      goblet,
      { ...goblet, id: 'goblet-off-2' },
    ];
    const r = await optimize(req, withGoblet);
    if (r.status !== 'ok') throw new Error('expected a feasible result');
    // The off-element goblet's 1000 main-stat value must not appear in totals.
    expect(r.builds[0].totals.elemental_dmg ?? 0).toBe(0);
  });

  it('cancelling before the fallback runs rejects with a cancellation', async () => {
    const req: OptimizeRequest = {
      characterKey: genshinAdapter.characters()[0].key,
      weaponKey: genshinAdapter.weapons()[0].key,
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
      topK: 3,
    };
    // The fallback blocks the thread, so the only honourable window is before
    // it starts — which is exactly when a superseding run cancels.
    const run = optimizeRun(req, inv);
    run.cancel();
    await expect(run.result).rejects.toSatisfy(isOptimizeCancelled);
  });

  it('cancelling the fallback after it has already resolved is a harmless no-op', async () => {
    const req: OptimizeRequest = {
      characterKey: genshinAdapter.characters()[0].key,
      weaponKey: genshinAdapter.weapons()[0].key,
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
      topK: 3,
    };
    const run = optimizeRun(req, inv);
    const r = await run.result;
    run.cancel();
    await expect(run.result).resolves.toEqual(r);
  });

  it('rejects (rather than hanging) when the fallback returns an error envelope', async () => {
    // Regression: the error envelope's throw used to escape *after* the
    // promise was marked settled, so nothing could ever resolve or reject it
    // and the UI sat on "Searching…" forever.
    vi.resetModules();
    vi.doMock('./protocol', async () => {
      const actual =
        await vi.importActual<typeof import('./protocol')>('./protocol');
      return {
        ...actual,
        runSearchRequest: () => ({ type: 'error', message: 'boom' }),
      };
    });
    try {
      const mod = await import('./optimizeClient');
      const req: OptimizeRequest = {
        characterKey: genshinAdapter.characters()[0].key,
        weaponKey: genshinAdapter.weapons()[0].key,
        buildLevel: 90,
        constraints: {},
        objective: 'crit_value',
        topK: 3,
      };
      await expect(mod.optimize(req, inv)).rejects.toThrow('boom');
    } finally {
      vi.doUnmock('./protocol');
      vi.resetModules();
    }
  });

  it('leaves an on-element goblet main stat untouched', async () => {
    const chars = genshinAdapter.characters();
    const character = chars[0];
    const goblet: Artifact = {
      id: 'goblet-on',
      setKey: 'A',
      slot: 'goblet',
      rarity: 5,
      level: 20,
      mainStat: 'elemental_dmg',
      mainStatValue: 46.6,
      subStats: [],
      element: character.element as Artifact['element'],
    };
    if (goblet.element === undefined) return; // character.element === 'physical': not testable here
    const req: OptimizeRequest = {
      characterKey: character.key,
      weaponKey: genshinAdapter.weapons()[0].key,
      buildLevel: 90,
      constraints: {},
      objective: 'elemental_dmg',
      topK: 1,
    };
    const withGoblet = [
      ...inv.filter((a) => a.slot !== 'goblet'),
      goblet,
      { ...goblet, id: 'goblet-on-2', mainStatValue: 0 },
    ];
    const r = await optimize(req, withGoblet);
    if (r.status !== 'ok') throw new Error('expected a feasible result');
    expect(r.builds[0].totals.elemental_dmg ?? 0).toBe(46.6);
  });
});

describe('optimize (real Worker path)', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Stub a Worker global so dispatch takes the real message-passing branch
  // (jsdom has no Worker). `react` drives the fake worker's response.
  function stubWorker(react: (self: FakeWorker) => void) {
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: { message: string }) => void) | null = null;
      onmessageerror: ((e: MessageEvent) => void) | null = null;
      terminated = false;
      postMessage() {
        queueMicrotask(() => react(this));
      }
      terminate() {
        this.terminated = true;
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
  }
  type FakeWorker = {
    onmessage: ((e: MessageEvent) => void) | null;
    onerror: ((e: { message: string }) => void) | null;
    onmessageerror: ((e: MessageEvent) => void) | null;
    terminated: boolean;
  };

  const req: OptimizeRequest = {
    characterKey: genshinAdapter.characters()[0].key,
    weaponKey: genshinAdapter.weapons()[0].key,
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
    topK: 3,
  };

  it("resolves with the worker's result on a done message", async () => {
    const result = {
      status: 'ok' as const,
      builds: [],
      explored: 1,
      pruned: 2,
    };
    stubWorker((w) =>
      w.onmessage?.({ data: { type: 'done', result } } as MessageEvent),
    );
    await expect(optimize(req, inv)).resolves.toEqual(result);
  });

  it('rejects when the worker posts an error response', async () => {
    stubWorker((w) =>
      w.onmessage?.({
        data: { type: 'error', message: 'boom' },
      } as MessageEvent),
    );
    await expect(optimize(req, inv)).rejects.toThrow('boom');
  });

  it('rejects on a worker onerror event', async () => {
    stubWorker((w) => w.onerror?.({ message: 'crash' }));
    await expect(optimize(req, inv)).rejects.toThrow('crash');
  });

  it('forwards progress messages to the callback without settling the run', async () => {
    const result = {
      status: 'ok' as const,
      builds: [],
      explored: 7,
      pruned: 3,
    };
    stubWorker((w) => {
      w.onmessage?.({
        data: { type: 'progress', explored: 5, pruned: 2 },
      } as MessageEvent);
      w.onmessage?.({ data: { type: 'done', result } } as MessageEvent);
    });
    const seen: unknown[] = [];
    const run = optimizeRun(req, inv, (p) => seen.push(p));
    await expect(run.result).resolves.toEqual(result);
    expect(seen).toEqual([{ type: 'progress', explored: 5, pruned: 2 }]);
  });

  it('cancel called synchronously, before the worker has posted anything, still terminates it', async () => {
    let worker!: FakeWorker;
    stubWorker((w) => {
      worker = w; // never responds: only cancel can end this run
    });
    const run = optimizeRun(req, inv);
    // No await here: the worker is created synchronously inside dispatch, but
    // its postMessage microtask hasn't had a turn yet — cancel must still win.
    run.cancel();
    await expect(run.result).rejects.toSatisfy(isOptimizeCancelled);
    expect(worker.terminated).toBe(true);
  });

  it('cancel terminates the worker and rejects with a cancellation', async () => {
    let worker!: FakeWorker;
    stubWorker((w) => {
      worker = w; // never responds: only cancel can end this run
    });
    const run = optimizeRun(req, inv);
    await Promise.resolve(); // let postMessage's microtask run
    run.cancel();
    await expect(run.result).rejects.toSatisfy(isOptimizeCancelled);
    expect(worker.terminated).toBe(true);
  });

  it('cancel after the run has settled is a harmless no-op', async () => {
    const result = {
      status: 'ok' as const,
      builds: [],
      explored: 1,
      pruned: 0,
    };
    stubWorker((w) =>
      w.onmessage?.({ data: { type: 'done', result } } as MessageEvent),
    );
    const run = optimizeRun(req, inv);
    await expect(run.result).resolves.toEqual(result);
    run.cancel();
    await expect(run.result).resolves.toEqual(result);
  });

  it('rejects and terminates on a worker onmessageerror event (structured-clone failure)', async () => {
    let worker!: FakeWorker;
    stubWorker((w) => {
      worker = w;
      w.onmessageerror?.({} as MessageEvent);
    });
    await expect(optimize(req, inv)).rejects.toThrow();
    expect(worker.terminated).toBe(true);
  });
});
