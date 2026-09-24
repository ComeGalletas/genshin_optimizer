import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOptimizeRun } from './useOptimizeRun';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { OptimizeCancelledError } from '../workers/optimizeClient';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import type {
  Artifact,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';

const { optimizeRun } = vi.hoisted(() => ({ optimizeRun: vi.fn() }));
// Only the dispatch is faked, exactly as App.test.tsx does: cancellation is
// still detected through the real `isOptimizeCancelled` predicate.
vi.mock('../workers/optimizeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workers/optimizeClient')>()),
  optimizeRun,
}));

function handleFor(result: Promise<OptimizeResult>) {
  return { result, cancel: vi.fn() };
}

const SAMPLE_ARTIFACTS: Artifact[] = SLOTS.map((slot) => ({
  id: `sample-${slot}`,
  setKey: 'EmblemOfSeveredFate',
  slot,
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 4780,
  subStats: [],
}));

describe('useOptimizeRun', () => {
  beforeEach(() => {
    optimizeRun.mockReset();
    useInventory.getState().clear();
    useInventory.getState().addMany(SAMPLE_ARTIFACTS);
    useOptimizeRequest.getState().reset();
  });

  it('does nothing when the inventory is empty', async () => {
    useInventory.getState().clear();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useOptimizeRun({ onSuccess }));

    await act(async () => {
      await result.current.runCurrent();
    });

    expect(optimizeRun).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it('runs, reports success, and announces the build count', async () => {
    const onSuccess = vi.fn();
    const onRunStart = vi.fn();
    const optResult: OptimizeResult = {
      status: 'ok',
      builds: [
        {
          artifactIds: Object.fromEntries(
            SLOTS.map((s) => [s, `sample-${s}`]),
          ) as Record<(typeof SLOTS)[number], string>,
          totals: { hp: 4780 },
          objectiveValue: 1,
          score: 1,
          diagnostics: {
            bindingConstraints: [],
            marginalBySlot: {},
            explored: 1,
            pruned: 0,
          },
        },
      ],
      explored: 1,
      pruned: 0,
    };
    optimizeRun.mockReturnValue(handleFor(Promise.resolve(optResult)));

    const { result } = renderHook(() =>
      useOptimizeRun({ onRunStart, onSuccess }),
    );

    await act(async () => {
      await result.current.runCurrent();
    });

    expect(onRunStart).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith(
      optResult,
      expect.objectContaining({ characterKey: expect.any(String) }),
    );
    expect(result.current.running).toBe(false);
    expect(result.current.optimizeError).toBe(false);
    expect(result.current.announcement?.text).toMatch(/1 build\./);
  });

  it('surfaces a genuine failure as an error, without calling onSuccess', async () => {
    const onSuccess = vi.fn();
    optimizeRun.mockReturnValue(
      handleFor(Promise.reject(new Error('worker exploded'))),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useOptimizeRun({ onSuccess }));
    await act(async () => {
      await result.current.runCurrent();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
    expect(result.current.optimizeError).toBe(true);
    expect(result.current.optimizeErrorDetail).toBe('worker exploded');
    errorSpy.mockRestore();
  });

  it('treats a cancellation as quiet — no error, just an announcement', async () => {
    const onSuccess = vi.fn();
    optimizeRun.mockReturnValue(
      handleFor(Promise.reject(new OptimizeCancelledError())),
    );

    const { result } = renderHook(() => useOptimizeRun({ onSuccess }));
    await act(async () => {
      await result.current.runCurrent();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.optimizeError).toBe(false);
    expect(result.current.announcement?.text).toBe('Optimisation cancelled.');
  });

  it('cancelCurrent stops the in-flight run', async () => {
    let reject!: (e: unknown) => void;
    const pending = new Promise<OptimizeResult>((_, rej) => (reject = rej));
    const cancel = vi.fn(() => reject(new OptimizeCancelledError()));
    optimizeRun.mockReturnValue({ result: pending, cancel });
    pending.catch(() => {});

    const { result } = renderHook(() => useOptimizeRun({ onSuccess: vi.fn() }));

    let running: Promise<void>;
    act(() => {
      running = result.current.runCurrent();
    });
    expect(result.current.running).toBe(true);

    act(() => {
      result.current.cancelCurrent();
    });
    await act(async () => {
      await running;
    });

    expect(cancel).toHaveBeenCalledOnce();
    expect(result.current.running).toBe(false);
  });

  it('lets only the most recently started run commit, cancelling the one it supersedes', async () => {
    let resolveA!: (r: OptimizeResult) => void;
    let resolveB!: (r: OptimizeResult) => void;
    const pendingA = new Promise<OptimizeResult>((r) => (resolveA = r));
    const pendingB = new Promise<OptimizeResult>((r) => (resolveB = r));
    const handleA = handleFor(pendingA);
    const handleB = handleFor(pendingB);
    optimizeRun.mockReturnValueOnce(handleA).mockReturnValueOnce(handleB);

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useOptimizeRun({ onSuccess }));

    let runA: Promise<void>;
    let runB: Promise<void>;
    act(() => {
      runA = result.current.runCurrent();
      runB = result.current.runCurrent();
    });
    expect(optimizeRun).toHaveBeenCalledTimes(2);
    expect(handleA.cancel).toHaveBeenCalledOnce();

    await act(async () => {
      resolveB({ status: 'ok', builds: [], explored: 2, pruned: 0 });
      await runB;
    });
    await act(async () => {
      resolveA({ status: 'ok', builds: [], explored: 1, pruned: 0 });
      await runA;
    });

    // Run A's late resolution must not call onSuccess a second time — its
    // token was superseded before it settled.
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ explored: 2 }),
      expect.anything(),
    );
  });
});
