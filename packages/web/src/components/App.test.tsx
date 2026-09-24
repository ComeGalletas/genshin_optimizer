import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import { App } from './App';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { useRoster } from '../state/roster';
import type {
  Artifact,
  BuildResult,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';
import { OptimizeCancelledError } from '../workers/optimizeClient';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';

const { optimizeRun } = vi.hoisted(() => ({ optimizeRun: vi.fn() }));
// Only the dispatch is faked: OptimizeCancelledError / isOptimizeCancelled stay
// real, so the cancel path is exercised through the same predicate App uses.
vi.mock('../workers/optimizeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workers/optimizeClient')>()),
  optimizeRun,
}));

/** The shape `optimizeRun` returns: a promise plus the abort handle. */
function handleFor(result: Promise<OptimizeResult>) {
  return { result, cancel: vi.fn() };
}

describe('App shell', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
    window.history.pushState({}, '', '/');
  });

  it('shows the empty-state import choices on first load', () => {
    render(<App />);
    expect(screen.getByText(/Upload GOOD export/i)).toBeInTheDocument();
    expect(screen.getByText(/Import by UID/i)).toBeInTheDocument();
  });

  it('shows a friendly fallback for an unreadable shared link', async () => {
    window.history.pushState({}, '', '/?b=garbage!!');
    render(<App />);
    // The persistent role="alert" region announces the short form; this is
    // the visible Callout's longer one.
    expect(
      await screen.findByText(/it may be from a newer version/i),
    ).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });
});

describe('App — overlapping optimise runs', () => {
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

  function makeResult(tag: number): OptimizeResult {
    const build: BuildResult = {
      artifactIds: Object.fromEntries(
        SLOTS.map((s) => [s, `sample-${s}`]),
      ) as Record<(typeof SLOTS)[number], string>,
      totals: { hp: 4780 },
      objectiveValue: tag,
      score: tag,
      diagnostics: {
        bindingConstraints: [],
        marginalBySlot: {},
        explored: tag,
        pruned: 0,
      },
    };
    return { status: 'ok', builds: [build], explored: tag, pruned: 0 };
  }

  beforeEach(() => {
    optimizeRun.mockReset();
    useInventory.getState().clear();
    useInventory.getState().addMany(SAMPLE_ARTIFACTS);
    useOptimizeRequest.getState().reset();
    window.history.pushState({}, '', '/');
  });

  it('does not let a stale run overwrite a newer one, even when both fire before either commits', async () => {
    // Two deferred, independently-resolvable optimizeRun() calls.
    let resolveA!: (r: OptimizeResult) => void;
    let resolveB!: (r: OptimizeResult) => void;
    const pendingA = new Promise<OptimizeResult>((r) => (resolveA = r));
    const pendingB = new Promise<OptimizeResult>((r) => (resolveB = r));
    optimizeRun
      .mockReturnValueOnce(handleFor(pendingA))
      .mockReturnValueOnce(handleFor(pendingB));

    render(<App />);
    const optimiseBtn = screen.getByRole('button', { name: /^optimise$/i });
    const sampleBtn = screen.getByRole('button', { name: /^furina$/i });

    // Fire both triggers inside a single act() batch, before React commits
    // run A's `running=true` (and therefore before any disabled attribute
    // reaches the DOM) — the same-tick double-trigger a fast click or a
    // future programmatic caller could produce, independent of the
    // disabled-button mitigation.
    act(() => {
      optimiseBtn.click();
      sampleBtn.click();
    });
    expect(optimizeRun).toHaveBeenCalledTimes(2);

    // Run B (started second) resolves first...
    await act(async () => {
      resolveB(makeResult(222));
      await pendingB;
    });
    expect(
      screen.getByText(/before the optimum was proven/i),
    ).toHaveTextContent('222');

    // ...then run A (started first) resolves late. Its stale result must
    // NOT clobber B's, which is the one the user is now looking at.
    await act(async () => {
      resolveA(makeResult(111));
      await pendingA;
    });
    expect(
      screen.getByText(/before the optimum was proven/i),
    ).toHaveTextContent('222');
  });
});

describe('App — optimise progress and cancel', () => {
  const SAMPLE_ARTIFACTS: Artifact[] = SLOTS.map((slot) => ({
    id: `cancel-${slot}`,
    setKey: 'EmblemOfSeveredFate',
    slot,
    rarity: 5,
    level: 20,
    mainStat: 'hp',
    mainStatValue: 4780,
    subStats: [],
  }));

  beforeEach(() => {
    optimizeRun.mockReset();
    useInventory.getState().clear();
    useInventory.getState().addMany(SAMPLE_ARTIFACTS);
    useOptimizeRequest.getState().reset();
    window.history.pushState({}, '', '/');
  });

  /** A run that never settles on its own — cancel is the only way out. */
  function pendingRun() {
    let reject!: (e: unknown) => void;
    const result = new Promise<OptimizeResult>((_, rej) => (reject = rej));
    const cancel = vi.fn(() => reject(new OptimizeCancelledError()));
    optimizeRun.mockReturnValue({ result, cancel });
    // Callers that need two distinct runs re-point the mock themselves.
    // Nothing awaits `result` but App; keep Node quiet if the test ends first.
    result.catch(() => {});
    return { result, cancel };
  }

  it('shows live progress counters and a Cancel button while a run is in flight', async () => {
    pendingRun();
    render(<App />);
    act(() => {
      screen.getByRole('button', { name: /^optimise$/i }).click();
    });

    // The progress line (and Cancel) appears after the ~300ms min-duration guard.
    expect(
      await screen.findByRole('button', { name: /^cancel$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/leaves evaluated/i)).toBeInTheDocument();

    // The progress callback App handed to optimizeRun drives the counters.
    const onProgress = optimizeRun.mock.calls[0][2] as (p: {
      explored: number;
      pruned: number;
    }) => void;
    act(() => onProgress({ explored: 1234, pruned: 99 }));
    // findBy, not getBy: the progress line subscribes to the store in a
    // passive effect. When its mount commit is slow (a loaded CI machine),
    // React runs that effect after the test resumes, so the report above can
    // land before the subscription; React then re-renders on subscribe. A
    // synchronous getBy failed intermittently on exactly that window.
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('cancelling clears the busy state, shows no error, and announces it', async () => {
    const { cancel, result } = pendingRun();
    render(<App />);
    act(() => {
      screen.getByRole('button', { name: /^optimise$/i }).click();
    });
    const optimiseBtn = screen.getByRole('button', { name: /searching/i });
    expect(optimiseBtn).toHaveAttribute('aria-busy', 'true');

    // The progress line (and Cancel) appears after the ~300ms min-duration guard.
    const cancelBtn = await screen.findByRole('button', { name: /^cancel$/i });
    await act(async () => {
      cancelBtn.click();
      await result.catch(() => {});
    });

    expect(cancel).toHaveBeenCalled();
    // Back to idle: the run button reads "Optimise" and the progress line is gone.
    expect(screen.getByRole('button', { name: /^optimise$/i })).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
    // A deliberate stop is not a failure: the error Callout never appears.
    expect(screen.queryByText(/Optimisation failed/i)).toBeNull();
    expect(screen.getByText('Optimisation cancelled.')).toBeInTheDocument();
  });

  it('starting a new run cancels the one it supersedes', () => {
    const first = pendingRun();
    const second = pendingRun();
    optimizeRun
      .mockReset()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    render(<App />);
    const optimiseBtn = screen.getByRole('button', { name: /^optimise$/i });
    // Same-tick double trigger, as in the stale-result test above: the second
    // click runs against the same render closure, before `running` has
    // reached the DOM to block it.
    act(() => {
      optimiseBtn.click();
      optimiseBtn.click();
    });

    expect(optimizeRun).toHaveBeenCalledTimes(2);
    // The superseded run's worker is stopped rather than left burning a core.
    expect(first.cancel).toHaveBeenCalled();
    expect(second.cancel).not.toHaveBeenCalled();
  });
});

describe('App — step nav', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useRoster.getState().clear();
  });
  afterEach(() => {
    useRoster.getState().clear();
    // One test stubs IntersectionObserver; restore it here so a failure
    // inside that test can't leak the stub into the rest of the file.
    vi.unstubAllGlobals();
  });

  it('renders a sticky step nav with anchors when a roster exists', () => {
    useRoster.getState().setRoster({ amber: { level: 90 } });
    render(<App />);
    const nav = screen.getByRole('navigation', { name: /steps/i });
    ['Load', 'Roster', 'Teams', 'Plan', 'Optimise'].forEach((label) =>
      expect(
        within(nav).getByRole('link', { name: new RegExp(label, 'i') }),
      ).toBeInTheDocument(),
    );
  });

  it('shows the step nav before an import, with the roster steps locked', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: /steps/i });
    // Load and Optimise exist without a roster, so the nav has somewhere to go.
    expect(
      within(nav).getByRole('link', { name: /load/i }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: /optimise/i }),
    ).toBeInTheDocument();
    // Roster/Teams/Plan are real disabled buttons, not links: there is
    // nothing to scroll to. The step name has to survive into the accessible
    // name, and the "why" has to be exposed as a description rather than a
    // mouse-only `title`.
    const locked = within(nav).getAllByRole('button');
    expect(locked).toHaveLength(3);
    for (const chip of locked)
      expect(chip).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(nav).getByRole('button', { name: /roster/i }),
    ).toHaveAccessibleDescription(/unlock this step/i);
    expect(within(nav).queryByRole('link', { name: /roster/i })).toBeNull();
  });

  it('leaves Results out of the numbered steps', () => {
    useRoster.getState().setRoster({ amber: { level: 90 } });
    render(<App />);
    const nav = screen.getByRole('navigation', { name: /steps/i });
    expect(
      within(nav).getByRole('link', { name: /optimise/i }),
    ).toHaveTextContent('05');
    // No results yet, so no Results chip at all — and when there is one it
    // carries no number.
    expect(within(nav).queryByText('06')).toBeNull();
  });

  it('marks the section in view with aria-current, topmost first', () => {
    // jsdom has no IntersectionObserver, and a real browser only runs one on
    // a visible page — so drive the callback directly.
    type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void;
    const callbacks: Cb[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Cb) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    // Restored in afterEach below rather than at the end of the test body: an
    // assertion failure above would otherwise leave the stub installed for
    // every later test in the file.
    useRoster.getState().setRoster({ amber: { level: 90 } });
    render(<App />);
    const nav = screen.getByRole('navigation', { name: /steps/i });
    const fire = (...entries: Partial<IntersectionObserverEntry>[]) =>
      act(() => callbacks[callbacks.length - 1](entries));

    fire({
      isIntersecting: true,
      target: document.getElementById('step-teams')!,
    });
    expect(within(nav).getByRole('link', { name: /teams/i })).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Two sections straddling the band: the earlier one in page order wins,
    // because aria-current needs exactly one answer.
    fire({
      isIntersecting: true,
      target: document.getElementById('step-roster')!,
    });
    expect(within(nav).getByRole('link', { name: /roster/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      within(nav).getByRole('link', { name: /teams/i }),
    ).not.toHaveAttribute('aria-current');
  });
});

describe('App — roster-aware default selection', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
    useRoster.getState().clear();
    window.history.pushState({}, '', '/');
  });
  afterEach(() => useRoster.getState().clear());

  it('opens on the curated marquee pair with no roster', () => {
    render(<App />);
    expect(useOptimizeRequest.getState().characterKey).toBe('furina');
  });

  it('switches to the best-built rostered character once a roster loads', () => {
    useRoster.getState().setRoster({
      amber: { buildLevel: 20 },
      raiden_shogun: { weaponKey: 'engulfing_lightning', buildLevel: 90 },
    });
    render(<App />);
    const s = useOptimizeRequest.getState();
    expect(s.characterKey).toBe('raiden_shogun');
    expect(s.weaponKey).toBe('engulfing_lightning');
  });

  it('never lets a roster weapon the snapshot does not carry reach the store', () => {
    // Hydration sets only the character; `setCharacterKey` resolves the
    // weapon through `legalWeapon`, which rejects unresolvable keys — so a
    // roster naming a weapon this snapshot lacks can't poison the request.
    useRoster.getState().setRoster({
      raiden_shogun: { weaponKey: 'not_a_real_weapon', buildLevel: 90 },
    });
    render(<App />);
    const s = useOptimizeRequest.getState();
    expect(s.characterKey).toBe('raiden_shogun');
    expect(s.weaponKey).not.toBe('not_a_real_weapon');
    expect(genshinAdapter.weapon(s.weaponKey)).toBeTruthy();
    expect(genshinAdapter.canEquip('raiden_shogun', s.weaponKey)).toBe(true);
  });

  it('never overwrites a selection the reader already made', () => {
    useOptimizeRequest.getState().setCharacterKey('navia');
    useRoster.getState().setRoster({
      raiden_shogun: { weaponKey: 'engulfing_lightning', buildLevel: 90 },
    });
    render(<App />);
    expect(useOptimizeRequest.getState().characterKey).toBe('navia');
  });
});

describe('App — relaxing an infeasible constraint', () => {
  const ARTIFACTS: Artifact[] = SLOTS.map((slot) => ({
    id: `relax-${slot}`,
    setKey: 'EmblemOfSeveredFate',
    slot,
    rarity: 5,
    level: 20,
    mainStat: 'hp',
    mainStatValue: 4780,
    subStats: [],
  }));

  beforeEach(() => {
    optimizeRun.mockReset();
    useInventory.getState().clear();
    useInventory.getState().addMany(ARTIFACTS);
    useOptimizeRequest.getState().reset();
    useRoster.getState().clear();
    window.history.pushState({}, '', '/');
  });
  afterEach(() => useRoster.getState().clear());

  it('lowers the ER floor and re-runs from the Results relax button', async () => {
    // None of these pieces carry ER, so a 999% floor is unsatisfiable.
    useOptimizeRequest.getState().setMinER('999');
    const infeasible: OptimizeResult = {
      status: 'infeasible',
      explored: 0,
      pruned: 0,
    };
    optimizeRun.mockReturnValue(handleFor(Promise.resolve(infeasible)));

    render(<App />);
    await act(async () => {
      screen.getByRole('button', { name: /^optimise$/i }).click();
    });
    expect(optimizeRun).toHaveBeenCalledTimes(1);

    const relax = screen.getByRole('button', { name: /^relax .* to /i });
    await act(async () => {
      relax.click();
    });

    // The offer is only honest if pressing it actually re-runs the search.
    expect(optimizeRun).toHaveBeenCalledTimes(2);
    const floor = useOptimizeRequest.getState().constraints.minStats?.er_pct;
    expect(floor).toBeLessThan(999);
  });
});
