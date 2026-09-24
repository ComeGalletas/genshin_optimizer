import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { OptimizePanel } from './OptimizePanel';
import { searchProgressStore } from './searchProgress';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { useInventory } from '../state/inventory';
import { useRoster } from '../state/roster';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { currentRequest } from '../state/optimizeRequest';

describe('OptimizePanel', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
  });

  it('renders no progress line while idle', () => {
    render(
      <OptimizePanel onRun={vi.fn()} running={false} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
    expect(screen.queryByText(/leaves evaluated/i)).toBeNull();
  });

  it('renders the progress line with counters, elapsed time and Cancel while running', () => {
    vi.useFakeTimers();
    try {
      searchProgressStore.start();
      render(<OptimizePanel onRun={vi.fn()} running onCancel={vi.fn()} />);
      act(() => {
        searchProgressStore.report({ explored: 12345, pruned: 678 });
        // A whole number of the store's 200ms ticks, so the displayed
        // elapsed is exactly the time advanced.
        vi.advanceTimersByTime(2400);
      });
      expect(screen.getByText('12,345')).toBeInTheDocument();
      expect(screen.getByText('678')).toBeInTheDocument();
      expect(screen.getByText('2.4s')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^cancel$/i }),
      ).toBeInTheDocument();
    } finally {
      searchProgressStore.stop();
      vi.useRealTimers();
    }
  });

  it('shows zeroes before the first progress tick rather than nothing', async () => {
    searchProgressStore.start();
    try {
      render(<OptimizePanel onRun={vi.fn()} running onCancel={vi.fn()} />);
      // The progress line only appears after the ~300ms min-duration guard,
      // by which point the real clock has ticked past 0 — assert the counters
      // (which start at zero and only move on a reported tick) instead of the
      // elapsed clock.
      await waitFor(() => {
        expect(screen.getAllByText('0').length).toBeGreaterThan(0);
      });
    } finally {
      searchProgressStore.stop();
    }
  });

  it('restarts the clock when a second run supersedes the first', () => {
    vi.useFakeTimers();
    try {
      searchProgressStore.start();
      render(<OptimizePanel onRun={vi.fn()} running onCancel={vi.fn()} />);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText('3.0s')).toBeInTheDocument();
      // The superseding run: elapsed is its own, not the previous run's.
      act(() => {
        searchProgressStore.start();
      });
      expect(screen.getByText('0.0s')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByText('0.6s')).toBeInTheDocument();
    } finally {
      searchProgressStore.stop();
      vi.useRealTimers();
    }
  });

  it('calls onCancel from the Cancel button', async () => {
    const onCancel = vi.fn();
    render(<OptimizePanel onRun={vi.fn()} running onCancel={onCancel} />);
    // The progress line (and its Cancel button) only appears after the
    // ~300ms min-duration guard.
    const cancel = await screen.findByRole('button', { name: /^cancel$/i });
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // Cancel exists only while a run is in flight, and `onCancel` is a required
  // prop — so it is never rendered in a state where pressing it does nothing.
  it('renders Cancel as a live, enabled button while running', async () => {
    const onCancel = vi.fn();
    render(<OptimizePanel onRun={vi.fn()} running onCancel={onCancel} />);
    const cancel = await screen.findByRole('button', { name: /^cancel$/i });
    expect(cancel).not.toBeDisabled();
    expect(cancel).not.toHaveAttribute('aria-disabled');
  });

  // aria-disabled, not `disabled`: going disabled mid-run drops focus to
  // <body>. The guard is an early return in the click handler.
  it('blocks Optimise with a hint when no artifacts exist', async () => {
    const onRun = vi.fn();
    render(<OptimizePanel onRun={onRun} running={false} onCancel={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Optimise/i });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(btn);
    expect(onRun).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Add or import artifacts before optimising\./i),
    ).toBeInTheDocument();
  });

  it('enables Optimise once a character is chosen and artifacts exist', () => {
    useInventory.getState().add({
      id: 'a',
      setKey: 'A',
      slot: 'flower',
      rarity: 5,
      level: 20,
      mainStat: 'hp',
      mainStatValue: 1,
      subStats: [],
    });
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Optimise/i })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });
});

function addFlower() {
  useInventory.getState().add({
    id: 'a',
    setKey: 'A',
    slot: 'flower',
    rarity: 5,
    level: 20,
    mainStat: 'hp',
    mainStatValue: 1,
    subStats: [],
  });
}

describe('OptimizePanel meta prefill', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
  });

  it('shows "Use meta build" for a character with a meta recipe', () => {
    addFlower();
    useOptimizeRequest.getState().setCharacterKey('furina');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: /Use meta build/i }),
    ).toBeInTheDocument();
  });

  it('hides "Use meta build" for a character without a meta recipe', () => {
    useOptimizeRequest.getState().setCharacterKey('zzz_not_meta');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(
      screen.queryByRole('button', { name: /Use meta build/i }),
    ).toBeNull();
  });

  it('clicking "Use meta build" applies the meta constraints and runs', async () => {
    addFlower();
    useOptimizeRequest.getState().setCharacterKey('navia');
    const onRun = vi.fn();
    render(<OptimizePanel onRun={onRun} running={false} onCancel={vi.fn()} />);
    await userEvent.click(
      screen.getByRole('button', { name: /Use meta build/i }),
    );
    const c = currentRequest(useOptimizeRequest.getState()).constraints;
    expect(c.setRequirement).toEqual({
      kind: '4pc',
      setKey: 'NighttimeWhispersInTheEchoingWoods',
    });
    expect(onRun).toHaveBeenCalled();
  });

  it('shows a read-only summary of the meta recipe, including statTargets', () => {
    addFlower();
    useOptimizeRequest.getState().setCharacterKey('xiao');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(
      screen.getByText(/4-piece Vermillion Hereafter/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ER target 120%/i)).toBeInTheDocument();
    expect(screen.getByText(/CRIT Rate 70%/i)).toBeInTheDocument();
    const sourceLinks = screen.getAllByRole('link', { name: /Source/i });
    expect(
      sourceLinks.some(
        (a) => a.getAttribute('href') === 'https://keqingmains.com/xiao/',
      ),
    ).toBe(true);
  });

  it('omits the summary for a character without a meta recipe', () => {
    useOptimizeRequest.getState().setCharacterKey('zzz_not_meta');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('link', { name: /Source/i })).toBeNull();
  });

  it('marks the character\'s meta objective as "(Recommended)" in the Maximise dropdown', () => {
    // kaedehara_kazuha's meta objective is 'em', not the common 'crit_value'.
    useOptimizeRequest.getState().setCharacterKey('kaedehara_kazuha');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    const select = screen.getByRole('combobox', { name: /Maximise/i });
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[];
    const em = options.find((o) => o.value === 'em')!;
    const critValue = options.find((o) => o.value === 'crit_value')!;
    expect(em.textContent).toMatch(/\(Recommended\)/);
    expect(critValue.textContent).not.toMatch(/Recommended/);
  });

  it('marks no objective as recommended for a character without a meta recipe', () => {
    useOptimizeRequest.getState().setCharacterKey('zzz_not_meta');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    const select = screen.getByRole('combobox', { name: /Maximise/i });
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[];
    expect(options.some((o) => /Recommended/.test(o.textContent ?? ''))).toBe(
      false,
    );
  });
});

describe('OptimizePanel teammates', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
  });

  it('shows "Works well with" recs for a covered character', () => {
    useOptimizeRequest.getState().setCharacterKey('xiao');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(/Works well with/i)).toBeInTheDocument();
    expect(screen.getByText(/Faruzan/)).toBeInTheDocument();
  });

  it('omits the teammates section for a character without recs', () => {
    useOptimizeRequest.getState().setCharacterKey('zzz_not_meta');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(screen.queryByText(/Works well with/i)).toBeNull();
  });
});

describe('OptimizePanel roster prefill (ADR-0015)', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
    useRoster.getState().clear();
  });

  it('selecting a rostered character auto-fills its equipped weapon and build level', async () => {
    useRoster.getState().setRoster({
      raiden_shogun: { weaponKey: 'the_catch', buildLevel: 90 },
    });
    const user = userEvent.setup();
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );

    // The trigger opens on the curated marquee default (Furina), not on
    // whatever the dataset happens to sort first.
    await user.click(screen.getByRole('combobox', { name: 'Character' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Character' }),
      'Raiden Shogun',
    );
    await user.click(screen.getByText(/Raiden Shogun/i));

    expect(useOptimizeRequest.getState().characterKey).toBe('raiden_shogun');
    expect(useOptimizeRequest.getState().weaponKey).toBe('the_catch');
    expect(useOptimizeRequest.getState().buildLevel).toBe(90);
    expect(screen.getByRole('combobox', { name: 'Weapon' })).toHaveTextContent(
      /The Catch/i,
    );
  });

  it('a manual weapon override after roster auto-fill is not clobbered by a re-render', async () => {
    useRoster.getState().setRoster({
      raiden_shogun: { weaponKey: 'the_catch', buildLevel: 90 },
    });
    const user = userEvent.setup();
    const { rerender } = render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Character' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Character' }),
      'Raiden Shogun',
    );
    await user.click(screen.getByText(/Raiden Shogun/i));
    expect(useOptimizeRequest.getState().weaponKey).toBe('the_catch');

    // Manually override the auto-filled weapon.
    await user.click(screen.getByRole('combobox', { name: 'Weapon' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Weapon' }),
      'Engulfing Lightning',
    );
    await user.click(screen.getByText(/Engulfing Lightning/i));
    expect(useOptimizeRequest.getState().weaponKey).toBe('engulfing_lightning');

    // An unrelated re-render must not revert the manual override.
    rerender(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    expect(useOptimizeRequest.getState().weaponKey).toBe('engulfing_lightning');
    expect(screen.getByRole('combobox', { name: 'Weapon' })).toHaveTextContent(
      /Engulfing Lightning/i,
    );
  });

  it('sorts owned characters first with an "Owned" marker', async () => {
    useRoster.getState().setRoster({ raiden_shogun: { buildLevel: 90 } });
    const user = userEvent.setup();
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Character' }));
    const items = screen.getAllByRole('option');
    expect(items[0]).toHaveTextContent(/Raiden Shogun.*Owned/i);
  });

  it('leaves the character list unchanged when the roster is empty', async () => {
    const user = userEvent.setup();
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Character' }));
    const items = screen.getAllByRole('option');
    expect(items[0]).toHaveTextContent('Aino');
    expect(items[0]).not.toHaveTextContent('Owned');
  });

  it("disables build levels below a rostered character's achieved level", () => {
    useRoster.getState().setRoster({ raiden_shogun: { buildLevel: 90 } });
    useOptimizeRequest.getState().setCharacterKey('raiden_shogun');
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );

    const select = screen.getByRole('combobox', { name: /Build level/i });
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[];
    const lv20 = options.find((o) => o.value === '20')!;
    const lv90 = options.find((o) => o.value === '90')!;
    expect(lv20.disabled).toBe(true);
    expect(lv20.textContent).toMatch(/already achieved/i);
    expect(lv90.disabled).toBe(false);
    expect(lv90.textContent).not.toMatch(/already achieved/i);
  });

  it('does not disable any build level for an unrostered character', () => {
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    const select = screen.getByRole('combobox', { name: /Build level/i });
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[];
    expect(options.every((o) => !o.disabled)).toBe(true);
  });
});

describe('avg_damage objective', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
    addFlower();
  });

  it('offers Average damage only for characters with a damage profile', async () => {
    const user = userEvent.setup();
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    const maximise = screen.getByLabelText(/Maximise/i);

    act(() => useOptimizeRequest.getState().setCharacterKey('neuvillette'));
    expect(
      within(maximise).queryByRole('option', { name: /Average damage/i }),
    ).toBeInTheDocument();

    // Selecting it pre-fills the profile's ER floor.
    await user.selectOptions(maximise, 'avg_damage');
    expect(useOptimizeRequest.getState().objective).toBe('avg_damage');
    expect(useOptimizeRequest.getState().constraints.minStats?.er_pct).toBe(
      110,
    );

    // A profileless character both hides the option and drops the selection,
    // so the request can never ask for damage the engine has no profile for.
    act(() => useOptimizeRequest.getState().setCharacterKey('amber'));
    expect(
      within(maximise).queryByRole('option', { name: /Average damage/i }),
    ).not.toBeInTheDocument();
    expect(useOptimizeRequest.getState().objective).not.toBe('avg_damage');
  });
});

describe('OptimizePanel weapon typing', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
    useRoster.getState().clear();
  });

  it('offers only weapons the selected character can equip', async () => {
    const user = userEvent.setup();
    // Nahida is a catalyst user; The Catch is a polearm.
    act(() => useOptimizeRequest.getState().setCharacterKey('nahida'));
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Weapon' }));
    const values = within(screen.getByRole('listbox', { name: 'Weapon' }))
      .getAllByRole('option')
      .map((o) => o.textContent ?? '');
    expect(values.length).toBeGreaterThan(0);
    expect(values.some((v) => /A Thousand Floating Dreams/.test(v))).toBe(true);
    expect(values.some((v) => /The Catch/.test(v))).toBe(false);
    expect(values.some((v) => /Aquila Favonia/.test(v))).toBe(false);
    // Every listed weapon really is a catalyst.
    for (const w of genshinAdapter.weapons()) {
      if (!values.some((v) => v.startsWith(w.name))) continue;
      expect(w.type, `${w.name} listed for a catalyst user`).toBe('catalyst');
    }
  });

  it('re-picks a legal weapon when the character changes to another class', async () => {
    const user = userEvent.setup();
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    // The default pair is a sword user with a sword.
    expect(
      genshinAdapter.weapon(useOptimizeRequest.getState().weaponKey)?.type,
    ).toBe('sword');

    await user.click(screen.getByRole('combobox', { name: 'Character' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Character' }),
      'Nahida',
    );
    await user.click(screen.getByText(/^Nahida(\s\(.*\))?$/));

    const after = useOptimizeRequest.getState();
    expect(after.characterKey).toBe('nahida');
    expect(genshinAdapter.canEquip('nahida', after.weaponKey)).toBe(true);
  });

  it("prefers the roster's equipped weapon over the first legal one", async () => {
    useRoster.getState().setRoster({
      raiden_shogun: { weaponKey: 'engulfing_lightning', buildLevel: 90 },
    });
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    act(() => useOptimizeRequest.getState().setCharacterKey('raiden_shogun'));

    await waitFor(() =>
      expect(useOptimizeRequest.getState().weaponKey).toBe(
        'engulfing_lightning',
      ),
    );
  });

  it('falls back to the full list for a character the snapshot does not carry', async () => {
    const user = userEvent.setup();
    act(() => useOptimizeRequest.getState().setCharacterKey('zzz_not_meta'));
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Weapon' }));
    // Scoped to the weapon listbox — the two native <select>s on this panel
    // contribute options of their own.
    const list = screen.getByRole('listbox', { name: 'Weapon' });
    expect(within(list).getAllByRole('option').length).toBe(
      genshinAdapter.weapons().length,
    );
  });
});

describe('OptimizePanel objective coverage', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useOptimizeRequest.getState().reset();
  });

  // "(Recommended)" is drawn on the option whose value matches the recipe's
  // objective — so a recipe naming an objective the dropdown doesn't offer
  // (hp_pct for Hu Tao, def_pct for Noelle) recommended nothing at all, and
  // the user couldn't select the metric the app itself told them to use.
  it('offers every objective a meta recipe can recommend', () => {
    render(
      <OptimizePanel onRun={() => {}} running={false} onCancel={vi.fn()} />,
    );
    const select = screen.getByRole('combobox', { name: /Maximise/i });
    const offered = new Set(
      (within(select).getAllByRole('option') as HTMLOptionElement[]).map(
        (o) => o.value,
      ),
    );
    for (const meta of Object.values(META_TARGETS)) {
      // avg_damage is the deliberate exception: it is appended per character,
      // only where a curated damage profile exists.
      if (meta.objective === 'avg_damage') continue;
      expect(
        offered,
        `${meta.characterKey} recommends ${meta.objective}`,
      ).toContain(meta.objective);
    }
  });

  it('flags a negative minimum ER with aria-invalid and an inline message', async () => {
    const user = userEvent.setup();
    render(
      <OptimizePanel onRun={vi.fn()} running={false} onCancel={vi.fn()} />,
    );
    const minER = screen.getByLabelText(/minimum energy recharge/i);
    await user.clear(minER);
    await user.type(minER, '-5');
    expect(minER).toHaveAttribute('aria-invalid', 'true');
    // The visible hint swaps to the error message and is what
    // aria-describedby points at; the role="alert" announcement lives in a
    // separate persistent region (see the sr-only twin in OptimizePanel.tsx)
    // so it isn't the node the field describes.
    const describedbyId = minER.getAttribute('aria-describedby');
    expect(document.getElementById(describedbyId!)).toHaveTextContent(
      /positive number/i,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/positive number/i);
  });

  it('clears the minimum ER error once the value is valid again', async () => {
    const user = userEvent.setup();
    render(
      <OptimizePanel onRun={vi.fn()} running={false} onCancel={vi.fn()} />,
    );
    const minER = screen.getByLabelText(/minimum energy recharge/i);
    await user.clear(minER);
    await user.type(minER, '-5');
    expect(screen.getByRole('alert')).toHaveTextContent(/positive number/i);
    await user.clear(minER);
    await user.type(minER, '200');
    // The alert region is persistent (see Finding 1 fix), so it stays
    // mounted with empty text rather than disappearing.
    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(minER).not.toHaveAttribute('aria-invalid');
  });
});
