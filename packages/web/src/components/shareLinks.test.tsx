import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { encodeBuild } from '@genshin-build-lab/engine/share/url';
import { encodeComparison } from '@genshin-build-lab/engine/share/comparison';
import type {
  Artifact,
  BuildResult,
  OptimizeRequest,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';

const request: OptimizeRequest = {
  characterKey: 'raiden_shogun',
  weaponKey: 'engulfing_lightning',
  buildLevel: 90,
  constraints: {},
  objective: 'crit_value',
};
const artifacts: Artifact[] = SLOTS.map((slot) => ({
  id: `a-${slot}`,
  setKey: 'EmblemOfSeveredFate',
  slot,
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 4780,
  subStats: [{ key: 'crit_dmg', value: 14 }],
}));
const build: BuildResult = {
  artifactIds: Object.fromEntries(SLOTS.map((s) => [s, `a-${s}`])) as Record<
    (typeof SLOTS)[number],
    string
  >,
  totals: { crit_dmg: 70 },
  objectiveValue: 70,
  score: 70,
  diagnostics: {
    bindingConstraints: [],
    marginalBySlot: {},
    explored: 0,
    pruned: 0,
  },
};

afterEach(() => window.history.pushState({}, '', '/'));

describe('share links with simulation results (TODO 8.3)', () => {
  it('opens a shared build with its team simulation, no server needed', async () => {
    const param = await encodeBuild({
      request,
      build,
      artifacts,
      sim: {
        rotation: {
          id: 'raiden-national',
          name: 'Raiden National',
          status: 'validated',
        },
        teammates: ['xiangling', 'yelan', 'bennett'],
        iterations: 500,
        teamDps: { mean: 85_128, ci95: [84_900, 85_360] },
        rank: 2,
        of: 20,
        statRank: 6,
        tiedWithBest: true,
        behindPct: 0.1,
        characterDps: { mean: 25_500, share: 0.3 },
        fightSec: 108.2,
      },
    });
    window.history.pushState({}, '', `/?b=${param}`);
    render(<App />);
    // The banner is in the lazy Optimise view: allow for its load.
    expect(
      await screen.findByTestId('shared-sim', {}, { timeout: 5000 }),
    ).toHaveTextContent(
      'Simulated by the sharer: 85.1k team DPS (84.9k–85.4k) in Raiden National with Xiangling, Yelan, Bennett as they had them; #2 of 20 by team DPS (tied with the best), #6 by Crit Value; Raiden Shogun 25.5k DPS, 30% of the team; 500 iterations.',
    );
  });

  it('opens a link from before simulations on Optimise, with its build and no simulation line (TODO 9.8)', async () => {
    const param = await encodeBuild({ request, build, artifacts });
    window.history.pushState({}, '', `/?b=${param}`);
    render(<App />);
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Results' },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Optimise' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText(/Shared build/)).toBeInTheDocument();
    expect(screen.queryByTestId('shared-sim')).toBeNull();
  });

  it('opens a shared comparison before any import, and closes it', async () => {
    const param = (await encodeComparison({
      iterations: 1000,
      burstWaits: 'filled with attacks',
      ms: 4200,
      runs: [
        {
          label: 'base',
          rotation: {
            id: 'raiden-national',
            name: 'Raiden National',
            status: 'validated',
          },
          dps: { mean: 85_128, sd: 4000, ci95: [84_900, 85_350] },
          fightSec: 108.2,
        },
        {
          label: 'The Catch',
          dps: { mean: 84_000, sd: 4000, ci95: [83_800, 84_200] },
          fightSec: 108.2,
          vsBase: {
            pct: -1.3,
            ci95Pct: 0.3,
            withinNoise: false,
            text: '−1.3% ± 0.3%',
          },
        },
      ],
    }))!;
    window.history.pushState({}, '', `/#c=${param}`);
    render(<App />);
    const section = (
      await screen.findByRole('heading', { name: 'Shared Team Comparison' })
    ).closest('section')!;
    expect(
      await within(section).findByText(/Shared comparison · Raiden National/),
    ).toBeInTheDocument();
    const rows = within(section).getAllByTestId('run-row');
    expect(rows[1]).toHaveTextContent('The Catch84.0k83.8k–84.2k−1.3% ± 0.3%');

    await userEvent.click(
      within(section).getByRole('button', { name: 'Close' }),
    );
    expect(
      screen.queryByRole('heading', { name: 'Shared Team Comparison' }),
    ).toBeNull();
    // Closing lands on the Simulate view's own address.
    expect(window.location.hash).toBe('#/simulate');
  });

  it('says when a comparison link can’t be read', async () => {
    window.history.pushState({}, '', '/#c=not-a-comparison');
    render(<App />);
    expect(
      await screen.findByText(/This comparison link can’t be read/),
    ).toBeInTheDocument();
  });
});
