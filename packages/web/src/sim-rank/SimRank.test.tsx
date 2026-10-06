import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SimRank } from './SimRank';
import { useOptimizeRequest } from '../state/optimizeRequest';
import type { Artifact, Slot } from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import { decodeBuild } from '@genshin-build-lab/engine/share/url';

const ROTATIONS = {
  rotations: [
    {
      id: 'mualani-burn-vape',
      name: 'Mualani Burn-Vape',
      status: 'validated',
      characters: ['mualani', 'mavuika', 'emilie', 'xilonen'],
      missing: [],
    },
    {
      id: 'mualani-draft',
      name: 'Mualani Bennett',
      status: 'draft',
      characters: ['mualani', 'bennett or yelan'],
      missing: ['bennett or yelan'],
    },
    {
      id: 'raiden-national',
      name: 'Raiden National',
      status: 'validated',
      characters: ['raiden_shogun', 'xiangling', 'yelan', 'bennett'],
    },
  ],
};

const piece = (slot: Slot, setKey = 'ObsidianCodex'): Artifact => ({
  id: `m1-${slot}`,
  setKey,
  slot,
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 4780,
  subStats: [{ key: 'crit_rate', value: 10 }],
});
const artifacts = Object.fromEntries(
  SLOTS.map((s) => [s, piece(s, s === 'sands' ? 'LongNightsOath' : undefined)]),
);
const build = (rank: number, statRank: number, mean: number, over = {}) => ({
  artifactIds: {},
  score: 1,
  objectiveValue: 1,
  totals: {},
  diagnostics: {},
  artifacts,
  rank,
  statRank,
  teamDps: { mean, sd: 2000, ci95: [mean - 200, mean + 200] },
  behindPct: 0,
  tiedWithBest: false,
  characterDps: { mean: mean * 0.6, share: 0.62 },
  fightSec: 65,
  warnings: [],
  ...over,
});

const RUN = {
  understood:
    'I understood: rank Mualani’s top 10 builds by simulated team DPS.',
  status: 'ok',
  sim: {
    rotation: {
      id: 'mualani-burn-vape',
      name: 'Mualani Burn-Vape',
      status: 'validated',
    },
    teammates: [
      { key: 'mavuika', weapon: 'a', artifacts: 5 },
      { key: 'emilie', weapon: 'b', artifacts: 5 },
    ],
    iterations: 500,
    cachedRuns: 3,
    ms: 9000,
  },
  skipped: [{ statRank: 4, reasons: ['NewSet'] }],
  builds: [
    build(1, 6, 120_200),
    build(2, 16, 120_000, { behindPct: 0.2, tiedWithBest: true }),
    build(3, 1, 104_000, { behindPct: 13.5 }),
  ],
};

function serve(run: unknown = RUN) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body = path === '/rotations' ? ROTATIONS : run;
    return { ok: true, status: 200, json: async () => body, init };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => {
  useOptimizeRequest.getState().reset();
  useOptimizeRequest.setState({
    characterKey: 'mualani',
    weaponKey: 'surfs_up',
    objective: 'crit_value',
    constraints: {
      setRequirement: { kind: '4pc', setKey: 'ObsidianCodex' },
      mainStatLocks: { sands: 'hp_pct' },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('SimRank (TODO 8.2)', () => {
  it('sends the Optimise panel’s conditions as a sim spec, and ranks the builds by team DPS', async () => {
    const f = serve();
    render(<SimRank />);
    const rotation = await screen.findByLabelText('Rotation');
    // Only the rotations Mualani plays in.
    expect(
      within(rotation)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Mualani Burn-Vape', 'Mualani Bennett (draft)']);
    await userEvent.selectOptions(screen.getByLabelText('Builds'), '10');
    await userEvent.click(
      screen.getByRole('button', { name: 'Simulate the Top Builds' }),
    );
    expect(await screen.findByTestId('sim-summary')).toHaveTextContent(
      'Mualani Burn-Vape with Mavuika, Emilie as equipped · 500 iterations a build (3 from the cache) · 9.0 s.',
    );
    const post = f.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      spec: {
        version: 1,
        character: 'mualani',
        weapon: 'surfs_up',
        buildLevel: 90,
        defaults: 'replace',
        set: { kind: '4pc', setKey: 'ObsidianCodex' },
        mainStats: { sands: 'hp_pct' },
        objective: 'sim',
        sim: {
          rotation: 'mualani-burn-vape',
          by: 'crit_value',
          topK: 10,
          iterations: 500,
        },
      },
    });

    const rows = screen.getAllByTestId('sim-build');
    expect(rows[0]).toHaveTextContent('1120.2k120.0k–120.4kbest#672.1k62%');
    expect(rows[1]).toHaveTextContent('tied');
    expect(rows[2]).toHaveTextContent('−13.5%#1');
    expect(rows[0]).toHaveTextContent("Obsidian Codex 4 + Long Night's Oath 1");
    expect(
      screen.getByText(/Left out: the stat search’s #4 \(NewSet\)/),
    ).toBeInTheDocument();
  });

  it('warns about a slot the account can’t field, and shows the stat order when nothing was simulated', async () => {
    serve({
      understood: 'I understood: …',
      status: 'ok',
      notSimulated: ['gcsim lacks the set NewSet'],
      builds: [build(1, 1, 0)],
    });
    render(<SimRank />);
    await userEvent.selectOptions(
      await screen.findByLabelText('Rotation'),
      'mualani-draft',
    );
    expect(
      screen.getByText(/Your account can’t field Bennett or Yelan/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Simulate the Top Builds' }),
    );
    expect(
      await screen.findByText(/Not simulated: gcsim lacks the set NewSet/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1\. Obsidian Codex 4/)).toBeInTheDocument();
  });

  it('says when no rotation has the character, and when no build fits', async () => {
    useOptimizeRequest.setState({ characterKey: 'chiori' });
    serve();
    const { unmount } = render(<SimRank />);
    expect(
      await screen.findByText(/No library rotation has Chiori yet/),
    ).toBeInTheDocument();
    unmount();

    useOptimizeRequest.setState({ characterKey: 'mualani' });
    serve({ understood: '…', status: 'infeasible', why: ['Relax the set.'] });
    render(<SimRank />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Simulate the Top Builds' }),
    );
    expect(
      await screen.findByText(
        'No build meets these conditions on the server’s account. Relax the set.',
      ),
    ).toBeInTheDocument();
  });
});

describe('sharing a simulated build (TODO 8.3)', () => {
  it('copies a link carrying the build and its result', async () => {
    serve({
      ...RUN,
      request: {
        characterKey: 'mualani',
        // The dataset's own key, apostrophe and all: a link must name a
        // weapon the app knows.
        weaponKey: "surf's_up",
        buildLevel: 90,
        constraints: {},
        objective: 'crit_value',
      },
      builds: [
        {
          ...build(1, 6, 120_200),
          artifactIds: Object.fromEntries(SLOTS.map((s) => [s, `m1-${s}`])),
          totals: { crit_rate: 70 },
          diagnostics: { bindingConstraints: [], marginalBySlot: {} },
        },
      ],
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<SimRank />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Simulate the Top Builds' }),
    );
    const row = (await screen.findAllByTestId('sim-build'))[0];
    await userEvent.click(within(row).getByText(/Obsidian Codex 4/));
    await userEvent.click(
      within(row).getByRole('button', {
        name: 'Share This Build and Its Result',
      }),
    );
    // Making the link is asynchronous (compression): wait for the copy.
    expect(
      await within(row).findByRole('button', { name: 'Link Copied' }),
    ).toBeInTheDocument();
    const url = new URL(writeText.mock.calls[0][0] as string);
    const out = await decodeBuild(url.searchParams.get('b')!);
    if ('error' in out) throw new Error('expected a readable link');
    expect(out.request.characterKey).toBe('mualani');
    expect(out.sim).toMatchObject({
      rotation: { id: 'mualani-burn-vape', status: 'validated' },
      teammates: ['mavuika', 'emilie'],
      iterations: 500,
      teamDps: { mean: 120_200 },
      rank: 1,
      of: 1,
      statRank: 6,
    });
  });
});
