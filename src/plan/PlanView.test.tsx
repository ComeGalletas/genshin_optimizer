import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanView } from './PlanView';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { searchBuilds } from '@genshin-build-lab/engine/optimizer/search';
import { buildContext } from '@genshin-build-lab/engine/optimizer/context';
import type { RunOptimize } from '@genshin-build-lab/engine/plan/composePlan';
import type {
  Artifact,
  Slot,
  StatKey,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';

const run: RunOptimize = (req, inv) =>
  Promise.resolve(searchBuilds(req, inv, buildContext(req)));

let n = 0;
function art(slot: Slot, setKey: string, main: StatKey): Artifact {
  return {
    id: `p${n++}`,
    setKey,
    slot,
    rarity: 5,
    level: 20,
    mainStat: main,
    mainStatValue: 46,
    subStats: [
      { key: 'crit_rate', value: 8 },
      { key: 'crit_dmg', value: 16 },
      { key: 'er_pct', value: 22 },
    ],
  };
}

const MAINS: Record<Slot, StatKey> = {
  flower: 'hp',
  plume: 'atk',
  sands: 'hp_pct',
  goblet: 'elemental_dmg',
  circlet: 'crit_rate',
};

function seed() {
  const entry = {
    buildLevel: 90 as const,
    talents: { auto: 9, skill: 9, burst: 9 },
    weaponKey: 'the_catch',
    weaponLevel: 90,
  };
  useRoster
    .getState()
    .setRoster(
      Object.fromEntries(
        [
          'neuvillette',
          'furina',
          'kaedehara_kazuha',
          'charlotte',
          'raiden_shogun',
          'xiangling',
          'xingqiu',
          'bennett',
        ].map((k) => [k, entry]),
      ),
    );
  const inv: Artifact[] = [];
  for (const s of SLOTS)
    for (let i = 0; i < 10; i++)
      inv.push(
        art(s, i % 2 ? 'EmblemOfSeveredFate' : 'MarechausseeHunter', MAINS[s]),
      );
  useInventory.getState().addMany(inv);
}

describe('PlanView', () => {
  beforeEach(() => {
    useRoster.getState().clear();
    useInventory.getState().clear();
  });

  // aria-disabled rather than `disabled`, so the button keeps focus across a
  // run; `build()` holds the matching early return.
  it('asks for an import before it can plan anything', () => {
    render(<PlanView runOptimize={run} />);
    expect(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('never runs eight solves without an explicit click', () => {
    seed();
    const spy = vi.fn(run);
    render(<PlanView runOptimize={spy} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('builds the plan on click and renders teams, builds and one farming list', async () => {
    const user = userEvent.setup();
    seed();
    render(<PlanView runOptimize={run} />);
    await user.click(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    );

    expect(await screen.findByText('What to Farm')).toBeInTheDocument();
    // The plan leads with a summary: one row per member across two halves,
    // every card collapsed until asked for.
    const rows = screen.getAllByTestId('plan-summary-row');
    expect(rows).toHaveLength(8);
    expect(screen.getByText(/First Half/)).toBeInTheDocument();
    expect(screen.getByText(/Second Half/)).toBeInTheDocument();
    expect(screen.queryAllByTestId('plan-member')).toHaveLength(0);
  });

  it('expands one member’s full card from its summary row', async () => {
    const user = userEvent.setup();
    seed();
    render(<PlanView runOptimize={run} />);
    await user.click(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    );
    await screen.findByText('What to Farm');

    const first = screen.getAllByTestId('plan-summary-row')[0];
    const details = within(first).getByRole('group');
    expect(details).not.toHaveAttribute('open');
    // The whole row is the control: clicking its summary opens the card.
    const summary = first.querySelector('summary')!;
    await user.click(summary);
    expect(details).toHaveAttribute('open');
    const card = screen.getByTestId('plan-member');
    expect(details).toContainElement(card);
    // Only this row's card mounted — the other seven are still closed.
    expect(screen.getAllByTestId('plan-member')).toHaveLength(1);
    // Damage-objective members carry the estimate caveat.
    expect(screen.getAllByText(/estimated damage/i).length).toBeGreaterThan(0);

    // Closing hides the card again (it stays mounted — re-rendering eight
    // artifacts on every toggle is not free).
    await user.click(summary);
    expect(details).not.toHaveAttribute('open');
    expect(card).not.toBeVisible();
  });

  it('collapses every row again when a new plan is built', async () => {
    const user = userEvent.setup();
    seed();
    render(<PlanView runOptimize={run} />);
    const button = screen.getByRole('button', {
      name: /Build my Abyss plan/i,
    });
    await user.click(button);
    await screen.findByText('What to Farm');

    const summary = screen
      .getAllByTestId('plan-summary-row')[0]
      .querySelector('summary')!;
    await user.click(summary);
    expect(screen.getAllByTestId('plan-member')).toHaveLength(1);

    await user.click(button);
    await screen.findByText('What to Farm');
    expect(
      screen
        .getAllByTestId('plan-summary-row')
        .every((r) => !r.querySelector('details')!.hasAttribute('open')),
    ).toBe(true);
    expect(screen.queryAllByTestId('plan-member')).toHaveLength(0);
  });

  it('puts the farming and investment lists above the per-member detail', async () => {
    const user = userEvent.setup();
    seed();
    const { container } = render(<PlanView runOptimize={run} />);
    await user.click(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    );
    await screen.findByText('What to Farm');

    const order = [...container.querySelectorAll('h3')].map(
      (h) => h.textContent ?? '',
    );
    const farm = order.findIndex((t) => t.includes('What to Farm'));
    const summary = order.findIndex((t) => t.includes('First Half'));
    expect(summary).toBeGreaterThanOrEqual(0);
    expect(farm).toBeGreaterThan(summary);
    // …and nothing between them but the eight collapsed rows.
    expect(screen.queryAllByTestId('plan-member')).toHaveLength(0);
  });

  it('links the curated source for weapon advice', async () => {
    const user = userEvent.setup();
    seed();
    render(
      <PlanView
        runOptimize={run}
        advise={() => [
          {
            kind: 'weapon',
            subjectKey: 'the_catch',
            headline: 'Holding a stat stick',
            detail: 'The Catch is craftable.',
            provenance: 'xiangling',
            upside: 1,
            source: 'https://example.test/The_Catch',
          },
        ]}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    );
    await screen.findByText('What to Farm');

    const link = screen.getByRole('link', { name: /source/i });
    expect(link).toHaveAttribute('href', 'https://example.test/The_Catch');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent(/opens in new tab/i);
  });

  it('renders investment advice with provenance when there is any', async () => {
    const user = userEvent.setup();
    seed();
    render(<PlanView runOptimize={run} />);
    await user.click(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    );
    await screen.findByText('What to Farm');
    // The seeded roster is eight characters, so plenty of archetypes are one
    // character short and yield advice.
    expect(screen.getByText('Worth Investing In')).toBeInTheDocument();
    expect(screen.getAllByTestId('advice').length).toBeGreaterThan(0);
  });

  it('discards a plan whose inventory was replaced mid-run', async () => {
    const user = userEvent.setup();
    seed();
    // Park the first of the eight solves so the inventory can be swapped
    // underneath a run that is genuinely in flight.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let solved = 0;
    let parked = false;
    const gated: RunOptimize = async (req, inv) => {
      if (!parked) {
        parked = true;
        await gate;
      }
      const out = await run(req, inv);
      solved++;
      return out;
    };
    render(<PlanView runOptimize={gated} />);
    await user.click(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    );
    // The same text also lives in a persistent sr-only announcement region
    // (see Finding 1 fix), so scope to the visible progress node.
    expect(await screen.findByTestId('progress-text')).toHaveTextContent(
      /Optimising member/i,
    );

    // Re-importing replaces the inventory: the run still in flight is now
    // solving over gear the user no longer has.
    await act(async () => {
      useInventory.getState().clear();
    });
    expect(screen.queryByTestId('progress-text')).toBeNull();

    await act(async () => {
      release();
      await waitFor(() => expect(solved).toBe(8));
    });
    // The superseded run commits nothing: no plan, no progress, no error.
    expect(screen.queryByText('What to Farm')).toBeNull();
    expect(screen.queryByText(/Optimising member/i)).toBeNull();
    // The alert region is persistent (see Finding 1 fix), so it stays
    // mounted with empty text rather than disappearing.
    expect(screen.getByRole('alert')).toHaveTextContent('');
  });

  it('renders no advice heading when there is nothing to advise', async () => {
    const user = userEvent.setup();
    seed();
    render(<PlanView runOptimize={run} advise={() => []} />);
    await user.click(
      screen.getByRole('button', { name: /Build my Abyss plan/i }),
    );
    await screen.findByText('What to Farm');
    expect(screen.queryByText('Worth Investing In')).not.toBeInTheDocument();
  });
});
