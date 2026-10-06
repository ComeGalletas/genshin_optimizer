import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import { App } from './App';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { useRoster } from '../state/roster';
import { useServer } from '../local-server/status';
import { useAccount } from '../state/account';
import { useSettings } from '../state/settings';
import type {
  Artifact,
  BuildResult,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';
import { OptimizeCancelledError } from '../workers/optimizeClient';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import {
  genshinAdapter,
  GAME_VERSION,
  GENSHIN_DB_VERSION,
  SNAPSHOT_DATE,
} from '@genshin-build-lab/engine/game/genshin/adapter';
import { CURATION_PATCH } from '@genshin-build-lab/engine/curation';

const { optimizeRun } = vi.hoisted(() => ({ optimizeRun: vi.fn() }));
// Only the dispatch is faked: OptimizeCancelledError / isOptimizeCancelled stay
// real, so the cancel path is exercised through the same predicate App uses.
vi.mock('../workers/optimizeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workers/optimizeClient')>()),
  optimizeRun,
}));

/** The Optimise button, once its lazy view has loaded: under the full
 *  suite's parallel load that can take longer than the default second. */
const findOptimise = () =>
  screen.findByRole('button', { name: /^optimise$/i }, { timeout: 5000 });

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

  it('names the snapshot versions and the curation patch in the footer', () => {
    render(<App />);
    // Read from the engine's exports, so a data bump never needs this test
    // touched; what it pins is that the footer shows all four.
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(`genshin-db ${GENSHIN_DB_VERSION}`);
    expect(footer).toHaveTextContent(`released ${SNAPSHOT_DATE}`);
    expect(footer).toHaveTextContent(`game version ${GAME_VERSION}`);
    expect(footer).toHaveTextContent(`Curated tables: patch ${CURATION_PATCH}`);
    expect(within(footer).getByText(SNAPSHOT_DATE)).toHaveAttribute(
      'datetime',
      SNAPSHOT_DATE,
    );
  });

  // Server-only (TODO 6.2): gcsim runs on the local server.
  it('offers Compare Teams only while the local server runs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: !url.endsWith('/llm'),
        status: url.endsWith('/llm') ? 404 : 200,
        json: async () =>
          url.endsWith('/health')
            ? { ok: true, gameVersion: GAME_VERSION }
            : url.endsWith('/rotations')
              ? { rotations: [] }
              : {},
      })),
    );
    window.history.pushState({}, '', '/#/simulate');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Compare Teams' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Simulate/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // The server stops: the view says what it needs, and the menu drops it.
    act(() => useServer.setState({ status: 'offline', llm: null }));
    expect(
      screen.queryByRole('heading', { name: 'Compare Teams' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('needs-data')).toHaveTextContent(
      'Simulating needs the local server.',
    );
    expect(screen.queryByRole('link', { name: /Simulate/ })).toBeNull();
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
    useServer.setState({ status: 'checking', llm: null });
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
    // The Optimise view is a lazy chunk (ADR-0053).
    const optimiseBtn = await findOptimise();

    // Fire both triggers inside a single act() batch, before React commits
    // run A's `running=true` (and therefore before any disabled attribute
    // reaches the DOM) — the same-tick double-trigger a fast click or a
    // future programmatic caller could produce, independent of the
    // disabled-button mitigation.
    act(() => {
      optimiseBtn.click();
      optimiseBtn.click();
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
    const run = await findOptimise();
    act(() => {
      run.click();
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
    const run = await findOptimise();
    act(() => {
      run.click();
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

  it('starting a new run cancels the one it supersedes', async () => {
    const first = pendingRun();
    const second = pendingRun();
    optimizeRun
      .mockReset()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    render(<App />);
    // The Optimise view is a lazy chunk (ADR-0053).
    const optimiseBtn = await findOptimise();
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

describe('App — views (TODO 9.3–9.5)', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useRoster.getState().clear();
    useAccount.getState().clear();
    window.history.pushState({}, '', '/');
  });
  afterEach(() => {
    useRoster.getState().clear();
    useAccount.getState().clear();
    window.history.pushState({}, '', '/');
  });

  it('opens empty on Start, with every view in the menu and none locked', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Load Data' })).toBeVisible();
    expect(screen.getByTestId('account-bar')).toHaveTextContent(
      'Nothing loaded yet.',
    );
    // No demo or tutorial content until asked for.
    expect(screen.queryByText(/Try a Sample Build/i)).toBeNull();
    expect(screen.queryByText(/demo inventory/i)).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Views' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Roster', '#/roster'],
      ['Teams', '#/teams'],
      ['Plan', '#/plan'],
      ['Optimise', '#/optimise'],
    ]);
    expect(within(nav).queryAllByRole('button')).toEqual([]);
  });

  it('offers help beside the Start view and each of its three choices (TODO 9.6)', () => {
    render(<App />);
    expect(
      screen
        .getAllByRole('button', { name: /^Help: / })
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Help: Loading data',
      'Help: Demo data',
      'Help: Your account from the local server',
      'Help: A new source',
    ]);
  });

  it('says what a view needs, with one way to load it', () => {
    window.history.pushState({}, '', '/#/teams');
    render(<App />);
    const needs = screen.getByTestId('needs-data');
    expect(needs).toHaveTextContent('Teams needs a roster.');
    expect(
      within(needs).getByRole('link', { name: 'Load Data' }),
    ).toHaveAttribute('href', '#/start');
    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens on the roster once one is loaded, shows the account bar, and follows the address', async () => {
    useRoster.getState().setRoster({ amber: { level: 90 } });
    useInventory.getState().addMany(
      SLOTS.map((slot) => ({
        id: `v-${slot}`,
        setKey: 'EmblemOfSeveredFate',
        slot,
        rarity: 5,
        level: 20,
        mainStat: 'hp',
        mainStatValue: 4780,
        subStats: [],
      })),
    );
    useAccount.getState().setSource({ kind: 'file', name: 'export.json' });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Your Roster' }),
    ).toBeVisible();
    const bar = screen.getByTestId('account-bar');
    expect(bar).toHaveTextContent(
      /^5 artifacts · 1 character · from export\.json, \d{4}-\d{2}-\d{2}Change$/,
    );
    expect(within(bar).getByRole('link', { name: 'Change' })).toHaveAttribute(
      'href',
      '#/start',
    );
    act(() => {
      window.location.hash = '/plan';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(
      await screen.findByRole('heading', { name: 'Your Plan' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Your Roster' })).toBeNull();
  });
});

describe('App — the shell’s smaller parts (TODO 9.3–9.5)', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useRoster.getState().clear();
    useAccount.getState().clear();
    window.history.pushState({}, '', '/');
  });
  afterEach(() => {
    useRoster.getState().clear();
    useAccount.getState().clear();
    useSettings.setState({ showArt: true });
    window.history.pushState({}, '', '/');
  });

  it('shows the last load’s confirmation on the next view, until dismissed', () => {
    useRoster.getState().setRoster({ amber: { level: 90 } });
    useAccount.getState().setLoaded('Loaded the demo data: 76 artifacts.');
    render(<App />);
    // Shown, and announced from a region that stays mounted.
    expect(
      screen.getAllByText('Loaded the demo data: 76 artifacts.'),
    ).toHaveLength(2);
    act(() => {
      screen.getByRole('button', { name: 'Dismiss' }).click();
    });
    expect(
      screen.queryAllByText('Loaded the demo data: 76 artifacts.'),
    ).toHaveLength(0);
  });

  it('turns game art off from the footer, and skips to the content', () => {
    render(<App />);
    const art = screen.getByRole('checkbox', { name: /Show game art/ });
    expect(art).toBeChecked();
    act(() => art.click());
    expect(useSettings.getState().showArt).toBe(false);
    act(() => screen.getByRole('link', { name: 'Skip to Content' }).click());
    expect(document.activeElement).toBe(document.getElementById('content'));
    // The skip link isn't read as a view address.
    expect(window.location.hash).toBe('');
  });

  it('says the server views need the server when it isn’t running', () => {
    window.history.pushState({}, '', '/#/imports');
    render(<App />);
    expect(screen.getByTestId('needs-data')).toHaveTextContent(
      'The import center needs the local server.',
    );
    expect(screen.getByText(/npm run server/)).toBeInTheDocument();
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
    const run = await findOptimise();
    await act(async () => {
      run.click();
    });
    expect(optimizeRun).toHaveBeenCalledTimes(1);

    const relax = await screen.findByRole('button', {
      name: /^relax .* to /i,
    });
    await act(async () => {
      relax.click();
    });

    // The offer is only honest if pressing it actually re-runs the search.
    expect(optimizeRun).toHaveBeenCalledTimes(2);
    const floor = useOptimizeRequest.getState().constraints.minStats?.er_pct;
    expect(floor).toBeLessThan(999);
  });
});
