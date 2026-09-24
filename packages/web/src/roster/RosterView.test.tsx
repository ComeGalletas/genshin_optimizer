import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RosterView } from './RosterView';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import type { Artifact } from '@genshin-build-lab/engine/game/types';

function equipped(id: string, location: string): Artifact {
  return {
    id,
    setKey: 'EmblemOfSeveredFate',
    slot: 'flower',
    rarity: 5,
    level: 20,
    mainStat: 'hp',
    mainStatValue: 4780,
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
    useInventory
      .getState()
      .addMany(
        Array.from({ length: 5 }, (_, i) => equipped(`n${i}`, 'neuvillette')),
      );

    render(<RosterView />);
    expect(screen.getByText('Neuvillette')).toBeInTheDocument();
    expect(screen.getByText('Amber')).toBeInTheDocument();
    expect(screen.getByText('Built')).toBeInTheDocument();
    expect(screen.getByText('Unbuilt')).toBeInTheDocument();
    // The score states its scale.
    expect(screen.getAllByText('/ 100').length).toBeGreaterThan(0);
    // Amber has nothing equipped — say so rather than silently capping.
    expect(
      screen.getByText(/No equipped gear found — 40 pts unscored/i),
    ).toBeInTheDocument();

    // Built characters sort first. Rows carry no heading: an <h3> inside a
    // <button> loses its heading role anyway.
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    const names = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('span')?.textContent);
    expect(names[0]).toBe('Neuvillette');

    expect(screen.queryByText('Artifact quality')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Neuvillette/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Talents')).toBeInTheDocument();
    expect(screen.getByText('Artifact quality')).toBeInTheDocument();
  });

  it('opens the character drawer on row click', async () => {
    const user = userEvent.setup();
    useRoster.getState().setRoster({ neuvillette: { level: 90 }, amber: {} });

    render(<RosterView />);
    await user.click(screen.getByRole('button', { name: /Neuvillette/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
  });

  it('prefills the optimise request from the drawer', async () => {
    const user = userEvent.setup();
    useOptimizeRequest.getState().reset();
    useRoster.getState().setRoster({
      neuvillette: { level: 90, weaponKey: 'the_first_great_magic' },
    });

    render(<RosterView />);
    await user.click(screen.getByRole('button', { name: /Neuvillette/ }));
    await user.click(
      screen.getByRole('button', { name: /optimise this character/i }),
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
