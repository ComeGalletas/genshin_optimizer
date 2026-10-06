import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServerAllocation } from './ServerAllocation';
import type { TeamInstance } from '@genshin-build-lab/engine/teams/recommend';
import type { AllocateResult } from '../local-server/allocate';
import type { Artifact, Slot } from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';

const team = (score: number, members: [string, string][]) =>
  ({
    archetypeId: `t${score}`,
    score,
    members: members.map(([characterKey, role]) => ({ characterKey, role })),
  }) as unknown as TeamInstance;

// The weaker team listed first: the plan still lets the better one pick first.
const TEAMS: [TeamInstance, TeamInstance] = [
  team(1, [
    ['furina', 'buffer'],
    ['neuvillette', 'on-field-dps'],
  ]),
  team(2, [
    ['xilonen', 'buffer'],
    ['mualani', 'on-field-dps'],
    ['emilie', 'off-field-dps'],
  ]),
];

const piece = (slot: Slot): Artifact => ({
  id: `m1-${slot}`,
  setKey: 'ObsidianCodex',
  slot,
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 4780,
  subStats: [{ key: 'crit_rate', value: 10 }],
});

const BUILD = {
  artifactIds: Object.fromEntries(SLOTS.map((s) => [s, `m1-${s}`])),
  score: 492,
  objectiveValue: 492,
  totals: { crit_rate: 70, crit_dmg: 180 },
  diagnostics: {
    bindingConstraints: [],
    marginalBySlot: {},
    explored: 1,
    pruned: 0,
  },
  artifacts: Object.fromEntries(SLOTS.map((s) => [s, piece(s)])),
};

const RESULT: AllocateResult = {
  mode: 'exact',
  ms: 15_400,
  score: { greedy: 0.9647, improved: 0.9647, exact: 0.9677 },
  solver: { exact: true, nodes: 49, candidates: { mualani: 20 } },
  members: [
    {
      characterKey: 'mualani',
      understood: 'I understood: build Mualani (Surf’s Up R1, level 90).',
      request: {
        characterKey: 'mualani',
        weaponKey: 'surfs_up',
        buildLevel: 90,
        constraints: {},
        objective: 'crit_value',
      },
      priority: 0,
      weight: 2,
      objective: 'crit_value',
      share: 1,
      status: 'ok',
      build: BUILD as never,
    },
    {
      characterKey: 'emilie',
      understood: 'I understood: build Emilie.',
      request: {
        characterKey: 'emilie',
        weaponKey: 'lumidouce_elegy',
        buildLevel: 90,
        constraints: {},
        objective: 'crit_value',
      },
      priority: 1,
      weight: 1.5,
      objective: 'crit_value',
      share: 0.843,
      status: 'no_build',
    },
  ],
  moves: {
    moves: [
      {
        characterKey: 'mualani',
        slot: 'plume',
        artifactId: 'm1-plume',
        from: 'mavuika',
        displaced: 'm1-9',
        text: 'Mualani: equip the Obsidian Codex plume (ATK, +20), from Mavuika; Mavuika takes Mualani’s current plume.',
      },
    ],
    inPlace: 9,
  },
  farming: [
    'Emilie: 84.3% of their best build alone; the plan gives that build’s flower to Mualani.',
  ],
};

function serve(body: unknown, status = 200) {
  const f = vi.fn(async () => ({
    ok: status === 200,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe('ServerAllocation (TODO 8.2)', () => {
  it('sends the plan’s members in its picking order with their role weights, and shows the plan', async () => {
    const f = serve(RESULT);
    render(<ServerAllocation teams={TEAMS} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Allocate on the Server' }),
    );
    expect(await screen.findByTestId('plan-score')).toHaveTextContent(
      'Plan score 96.8% (greedy 96.5%, local search 96.5%) · proven best within each member’s top builds · 15 s',
    );
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/allocate$/);
    expect(JSON.parse(init.body as string)).toEqual({
      mode: 'exact',
      members: [
        { spec: { character: 'mualani' }, priority: 0, weight: 2 },
        { spec: { character: 'emilie' }, priority: 1, weight: 1.5 },
        { spec: { character: 'xilonen' }, priority: 2, weight: 1 },
        { spec: { character: 'neuvillette' }, priority: 3, weight: 2 },
        { spec: { character: 'furina' }, priority: 4, weight: 1 },
      ],
    });

    const [mualani, emilie] = screen.getAllByTestId('alloc-member');
    expect(mualani).toHaveTextContent('Mualani100.0%×2');
    expect(emilie).toHaveTextContent('Emilie84.3%×1.5no build');
    await userEvent.click(within(mualani).getByText('Mualani'));
    expect(
      within(mualani).getByText(/I understood: build Mualani/),
    ).toBeVisible();

    expect(
      screen.getByText(/9 planned pieces are already in place\./),
    ).toBeInTheDocument();
    const move = screen.getByRole('checkbox', {
      name: /Mualani: equip the Obsidian Codex plume/,
    });
    await userEvent.click(move);
    expect(move).toBeChecked();
    expect(
      screen.getByText(/84.3% of their best build alone/),
    ).toBeInTheDocument();
  });

  it('runs the mode chosen, and says the greedy plan has no score', async () => {
    const f = serve({
      ...RESULT,
      mode: 'greedy',
      score: undefined,
      solver: undefined,
      members: [{ ...RESULT.members[0], share: undefined }],
      moves: { moves: [], inPlace: 5 },
      farming: [],
    });
    render(<ServerAllocation teams={TEAMS} />);
    await userEvent.selectOptions(
      screen.getByLabelText('Allocation'),
      'greedy',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Allocate on the Server' }),
    );
    expect(await screen.findByTestId('plan-score')).toHaveTextContent(
      'Greedy plan · 15 s',
    );
    expect(
      JSON.parse(
        (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
      ).mode,
    ).toBe('greedy');
    expect(
      screen.getByText(
        'Nothing to move: every planned piece is already in place.',
      ),
    ).toBeInTheDocument();
  });

  it('says why there is no allocation', async () => {
    serve(
      {
        message:
          'the spec has a problem: members.3.character: Neuvillette is not in the account',
      },
      400,
    );
    render(<ServerAllocation teams={TEAMS} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Allocate on the Server' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No allocation: the spec has a problem: members.3.character: Neuvillette is not in the account.',
    );
  });
});
