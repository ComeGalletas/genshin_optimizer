import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Results } from './Results';
import type {
  Artifact,
  OptimizeResult,
  OptimizeRequest,
  Slot,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';

const req: OptimizeRequest = {
  characterKey: 'c',
  weaponKey: 'w',
  buildLevel: 90,
  constraints: {},
  objective: 'crit_value',
};

describe('Results', () => {
  it('shows the infeasible message when there are no builds', () => {
    const r: OptimizeResult = {
      status: 'infeasible',
      explored: 10,
      pruned: 2,
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={{}}
      />,
    );
    // The same text also lives in a persistent sr-only announcement region
    // (see Finding 1 fix) — scope to the visible Callout to avoid matching
    // both.
    expect(
      within(screen.getByTestId('infeasible-callout')).getByText(
        /No build satisfies all constraints/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders one card per build with its objective value and pieces', () => {
    const artifactsById: Record<string, Artifact> = {
      f: {
        id: 'f',
        setKey: 'EmblemOfSeveredFate',
        slot: 'flower',
        rarity: 5,
        level: 20,
        mainStat: 'hp',
        mainStatValue: 4780,
        subStats: [],
      },
      p: {
        id: 'p',
        setKey: 'EmblemOfSeveredFate',
        slot: 'plume',
        rarity: 5,
        level: 20,
        mainStat: 'atk',
        mainStatValue: 311,
        subStats: [],
      },
      s: {
        id: 's',
        setKey: 'EmblemOfSeveredFate',
        slot: 'sands',
        rarity: 5,
        level: 20,
        mainStat: 'atk_pct',
        mainStatValue: 46.6,
        subStats: [],
      },
      g: {
        id: 'g',
        setKey: 'EmblemOfSeveredFate',
        slot: 'goblet',
        rarity: 5,
        level: 20,
        mainStat: 'elemental_dmg',
        mainStatValue: 46.6,
        subStats: [],
      },
      c: {
        id: 'c',
        setKey: 'NoblesseOblige',
        slot: 'circlet',
        rarity: 5,
        level: 20,
        mainStat: 'crit_rate',
        mainStatValue: 31.1,
        subStats: [],
      },
    };
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [
        {
          artifactIds: {
            flower: 'f',
            plume: 'p',
            sands: 's',
            goblet: 'g',
            circlet: 'c',
          },
          totals: { crit_rate: 60, crit_dmg: 120, atk: 2000 },
          objectiveValue: 240,
          score: 240,
          diagnostics: {
            bindingConstraints: [],
            marginalBySlot: {},
            explored: 100,
            pruned: 50,
          },
        },
      ],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={artifactsById}
      />,
    );
    expect(screen.getByText(/240/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Emblem of Severed Fate/i).length,
    ).toBeGreaterThan(0);
  });

  it('explains the ranking metric once, not once per card', () => {
    const build = {
      artifactIds: {
        flower: 'f',
        plume: 'p',
        sands: 's',
        goblet: 'g',
        circlet: 'c',
      },
      totals: { crit_rate: 60 },
      objectiveValue: 240,
      score: 240,
      diagnostics: {
        bindingConstraints: [],
        marginalBySlot: {},
        explored: 1,
        pruned: 0,
      },
    };
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [build, { ...build }, { ...build }],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={{}}
      />,
    );
    expect(screen.getAllByText(/Crit Value = 2/)).toHaveLength(1);
  });

  it('hides the exact-search panel for a shared build that searched nothing', () => {
    const r: OptimizeResult = {
      status: 'ok',
      explored: 0,
      pruned: 0,
      builds: [
        {
          artifactIds: {
            flower: 'f',
            plume: 'p',
            sands: 's',
            goblet: 'g',
            circlet: 'c',
          },
          totals: {},
          objectiveValue: 12,
          score: 12,
          diagnostics: {
            bindingConstraints: [],
            marginalBySlot: {},
            explored: 0,
            pruned: 0,
          },
        },
      ],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={{}}
      />,
    );
    expect(screen.queryByText(/Exact search/i)).toBeNull();
    expect(screen.queryByText(/leaves evaluated/i)).toBeNull();
  });

  it('reports the search when one actually ran', () => {
    const r: OptimizeResult = {
      status: 'ok',
      explored: 7,
      pruned: 3,
      builds: [],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={{}}
      />,
    );
    expect(screen.getByText(/Exact search/i)).toBeInTheDocument();
    // Same wording as the hero proof line and the live progress line.
    expect(screen.getByText(/leaves evaluated/i)).toHaveTextContent(
      '7 leaves evaluated · 3 subtrees pruned before the optimum was proven.',
    );
  });
});

/** A build whose only interesting property is its score and its circlet.
 *  `score` defaults to the objective; pass it separately to model a
 *  `critRatioTarget` run, where the ranking score carries a penalty the
 *  printed objective does not. */
function scored(objectiveValue: number, circlet: string, score?: number) {
  return {
    artifactIds: {
      flower: 'f',
      plume: 'p',
      sands: 's',
      goblet: 'g',
      circlet,
    },
    totals: { crit_rate: 60 },
    objectiveValue,
    score: score ?? objectiveValue,
    diagnostics: {
      bindingConstraints: [],
      marginalBySlot: {},
      explored: 1,
      pruned: 0,
    },
  };
}

const circletsById: Record<string, Artifact> = {
  c1: {
    id: 'c1',
    setKey: 'NoblesseOblige',
    slot: 'circlet',
    rarity: 5,
    level: 20,
    mainStat: 'crit_rate',
    mainStatValue: 31.1,
    subStats: [],
  },
  c2: {
    id: 'c2',
    setKey: 'GladiatorsFinale',
    slot: 'circlet',
    rarity: 5,
    level: 20,
    mainStat: 'crit_rate',
    mainStatValue: 31.1,
    subStats: [],
  },
};

describe('Results ties and deltas', () => {
  it('collapses exactly-tied builds into one card that names what differs', () => {
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [scored(240, 'c1'), scored(240, 'c2'), scored(230, 'c1')],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={circletsById}
      />,
    );
    // Two cards, not three: the tie is one answer, shown once.
    expect(screen.getAllByText(/240\.0/)).toHaveLength(1);
    expect(
      screen.getByText(/×2 equivalent variants.*circlet set differs/i),
    ).toBeInTheDocument();
  });

  it('shows a delta against rank 1 on runners-up only', () => {
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [scored(240, 'c1'), scored(236.6, 'c2')],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={circletsById}
      />,
    );
    expect(screen.getByText('−3.4')).toBeInTheDocument();
    expect(screen.queryByText('−0.0')).toBeNull();
  });

  it('measures the delta in the ranking score, not the printed objective', () => {
    // A crit-ratio target penalises an over-crit build: rank 2 prints a
    // *higher* Crit Value than rank 1 and is still second. The chip has to
    // report the gap the ranking actually used, so it stays non-positive.
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [scored(240, 'c1', 240), scored(244, 'c2', 238)],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={{ ...req, constraints: { critRatioTarget: 2 } }}
        artifactsById={circletsById}
      />,
    );
    expect(screen.getByText(/244\.0/)).toBeInTheDocument();
    expect(screen.getByText('−2.0')).toBeInTheDocument();
    // Never the objective difference, which would have been a positive 4.
    expect(screen.queryByText('4.0')).toBeNull();
  });

  it('counts cards, not raw results, in both list counters', async () => {
    const user = userEvent.setup();
    // Five results, but two are an exact tie: four cards.
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [
        scored(250, 'c1'),
        scored(240, 'c1'),
        scored(240, 'c2'),
        scored(230, 'c1'),
        scored(220, 'c2'),
      ],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={circletsById}
      />,
    );
    expect(
      screen.getByText(/4 builds shown — near-duplicates/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Show all 4 builds/i }),
    );
    expect(screen.getByText(/220\.0/)).toBeInTheDocument();
  });

  it('holds ranks 4+ behind a reveal', async () => {
    const user = userEvent.setup();
    const builds = [250, 240, 230, 220, 210].map((v, i) =>
      scored(v, i % 2 === 0 ? 'c1' : 'c2'),
    );
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds,
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={circletsById}
      />,
    );
    expect(screen.queryByText(/220\.0/)).toBeNull();

    await user.click(
      screen.getByRole('button', { name: /Show all 5 builds/i }),
    );
    expect(screen.getByText(/220\.0/)).toBeInTheDocument();
    expect(screen.getByText(/210\.0/)).toBeInTheDocument();
  });

  it('explains a short list rather than letting it read as a bug', () => {
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [scored(240, 'c1'), scored(230, 'c2')],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={circletsById}
      />,
    );
    expect(
      screen.getByText(/2 builds shown — near-duplicates/i),
    ).toBeInTheDocument();
  });

  it('says nothing about list length for a shared build that never searched', () => {
    const r: OptimizeResult = {
      status: 'ok',
      explored: 0,
      pruned: 0,
      builds: [scored(240, 'c1')],
    };
    render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={circletsById}
      />,
    );
    expect(screen.queryByText(/builds shown/i)).toBeNull();
  });
});

describe('Results — infeasible cause', () => {
  const realReq: OptimizeRequest = {
    characterKey: 'raiden_shogun',
    weaponKey: 'engulfing_lightning',
    buildLevel: 90,
    constraints: {},
    objective: 'crit_value',
  };
  const infeasible: OptimizeResult = {
    status: 'infeasible',
    explored: 10,
    pruned: 2,
  };
  const erPiece = (slot: Slot, setKey: string): Artifact => ({
    id: `${setKey}-${slot}`,
    setKey,
    slot,
    rarity: 5,
    level: 20,
    mainStat: 'er_pct',
    mainStatValue: 10,
    subStats: [],
  });

  beforeEach(() => {
    useInventory.setState({ artifacts: [] });
    useOptimizeRequest.getState().setMinER('');
  });

  it('names an ER floor no build can reach, and relaxes it on request', async () => {
    const user = userEvent.setup();
    const onRelax = vi.fn();
    useInventory.setState({
      artifacts: SLOTS.map((s) => erPiece(s, 'EmblemOfSeveredFate')),
    });
    render(
      <Results
        onRelax={onRelax}
        result={infeasible}
        request={{ ...realReq, constraints: { minStats: { er_pct: 500 } } }}
        artifactsById={{}}
      />,
    );
    // The same text also lives in a persistent sr-only announcement region
    // (see Finding 1 fix) — scope to the visible Callout to avoid matching
    // both.
    expect(
      within(screen.getByTestId('infeasible-callout')).getByText(
        /Even the optimistic ceiling for Energy Recharge is .* your floor is 500/i,
      ),
    ).toBeInTheDocument();

    // The button reports the key and value; the panel that owns the request
    // applies it.
    const relax = screen.getByRole('button', {
      name: /Relax Energy Recharge to ([\d.]+)%/,
    });
    const shown = Number(
      /Relax Energy Recharge to ([\d.]+)%/.exec(relax.textContent ?? '')![1],
    );
    await user.click(relax);
    expect(onRelax).toHaveBeenCalledWith('er_pct', shown);
    expect(shown).toBeLessThan(500);
  });

  it('names the slot when a main-stat lock leaves it with no legal piece', () => {
    useInventory.setState({
      artifacts: SLOTS.map((s) => erPiece(s, 'EmblemOfSeveredFate')),
    });
    render(
      <Results
        onRelax={() => {}}
        result={infeasible}
        request={{
          ...realReq,
          constraints: { mainStatLocks: { circlet: 'crit_rate' } },
        }}
        artifactsById={{}}
      />,
    );
    expect(
      within(screen.getByTestId('infeasible-callout')).getByText(
        /You own no circlet with a CRIT Rate main stat/i,
      ),
    ).toBeInTheDocument();
  });

  it('names a set requirement the inventory cannot form', () => {
    useInventory.setState({
      artifacts: [erPiece('flower', 'EmblemOfSeveredFate')],
    });
    render(
      <Results
        onRelax={() => {}}
        result={infeasible}
        request={{
          ...realReq,
          constraints: {
            setRequirement: { kind: '4pc', setKey: 'EmblemOfSeveredFate' },
          },
        }}
        artifactsById={{}}
      />,
    );
    expect(
      within(screen.getByTestId('infeasible-callout')).getByText(
        /You own 1 Emblem of Severed Fate piece across slots — need 4/i,
      ),
    ).toBeInTheDocument();
  });

  it('falls back to the generic advice when no single constraint is to blame', () => {
    // A complete roster and no constraints: nothing is individually to blame,
    // so there is nothing honest to name.
    useInventory.setState({
      artifacts: SLOTS.map((s) => erPiece(s, 'EmblemOfSeveredFate')),
    });
    render(
      <Results
        onRelax={() => {}}
        result={infeasible}
        request={realReq}
        artifactsById={{}}
      />,
    );
    expect(
      within(screen.getByTestId('infeasible-callout')).getByText(
        /Try relaxing the set requirement/i,
      ),
    ).toBeInTheDocument();
  });
});

describe('Results — desktop comparison grid', () => {
  it('lays the cards out two-up from md with rank 1 spanning both columns', () => {
    const r: OptimizeResult = {
      status: 'ok',
      explored: 100,
      pruned: 50,
      builds: [scored(240, 'c1'), scored(230, 'c2')],
    };
    const { container } = render(
      <Results
        onRelax={() => {}}
        result={r}
        request={req}
        artifactsById={circletsById}
      />,
    );
    const grid = container.querySelector('[class~="md:grid-cols-2"]');
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass('grid');
    expect(grid!.firstElementChild).toHaveClass('md:col-span-2');
    expect(grid!.children).toHaveLength(2);
  });
});
