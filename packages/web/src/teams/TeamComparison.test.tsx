import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparisonResult, TeamComparison } from './TeamComparison';
import { useCompareRotation } from './compareRotation';
import { decodeComparison } from '@genshin-build-lab/engine/share/comparison';
import type { TeamSimResult } from '../local-server/teamsim';

const ROTATIONS = {
  rotations: [
    {
      id: 'raiden-national',
      name: 'Raiden National',
      status: 'validated',
      characters: ['raiden_shogun', 'xiangling', 'yelan', 'bennett'],
    },
    {
      id: 'raiden-national-xingqiu',
      name: 'Raiden National (Xingqiu)',
      status: 'validated',
      characters: ['raiden_shogun', 'xiangling', 'xingqiu', 'bennett'],
    },
    { id: 'broken', problems: ['bad meta'] },
  ],
};

const run = (
  label: string,
  mean: number,
  extra: Partial<TeamSimResult['runs'][number]> = {},
) => ({
  label,
  rotation: {
    id: 'raiden-national',
    name: 'Raiden National',
    status: 'validated',
  },
  dps: {
    mean,
    sd: 4000,
    ci95: [mean - 250, mean + 250] as [number, number],
    min: mean - 15_000,
    q1: mean - 3000,
    median: mean + 500,
    q3: mean + 3000,
    max: mean + 9000,
  },
  fightSec: 108.2,
  characters: [
    {
      character: 'raiden_shogun',
      dps: mean * 0.3,
      share: 0.3,
      fieldSec: 47,
      energyWaitSec: 0,
    },
    {
      character: 'xiangling',
      dps: mean * 0.3,
      share: 0.3,
      fieldSec: 16,
      energyWaitSec: 0,
    },
    {
      character: 'yelan',
      dps: mean * 0.35,
      share: 0.35,
      fieldSec: 24,
      energyWaitSec: 0,
    },
    {
      character: 'bennett',
      dps: mean * 0.05,
      share: 0.05,
      fieldSec: 18,
      energyWaitSec: 0,
    },
  ],
  reactions: { vaporize: 93, overload: 58 },
  warnings: [],
  ...extra,
});

const RESULT: TeamSimResult = {
  iterations: 1000,
  burstWaits: 'filled with attacks',
  ms: 4200,
  runs: [
    run('base', 85_128),
    run('Two targets', 167_447, {
      vsBase: {
        pct: 96.7,
        ci95Pct: 0.3,
        withinNoise: false,
        text: '+96.7% ± 0.3%',
      },
    }),
    run('The Catch', 85_200, {
      fightSec: 114,
      warnings: ['insufficient_energy'],
      characters: [
        {
          character: 'raiden_shogun',
          dps: 20_000,
          share: 0.25,
          fieldSec: 47,
          energyWaitSec: 3.4,
        },
      ],
      vsBase: {
        pct: 0.1,
        ci95Pct: 0.3,
        withinNoise: true,
        text: '+0.1% ± 0.3%',
      },
    }),
    {
      label: 'Xingqiu for Yelan',
      problems: [
        'Raiden National\'s "yelan" slot takes only Yelan: for Xingqiu, choose a rotation that has them (raiden-national-xingqiu)',
      ],
    },
  ],
};

/** A fake local server: GET /rotations, POST /sim/team. */
function serve(sim: unknown = RESULT, rotationsStatus = 200) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const isSim = url.endsWith('/sim/team');
    const status = isSim ? 200 : rotationsStatus;
    return {
      ok: status === 200,
      status,
      json: async () =>
        isSim
          ? sim
          : status === 200
            ? ROTATIONS
            : { message: 'the server hit an error; see its log' },
      init,
    };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useCompareRotation.setState({ id: '' });
});

describe('TeamComparison (TODO 6.2)', () => {
  it('offers the usable rotations, with the team they field', async () => {
    serve();
    render(<TeamComparison />);
    const select = await screen.findByLabelText('Base team’s rotation');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Raiden National', 'Raiden National (Xingqiu)']);
    expect(
      screen.getByText(/Raiden Shogun, Xiangling, Yelan, Bennett, as equipped/),
    ).toBeInTheDocument();
  });

  it('sends the variants built in the form, labelled, and shows the comparison', async () => {
    const f = serve();
    render(<TeamComparison />);
    await screen.findByLabelText('Base team’s rotation');
    await userEvent.click(screen.getByRole('button', { name: 'Enemy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rotation' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Compare 3 runs' }),
    );

    const body = JSON.parse(
      (f.mock.calls.find(([u]) => u.endsWith('/sim/team'))![1] as RequestInit)
        .body as string,
    );
    expect(body).toEqual({
      rotation: 'raiden-national',
      iterations: 1000,
      variants: [
        {
          label: '2 targets, 10% RES, level 100',
          enemy: { count: 2, res: 10, level: 100 },
        },
        {
          label: 'Raiden National (Xingqiu)',
          rotation: 'raiden-national-xingqiu',
        },
      ],
    });

    // The table: each run against the base, the noise said in words.
    const rows = await screen.findAllByTestId('run-row');
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual([
      'base',
      'Two targets',
      'The Catch',
      expect.stringMatching(/^Xingqiu for Yelan.*slot takes only Yelan/),
    ]);
    expect(within(rows[0]).getAllByText('base')).toHaveLength(2);
    expect(within(rows[1]).getByText('+96.7% ± 0.3%')).toBeInTheDocument();
    expect(within(rows[2]).getByText('within noise')).toBeInTheDocument();
    expect(within(rows[2]).getByText('+5.8 s')).toBeInTheDocument();
    // A variant that couldn't be built has no numbers.
    expect(within(rows[3]).getAllByText('—')).toHaveLength(3);

    // A box plot and a share bar per simulated run, numbers in text too.
    expect(screen.getAllByTestId('box-plot')).toHaveLength(3);
    expect(screen.getAllByTestId('dps-row')[0]).toHaveTextContent(
      'median 85.6k · middle half 82.1k–88.1k · range 70.1k–94.1k',
    );
    expect(screen.getAllByTestId('share-row')[0]).toHaveTextContent(
      'Yelan 35% (29.8k) · Raiden Shogun 30% (25.5k)',
    );
    // Reactions and energy.
    expect(
      screen.getByRole('rowheader', { name: 'vaporize' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('energy')).toHaveTextContent(
      'The Catch: a burst waited for energy; Raiden Shogun waited 3.4 s for energy.',
    );
    expect(screen.getByTestId('energy')).toHaveTextContent(
      'base: no warnings.',
    );
  });

  it('holds the run until every variant is filled in', async () => {
    serve();
    render(<TeamComparison />);
    await screen.findByLabelText('Base team’s rotation');
    await userEvent.click(screen.getByRole('button', { name: 'Weapon' }));
    expect(
      screen.getByRole('button', { name: 'Compare 2 runs' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Finish each variant/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      screen.getByRole('button', { name: 'Simulate the team' }),
    ).toHaveAttribute('aria-disabled', 'false');
  });

  it('says so when the library can’t be loaded', async () => {
    serve(RESULT, 500);
    render(<TeamComparison />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load the rotation library: the server hit an error; see its log.',
    );
  });
});

describe('the comparison’s details (TODO 8.2)', () => {
  const member = (
    slot: string,
    character: string,
    weapon: string,
    refinement: number,
    sets: string[],
  ) => ({ slot, character, weapon, refinement, sets });
  const TEAM = [
    member('raiden', 'raiden_shogun', 'engulfing_lightning', 1, [
      'EmblemOfSeveredFate',
    ]),
    member('bennett', 'bennett', 'aquila_favonia', 1, ['NoblesseOblige']),
  ];

  it('shows each team as run, a variant by what it changed, and each character per run', async () => {
    const result: TeamSimResult = {
      ...RESULT,
      runs: [
        run('base', 85_128, { team: TEAM, enemy: { level: 100, res: 10 } }),
        run('The Catch', 84_000, {
          team: [
            member('raiden', 'raiden_shogun', 'the_catch', 5, [
              'EmblemOfSeveredFate',
            ]),
            TEAM[1],
          ],
          cached: true,
          vsBase: {
            pct: -1.3,
            ci95Pct: 0.3,
            withinNoise: false,
            text: '−1.3% ± 0.3%',
          },
        }),
        run('Two targets', 160_000, {
          team: TEAM,
          enemy: { level: 100, res: 10, count: 2 },
          rotation: { id: 'mine', name: 'Mine', status: 'draft' },
          vsBase: {
            pct: 88,
            ci95Pct: 0.3,
            withinNoise: false,
            text: '+88.0% ± 0.3%',
          },
        }),
      ],
    };
    render(<ComparisonResult result={result} />);
    const teams = screen.getByRole('table', { name: 'The base team' });
    expect(within(teams).getAllByRole('row')[1]).toHaveTextContent(
      'Raiden ShogunEngulfing Lightning R1Emblem of Severed Fate',
    );
    const changes = screen.getByTestId('variant-teams');
    expect(changes).toHaveTextContent(
      'The Catch: Raiden Shogun: "The Catch" R5 (base Engulfing Lightning R1).',
    );
    expect(changes).toHaveTextContent(
      'Two targets: the same team (another rotation or enemy).',
    );
    const rows = screen.getAllByTestId('run-row');
    expect(rows[2]).toHaveTextContent('enemy: 2 targets');
    expect(rows[2]).toHaveTextContent('draft rotation');
    expect(screen.getByText(/A draft rotation ran/)).toBeInTheDocument();
    expect(screen.getByText(/some runs from the cache/)).toBeInTheDocument();

    const perBase = screen.getByRole('table', {
      name: 'Per character in base',
    });
    expect(within(perBase).getAllByRole('row')[1]).toHaveTextContent(
      'Raiden Shogun25.5k30.0%47.0 s—',
    );
  });
});

describe('sharing a comparison (TODO 8.3)', () => {
  it('copies a #c= link that opens the same comparison', async () => {
    serve();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<TeamComparison />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Simulate the team/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Share This Comparison' }),
    );
    // Making the link is asynchronous (compression): wait for the copy.
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const url = new URL(writeText.mock.calls[0][0] as string);
    expect(url.hash).toMatch(/^#c=/);
    const back = await decodeComparison(url.hash.slice(3));
    if ('error' in back) throw new Error('expected a readable link');
    expect(back.runs.map((r) => r.label)).toEqual(
      RESULT.runs.map((r) => r.label),
    );
    expect(back.runs[1].vsBase?.text).toBe('+96.7% ± 0.3%');
  });
});
