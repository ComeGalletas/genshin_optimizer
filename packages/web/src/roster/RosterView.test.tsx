import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RosterView as View } from './RosterView';
import { CharacterWindow } from '../character-window/CharacterWindow';
import { useCharacterWindow } from '../character-window/store';

/** The roster with the app's one character window, as the app mounts it. */
function RosterView() {
  return (
    <>
      <View />
      <CharacterWindow />
    </>
  );
}
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { addArtifacts, resetOptimizeRequest } from '../test-utils/stores';

/** A full set for Neuvillette: main stats he accepts (an HP% sands, a Hydro
 *  goblet, a crit circlet) and crit substats on every piece. */
const SLOTS_FOR_NEUVILLETTE: [Artifact['slot'], Artifact['mainStat']][] = [
  ['flower', 'hp'],
  ['plume', 'atk'],
  ['sands', 'hp_pct'],
  ['goblet', 'elemental_dmg'],
  ['circlet', 'crit_rate'],
];

function equipped(id: string, location: string, i = 0): Artifact {
  const [slot, mainStat] = SLOTS_FOR_NEUVILLETTE[i % 5];
  return {
    id,
    setKey: 'EmblemOfSeveredFate',
    slot,
    rarity: 5,
    level: 20,
    mainStat,
    mainStatValue: 46.6,
    ...(slot === 'goblet' && { element: 'hydro' as const }),
    subStats: [
      { key: 'crit_rate', value: 10 },
      { key: 'crit_dmg', value: 20 },
    ],
    location,
  };
}

describe('RosterView', () => {
  beforeEach(() => {
    useRoster.getState().clear();
    useInventory.getState().clear();
    useCharacterWindow.getState().close();
  });

  it('prompts for an import when the roster is empty', () => {
    render(<RosterView />);
    expect(
      screen.getByText(/Import a GOOD file to see your roster\./i),
    ).toBeInTheDocument();
  });

  it('tints the element name with that element’s hue, name still written', () => {
    useRoster.getState().setRoster({ neuvillette: {}, amber: {} });
    render(<RosterView />);
    // Colour is a second channel, never the only one: the word is still there.
    expect(screen.getByText('Hydro')).toHaveClass('text-element-hydro');
    expect(screen.getByText('Pyro')).toHaveClass('text-element-pyro');
  });

  it('renders every entry with a band, and the breakdown on expand', async () => {
    const user = userEvent.setup();
    useRoster.getState().setRoster({
      neuvillette: {
        buildLevel: 90,
        level: 90,
        talents: { auto: 9, skill: 9, burst: 9 },
        weaponKey: "amos'_bow",
        weaponLevel: 90,
      },
      amber: {},
    });
    addArtifacts(
      Array.from({ length: 5 }, (_, i) => equipped(`n${i}`, 'neuvillette', i)),
    );

    render(<RosterView />);
    expect(screen.getByText('Neuvillette')).toBeInTheDocument();
    expect(screen.getByText('Amber')).toBeInTheDocument();
    // Neuvillette: readiness 100, three accepted main stats and about 25
    // crit rolls, so Built. Amber has no curated build: No recipe, not
    // Unbuilt (ADR-0057).
    expect(screen.getByText('Built')).toBeInTheDocument();
    expect(screen.getByText('No recipe')).toBeInTheDocument();
    // The score states its scale.
    expect(screen.getAllByText('/ 100').length).toBeGreaterThan(0);
    // Amber has nothing equipped — say so rather than silently capping.
    expect(
      screen.getByText(
        /No equipped artifacts found — 14 readiness points unscored/i,
      ),
    ).toBeInTheDocument();
    // Each row also gives artifact quality (ADR-0057): a score for
    // Neuvillette, "no recipe" for Amber, who has no curated build.
    const quality = screen.getAllByTestId('quality');
    expect(quality).toHaveLength(2);
    expect(quality[0]).toHaveTextContent(/^Artifacts \d+(\.\d)?$/);
    expect(quality[1]).toHaveTextContent('Artifacts no recipe');

    // Built characters sort first. Rows carry no heading: an <h3> inside a
    // <button> loses its heading role anyway.
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    const names = screen
      .getAllByRole('listitem')
      .map(
        (li) => li.querySelector('[data-testid="roster-name"]')?.textContent,
      );
    expect(names[0]).toBe('Neuvillette');

    expect(screen.queryByText('Artifact quality')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Neuvillette/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // Both scores, each with how it's worked out.
    expect(
      screen.getByRole('region', { name: 'Combat readiness' }),
    ).toHaveTextContent('Talents');
    expect(
      screen.getByRole('region', { name: 'Artifact quality' }),
    ).toHaveTextContent(
      /Main stats \d of 3 · [\d.]+ good rolls of [\d.]+ possible/,
    );
  });

  // ADR-0057: on a levelled account most readiness ties at 100; crowns
  // break the tie, then the name.
  it('orders by readiness, then crowns, then name', () => {
    const full = (crowned: number) => ({
      buildLevel: 90 as const,
      level: 90,
      talents: {
        auto: crowned > 2 ? 10 : 9,
        skill: crowned > 0 ? 10 : 9,
        burst: crowned > 1 ? 10 : 9,
      },
      weaponLevel: 90,
    });
    useRoster.getState().setRoster({
      xingqiu: full(0),
      bennett: full(0),
      furina: full(2),
      nahida: full(1),
      amber: { buildLevel: 40 as const },
    });
    render(<RosterView />);
    const names = screen
      .getAllByTestId('roster-name')
      .map((n) => n.textContent);
    expect(names).toEqual(['Furina', 'Nahida', 'Bennett', 'Xingqiu', 'Amber']);
  });

  it('opens the character drawer on row click', async () => {
    const user = userEvent.setup();
    useRoster.getState().setRoster({ neuvillette: { level: 90 }, amber: {} });

    render(<RosterView />);
    await user.click(screen.getByRole('button', { name: /Neuvillette/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
  });

  it('prefills the optimise request from the drawer', async () => {
    const user = userEvent.setup();
    resetOptimizeRequest();
    useRoster.getState().setRoster({
      neuvillette: { level: 90, weaponKey: 'the_first_great_magic' },
    });

    render(<RosterView />);
    await user.click(screen.getByRole('button', { name: /Neuvillette/ }));
    await user.click(
      await screen.findByRole('button', { name: /optimise this character/i }),
    );
    expect(useOptimizeRequest.getState().characterKey).toBe('neuvillette');
    expect(useOptimizeRequest.getState().weaponKey).toBe(
      'the_first_great_magic',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows only the top 12 characters until "Show all" is clicked', async () => {
    const user = userEvent.setup();
    useRoster
      .getState()
      .setRoster(
        Object.fromEntries(
          Array.from({ length: 15 }, (_, i) => [
            `char_${i}`,
            { level: 90 - i },
          ]),
        ),
      );

    render(<RosterView />);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    await user.click(screen.getByRole('button', { name: /show all 15/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(15);
  });
});
